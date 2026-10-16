import SwiftData
import XCTest
@testable import VairiotMobile

/// Stage 1.8: scan photos carry their fields and wait for their scan.
@MainActor
final class ScanPhotoQueueTests: XCTestCase {

    func testScanPhotoFieldsCarryTypePositionAndTime() {
        let fix = GeoFix(latitude: 41.7151, longitude: 44.8271, accuracyMeters: 6,
                         capturedAt: Date(timeIntervalSince1970: 1_791_795_600))
        let photo = QueuedPhoto(fileName: "a.jpg", createdAt: Date(timeIntervalSince1970: 1_791_795_600),
                                campaignId: "c1", scanClientRequestId: "k1", photoType: "inventory", fix: fix)
        XCTAssertEqual(photo.scanPhotoFields, [
            "capturedAt": "2026-10-12T09:00:00Z", "photoType": "inventory",
            "latitude": "41.7151", "longitude": "44.8271", "geoAccuracyMeters": "6.0",
        ])
    }

    func testScanPhotoWaitsForItsScanThenUploadsThroughTheScanEndpoint() async throws {
        let store = TestStore()
        let context = store.context
        let files = PhotoFileStore(directory: FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true))
        let scan = QueuedScan(campaignId: "c1", tagValue: "RFID-1")
        context.insert(scan)
        let name = try files.save(Data([0xff, 0xd8, 0xff, 0xd9]))
        context.insert(QueuedPhoto(fileName: name, campaignId: "c1", scanClientRequestId: scan.id.uuidString))
        try context.save()

        var sent: [(String, String)] = []
        var api = SyncAPI(recordScan: { _, _ in throw URLError(.notConnectedToInternet) },
                          createAsset: { _ in throw URLError(.notConnectedToInternet) },
                          uploadPhoto: { _, _, _ in XCTFail("asset endpoint used") })
        api.uploadScanPhoto = { campaignId, scanRef, _, _, _ in sent.append((campaignId, scanRef)) }
        let queue = SyncQueues.photos(context: context, api: api, files: files)

        XCTAssertTrue(queue.nextBatch().isEmpty, "photo must wait while its scan is queued")
        context.delete(scan)
        try context.save()
        let batch = queue.nextBatch()
        XCTAssertEqual(batch.count, 1)
        try await queue.send(batch[0])
        XCTAssertEqual(sent.map(\.0), ["c1"])
        XCTAssertEqual(sent.map(\.1), [scan.id.uuidString])
    }
}
