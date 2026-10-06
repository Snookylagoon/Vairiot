import SwiftData
import XCTest
@testable import VairiotMobile

/// Field flow: the recorder tries online; anything not accepted is replayed by
/// the scan queue with the same fields and the same idempotency key.
@MainActor
final class AuditScanRecorderTests: XCTestCase {

    private var store: TestStore!
    private var queuedCallbacks = 0

    override func setUp() async throws {
        store = TestStore()
        queuedCallbacks = 0
    }

    private func recordBlindScan(_ server: FakeServer, tag: String = "E2801170000002") async -> AuditScanRecorder.Outcome {
        let recorder = AuditScanRecorder(
            context: store.context,
            recordScan: { try server.recordScan($0, $1) },
            onQueued: { self.queuedCallbacks += 1 }
        )
        return await recorder.record(campaignId: "camp-blind", tagValue: tag, locationId: "loc-zone-a", condition: "fair")
    }

    func testOnlineBlindScanSendsZoneConditionAndKey() async {
        let server = FakeServer()
        let outcome = await recordBlindScan(server)

        guard case .recorded = outcome else { return XCTFail("expected recorded, got \(outcome)") }
        XCTAssertTrue(store.all(QueuedScan.self).isEmpty)
        let sent = server.scanRequests.single?.request
        XCTAssertEqual(sent?.locationId, "loc-zone-a", "blind scans must carry their zone")
        XCTAssertEqual(sent?.condition, "fair")
        XCTAssertNotNil(sent?.clientRequestId)
        XCTAssertNotNil(sent?.capturedAt)
    }

    func testOfflineScanKeepsFieldsAndKeyForTheReplay() async {
        let online = FakeServer(offline)
        let outcome = await recordBlindScan(online)

        XCTAssertEqual(outcome, .queued)
        XCTAssertEqual(queuedCallbacks, 1)
        let row = store.all(QueuedScan.self).single
        XCTAssertEqual(row?.state, QueueState.failed)
        XCTAssertEqual(row?.locationId, "loc-zone-a")
        XCTAssertEqual(row?.condition, "fair")

        let replay = FakeServer()
        let report = await drainQueue(SyncQueues.scans(context: store.context, api: replay.api))

        XCTAssertEqual(report.synced, 1)
        XCTAssertTrue(store.all(QueuedScan.self).isEmpty)
        let first = online.scanRequests.single?.request
        let again = replay.scanRequests.single?.request
        XCTAssertEqual(first?.clientRequestId, again?.clientRequestId, "same key on the online try and the replay")
        XCTAssertEqual(first?.capturedAt, again?.capturedAt)
        XCTAssertEqual(again?.locationId, "loc-zone-a")
        XCTAssertEqual(again?.condition, "fair")
    }

    func testServerRejectionIsKeptAsDeadNotReportedQueued() async {
        let outcome = await recordBlindScan(FakeServer(rejected(409, "Campaign is not in progress", code: "CAMPAIGN_NOT_ACTIVE")))

        XCTAssertEqual(outcome, .rejected("HTTP 409: Campaign is not in progress"))
        XCTAssertEqual(store.all(QueuedScan.self).single?.state, QueueState.dead)
        XCTAssertEqual(queuedCallbacks, 0)
    }

    func testSignedOutScanStaysPending() async {
        let outcome = await recordBlindScan(FakeServer(APIError.unauthorized))
        XCTAssertEqual(outcome, .queued)
        XCTAssertEqual(store.all(QueuedScan.self).single?.state, QueueState.pending)
    }

    func testEveryScanGetsItsOwnKey() async {
        let server = FakeServer()
        _ = await recordBlindScan(server, tag: "TAG-1")
        _ = await recordBlindScan(server, tag: "TAG-2")
        XCTAssertEqual(Set(server.scanRequests.compactMap(\.request.clientRequestId)).count, 2)
    }
}
