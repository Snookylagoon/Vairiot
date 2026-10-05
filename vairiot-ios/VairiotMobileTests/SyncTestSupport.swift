import Foundation
import SwiftData
import XCTest
@testable import VairiotMobile

// Errors as APIClient throws them.
let offline = APIError.networkError(URLError(.notConnectedToInternet))
let timedOut = APIError.networkError(URLError(.timedOut))
func rejected(_ status: Int, _ message: String = "Rejected", code: String? = nil) -> APIError {
    .rejected(status: status, message: message, code: code)
}

/// In-memory SwiftData store with the app's real schema.
@MainActor
final class TestStore {
    let container: ModelContainer
    var context: ModelContext { container.mainContext }

    init() {
        container = try! ModelContainer(
            for: VairiotStore.schema,
            configurations: ModelConfiguration(isStoredInMemoryOnly: true)
        )
    }

    func all<T: PersistentModel>(_ type: T.Type) -> [T] {
        (try? context.fetch(FetchDescriptor<T>())) ?? []
    }
}

/// Plays the server. Each call consumes the next scripted result: an `Error`
/// is thrown, anything else means "accepted". Once the script runs out every
/// call succeeds. All requests are recorded.
final class FakeServer {
    private var script: [Any]
    private(set) var scanRequests: [(campaignId: String, request: RecordScanRequest)] = []
    private(set) var assetRequests: [AssetCreateRequest] = []
    private(set) var photoUploads: [(assetId: String, bytes: Int)] = []

    init(_ script: Any...) { self.script = script }

    private func next() throws {
        guard !script.isEmpty else { return }
        if let error = script.removeFirst() as? Error { throw error }
    }

    func recordScan(_ campaignId: String, _ request: RecordScanRequest) throws -> AuditScanEventResponse {
        scanRequests.append((campaignId, request))
        try next()
        return AuditScanEventResponse(
            id: "ev-\(scanRequests.count)", campaignId: campaignId, tagValue: request.tagValue,
            assetId: nil, result: request.locationId == nil ? "found" : "recorded",
            scannedAt: "2026-10-05T10:00:00Z"
        )
    }

    func createAsset(_ request: AssetCreateRequest) throws -> AssetResponse {
        assetRequests.append(request)
        try next()
        return AssetResponse(
            id: "asset-\(assetRequests.count)", assetNumber: "AST-\(assetRequests.count)", name: request.name,
            description: nil, status: "active", condition: "good", serialNumber: nil,
            barcode: request.barcode, rfidTag: request.rfidTag, category: nil, site: nil, location: nil
        )
    }

    func uploadPhoto(_ assetId: String, _ image: Data) throws {
        photoUploads.append((assetId, image.count))
        try next()
    }

    var api: SyncAPI {
        SyncAPI(
            recordScan: { try self.recordScan($0, $1) },
            createAsset: { try self.createAsset($0) },
            uploadPhoto: { assetId, image, _ in try self.uploadPhoto(assetId, image) }
        )
    }
}
