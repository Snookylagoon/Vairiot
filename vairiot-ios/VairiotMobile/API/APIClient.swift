import Foundation
import os

// MARK: - API Error

enum APIError: LocalizedError {
    case unauthorized
    case forbidden
    case notFound
    case serverError(Int)
    case networkError(Error)
    case decodingError(Error)
    case invalidURL
    case noData

    var userMessage: String {
        errorDescription ?? "An unexpected error occurred."
    }

    var errorDescription: String? {
        switch self {
        case .unauthorized:          return "Session expired. Please log in again."
        case .forbidden:             return "You do not have permission to perform this action."
        case .notFound:              return "The requested resource was not found."
        case .serverError(let code): return "Server error (\(code)). Please try again later."
        case .networkError(let err): return "Network error: \(err.localizedDescription)"
        case .decodingError(let err):return "Data error: \(err.localizedDescription)"
        case .invalidURL:            return "Invalid request URL."
        case .noData:                return "No data received from server."
        }
    }
}

// MARK: - API Client

final class APIClient: Sendable {

    static let shared = APIClient()

    let baseURL: URL
    private let session: URLSession
    private let tokenManager: TokenManager
    private let logger = Logger(subsystem: "com.vairiot.mobile", category: "API")
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    init(
        baseURL: URL = URL(string: "https://vai.vairiot.com/")!,
        session: URLSession = .shared,
        tokenManager: TokenManager = .shared
    ) {
        self.baseURL = baseURL
        self.session = session
        self.tokenManager = tokenManager

        self.encoder = JSONEncoder()
        self.decoder = JSONDecoder()
    }

    // MARK: - Generic Request

    func request<T: Decodable>(_ endpoint: APIEndpoint) async throws -> T {
        let data = try await performRequest(endpoint, attemptRefresh: true)
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            logDebug("Decode error: \(error)")
            throw APIError.decodingError(error)
        }
    }

    func requestVoid(_ endpoint: APIEndpoint) async throws {
        _ = try await performRequest(endpoint, attemptRefresh: true)
    }

    // MARK: - Multipart Upload

    func upload<T: Decodable>(
        path: String,
        imageData: Data,
        thumbData: Data?
    ) async throws -> T {
        guard let url = URL(string: path, relativeTo: baseURL) else {
            throw APIError.invalidURL
        }

        let boundary = "Boundary-\(UUID().uuidString)"
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        injectAuth(&request)

        var body = Data()

        // Photo part
        body.appendMultipart(
            boundary: boundary,
            name: "photo",
            filename: "photo.jpg",
            mimeType: "image/jpeg",
            data: imageData
        )

        // Thumb part (optional)
        if let thumbData {
            body.appendMultipart(
                boundary: boundary,
                name: "thumb",
                filename: "thumb.jpg",
                mimeType: "image/jpeg",
                data: thumbData
            )
        }

        body.append("--\(boundary)--\r\n".data(using: .utf8)!)
        request.httpBody = body

        logDebug("UPLOAD \(url.absoluteString) (\(body.count) bytes)")

        do {
            let (data, response) = try await session.data(for: request)
            try validateResponse(response, data: data)
            return try decoder.decode(T.self, from: data)
        } catch let error as APIError {
            throw error
        } catch {
            throw APIError.networkError(error)
        }
    }

    // MARK: - Download (raw Data)

    func downloadData(_ endpoint: APIEndpoint) async throws -> Data {
        try await performRequest(endpoint, attemptRefresh: true)
    }

    // MARK: - Private

    private func performRequest(_ endpoint: APIEndpoint, attemptRefresh: Bool) async throws -> Data {
        let urlRequest = try buildURLRequest(endpoint)
        logDebug("\(endpoint.method.rawValue) \(urlRequest.url?.absoluteString ?? "?")")

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: urlRequest)
        } catch {
            throw APIError.networkError(error)
        }

        // Handle 401 with automatic token refresh
        if let httpResponse = response as? HTTPURLResponse,
           httpResponse.statusCode == 401,
           attemptRefresh,
           endpoint.path != "api/v1/auth/login",
           endpoint.path != "api/v1/auth/refresh"
        {
            logDebug("401 received, attempting token refresh")
            do {
                try await refreshTokens()
                return try await performRequest(endpoint, attemptRefresh: false)
            } catch {
                logDebug("Token refresh failed: \(error)")
                tokenManager.clear()
                throw APIError.unauthorized
            }
        }

        try validateResponse(response, data: data)

        #if DEBUG
        if let json = String(data: data.prefix(500), encoding: .utf8) {
            logDebug("Response body: \(json)")
        }
        #endif

        return data
    }

    private func refreshTokens() async throws {
        guard let currentRefresh = tokenManager.refreshToken else {
            throw APIError.unauthorized
        }

        let refreshEndpoint = APIEndpoint.refresh(RefreshRequest(refreshToken: currentRefresh))
        let urlRequest = try buildURLRequest(refreshEndpoint)
        let (data, response) = try await session.data(for: urlRequest)
        try validateResponse(response, data: data)

        let refreshResponse = try decoder.decode(RefreshResponse.self, from: data)
        let tokens = AuthTokens(
            accessToken: refreshResponse.accessToken,
            refreshToken: refreshResponse.refreshToken,
            expiresIn: refreshResponse.expiresIn
        )
        if let tenantId = tokenManager.tenantId {
            tokenManager.save(tokens: tokens, tenantId: tenantId)
        }
    }

    private func buildURLRequest(_ endpoint: APIEndpoint) throws -> URLRequest {
        guard var components = URLComponents(url: baseURL.appendingPathComponent(endpoint.path), resolvingAgainstBaseURL: true) else {
            throw APIError.invalidURL
        }

        if !endpoint.queryItems.isEmpty {
            components.queryItems = endpoint.queryItems
        }

        guard let url = components.url else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = endpoint.method.rawValue
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.timeoutInterval = 30

        if let body = endpoint.body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try encoder.encode(AnyEncodable(body))
        }

        injectAuth(&request)

        return request
    }

    private func injectAuth(_ request: inout URLRequest) {
        if let token = tokenManager.accessToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
    }

    private func validateResponse(_ response: URLResponse, data: Data) throws {
        guard let httpResponse = response as? HTTPURLResponse else { return }

        switch httpResponse.statusCode {
        case 200...299:
            return
        case 401:
            throw APIError.unauthorized
        case 403:
            throw APIError.forbidden
        case 404:
            throw APIError.notFound
        default:
            logDebug("HTTP \(httpResponse.statusCode): \(String(data: data.prefix(300), encoding: .utf8) ?? "")")
            throw APIError.serverError(httpResponse.statusCode)
        }
    }

    private func logDebug(_ message: String) {
        #if DEBUG
        logger.debug("\(message)")
        #endif
    }
}

// MARK: - Type Erasure for Encodable

private struct AnyEncodable: Encodable {
    private let encodeFunc: (Encoder) throws -> Void

    init(_ wrapped: any Encodable) {
        self.encodeFunc = wrapped.encode
    }

    func encode(to encoder: Encoder) throws {
        try encodeFunc(encoder)
    }
}

// MARK: - Data + Multipart

private extension Data {
    mutating func appendMultipart(
        boundary: String,
        name: String,
        filename: String,
        mimeType: String,
        data: Data
    ) {
        let header = [
            "--\(boundary)\r\n",
            "Content-Disposition: form-data; name=\"\(name)\"; filename=\"\(filename)\"\r\n",
            "Content-Type: \(mimeType)\r\n\r\n",
        ].joined()
        append(header.data(using: .utf8)!)
        append(data)
        append("\r\n".data(using: .utf8)!)
    }
}
