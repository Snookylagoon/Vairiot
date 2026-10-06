import SwiftData
import XCTest
@testable import VairiotMobile

@MainActor
final class AssetAndPhotoQueueTests: XCTestCase {

    private var store: TestStore!
    private var files: PhotoFileStore!

    override func setUp() async throws {
        store = TestStore()
        files = PhotoFileStore(directory: FileManager.default.temporaryDirectory
            .appendingPathComponent("QueuedPhotosTests-\(UUID().uuidString)"))
    }

    override func tearDown() async throws {
        try? FileManager.default.removeItem(at: files.directory)
    }

    private func photo(assetId: String? = nil, assetLocalId: UUID? = nil) throws -> QueuedPhoto {
        let row = QueuedPhoto(
            assetId: assetId,
            assetLocalId: assetLocalId,
            fileName: try files.save(Data("jpeg".utf8)),
            thumbFileName: try files.save(Data("thumb".utf8))
        )
        store.context.insert(row)
        try store.context.save()
        return row
    }

    // MARK: Assets

    func testAssetReplaySendsTheKeyGeneratedWhenQueued() async {
        let queued = QueuedAssetCreate(name: "Pump 4", rfidTag: "E200-1")
        store.context.insert(queued)
        let expectedKey = queued.localId.uuidString
        let server = FakeServer(offline)

        _ = await drainQueue(SyncQueues.assetCreates(context: store.context, api: server.api))
        _ = await drainQueue(SyncQueues.assetCreates(context: store.context, api: server.api))

        XCTAssertEqual(server.assetRequests.map(\.clientRequestId), [expectedKey, expectedKey])
        XCTAssertTrue(store.all(QueuedAssetCreate.self).isEmpty)
    }

    func testAsset4xxIsKeptAsDead() async {
        store.context.insert(QueuedAssetCreate(name: "Pump 4"))
        _ = await drainQueue(SyncQueues.assetCreates(
            context: store.context, api: FakeServer(rejected(422, "Asset limit reached")).api))
        XCTAssertEqual(store.all(QueuedAssetCreate.self).single?.state, QueueState.dead)
        XCTAssertEqual(store.all(QueuedAssetCreate.self).single?.lastError, "HTTP 422: Asset limit reached")
    }

    func testPhotosOfAnOfflineAssetWaitThenUploadOnceItExists() async throws {
        let asset = QueuedAssetCreate(name: "Pump 4")
        store.context.insert(asset)
        _ = try photo(assetLocalId: asset.localId)
        let server = FakeServer()

        _ = await drainQueue(SyncQueues.photos(context: store.context, api: server.api, files: files))
        XCTAssertTrue(server.photoUploads.isEmpty, "no asset id yet, nothing to upload")

        _ = await drainQueue(SyncQueues.assetCreates(context: store.context, api: server.api))
        XCTAssertEqual(store.all(QueuedPhoto.self).single?.assetId, "asset-1")

        _ = await drainQueue(SyncQueues.photos(context: store.context, api: server.api, files: files))
        XCTAssertEqual(server.photoUploads.single?.assetId, "asset-1")
        XCTAssertTrue(store.all(QueuedPhoto.self).isEmpty)
    }

    // MARK: Photos

    func testUploadedPhotoIsRemovedWithItsFiles() async throws {
        let row = try photo(assetId: "asset-9")
        let fileName = row.fileName, thumbName = row.thumbFileName!

        _ = await drainQueue(SyncQueues.photos(context: store.context, api: FakeServer().api, files: files))

        XCTAssertTrue(store.all(QueuedPhoto.self).isEmpty)
        XCTAssertFalse(files.exists(fileName))
        XCTAssertFalse(files.exists(thumbName))
    }

    func testOfflinePhotoKeepsRowAndFile() async throws {
        let row = try photo(assetId: "asset-9")
        let report = await drainQueue(SyncQueues.photos(context: store.context, api: FakeServer(offline).api, files: files))

        XCTAssertEqual(report.outcome, .retry)
        XCTAssertEqual(row.state, QueueState.failed)
        XCTAssertEqual(row.attempts, 0)
        XCTAssertTrue(files.exists(row.fileName))
    }

    func testRejectedPhotoIsDeadAndKeepsItsFileForRetry() async throws {
        let row = try photo(assetId: "asset-9")
        _ = await drainQueue(SyncQueues.photos(
            context: store.context, api: FakeServer(rejected(413, "File too large")).api, files: files))
        XCTAssertEqual(row.state, QueueState.dead)
        XCTAssertTrue(files.exists(row.fileName))
    }

    func testPhotoWhoseFileVanishedIsDeadNotRetriedForever() async throws {
        let row = try photo(assetId: "asset-9")
        files.delete(row.fileName)
        let server = FakeServer()

        _ = await drainQueue(SyncQueues.photos(context: store.context, api: server.api, files: files))

        XCTAssertTrue(server.photoUploads.isEmpty)
        XCTAssertEqual(row.state, QueueState.dead)
    }
}
