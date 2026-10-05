import Foundation

/// How a queue row's sync failure is treated. Same rules as Android
/// (vairiot-mobile sync/SyncFailure.kt).
enum SyncFailureKind: Equatable {
    /// No connectivity or a timeout. Row -> failed, drain stops, no attempt counted.
    case network
    /// The session was rejected (401). Row untouched, sync pauses until sign-in.
    case auth
    /// The server is struggling (5xx, 408, 429). Row -> failed, no attempt counted.
    case transient
    /// The server rejected this payload (any other 4xx). Row -> dead with the server's message.
    case permanent
    /// 409 saying the record already exists — an earlier attempt landed. Success.
    case duplicate
}

struct SyncFailure: Equatable {
    let kind: SyncFailureKind
    let message: String
}

/// A queued row that can never be sent as-is (e.g. its photo file is gone).
struct UnsendableError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

/// 409 codes meaning "you already sent this". The API currently answers a
/// replayed clientRequestId with 201 and the original record; its real 409s
/// (CAMPAIGN_NOT_ACTIVE, ZONE_LOCKED, ALREADY_DISPOSED) are rejections, and
/// treating those as success would delete a scan the server never stored.
private let duplicateCodes: Set<String> = ["DUPLICATE_REQUEST"]

func classifySyncFailure(_ error: Error) -> SyncFailure {
    if let unsendable = error as? UnsendableError {
        return SyncFailure(kind: .permanent, message: unsendable.message)
    }
    if error is URLError {
        return SyncFailure(kind: .network, message: error.localizedDescription)
    }
    guard let apiError = error as? APIError else {
        // Unexpected client-side error. Retrying is safe: the replay carries
        // the same clientRequestId and the server dedupes it.
        return SyncFailure(kind: .transient, message: error.localizedDescription)
    }
    switch apiError {
    case .networkError:
        return SyncFailure(kind: .network, message: apiError.userMessage)
    case .unauthorized:
        return SyncFailure(kind: .auth, message: apiError.userMessage)
    case .forbidden:
        return SyncFailure(kind: .permanent, message: "HTTP 403: \(apiError.userMessage)")
    case .notFound:
        return SyncFailure(kind: .permanent, message: "HTTP 404: \(apiError.userMessage)")
    case .rejected(let status, let message, let code):
        let text = "HTTP \(status): \(message ?? "Request rejected")"
        if status == 408 || status == 429 { return SyncFailure(kind: .transient, message: text) }
        if status == 409, let code, duplicateCodes.contains(code) {
            return SyncFailure(kind: .duplicate, message: text)
        }
        return SyncFailure(kind: .permanent, message: text)
    case .serverError(let status):
        return SyncFailure(kind: .transient, message: "HTTP \(status): \(apiError.userMessage)")
    case .invalidURL:
        return SyncFailure(kind: .permanent, message: apiError.userMessage)
    case .decodingError, .noData:
        return SyncFailure(kind: .transient, message: apiError.userMessage)
    }
}
