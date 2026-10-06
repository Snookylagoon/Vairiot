import SwiftData
import XCTest
@testable import VairiotMobile

/// The attempt and state rules, run through the real scan queue over SwiftData.
@MainActor
final class QueueDrainerTests: XCTestCase {

    private var store: TestStore!

    override func setUp() async throws {
        store = TestStore()
    }

    private func seed(_ n: Int) {
        for i in 0..<n {
            // Distinct createdAt keeps the FIFO order deterministic.
            store.context.insert(QueuedScan(
                campaignId: "camp-1", tagValue: "TAG-\(i)", createdAt: Date(timeIntervalSince1970: Double(i))
            ))
        }
        try? store.context.save()
    }

    private var scans: [QueuedScan] {
        store.all(QueuedScan.self).sorted { $0.createdAt < $1.createdAt }
    }

    private func drain(_ server: FakeServer) async -> DrainReport {
        await drainQueue(SyncQueues.scans(context: store.context, api: server.api))
    }

    func testAcceptedRowsAreRemoved() async {
        seed(3)
        let report = await drain(FakeServer())
        XCTAssertEqual(report.outcome, .done)
        XCTAssertEqual(report.synced, 3)
        XCTAssertTrue(scans.isEmpty)
    }

    func testNetworkErrorMarksFailedStopsAndBurnsNoAttempt() async {
        seed(3)
        let server = FakeServer(offline)
        let report = await drain(server)

        XCTAssertEqual(report.outcome, .retry)
        XCTAssertEqual(server.scanRequests.count, 1, "stops after the first network error")
        XCTAssertEqual(scans.count, 3)
        XCTAssertEqual(scans[0].state, QueueState.failed)
        XCTAssertEqual(scans[0].attempts, 0)
        XCTAssertEqual(scans[1].state, QueueState.pending)
    }

    func testServerErrorMarksFailedWithoutAttemptAndMovesOn() async {
        seed(2)
        let report = await drain(FakeServer(APIError.serverError(503), "ok"))

        XCTAssertEqual(report.outcome, .retry)
        XCTAssertEqual(report.synced, 1)
        XCTAssertEqual(scans.count, 1)
        XCTAssertEqual(scans[0].state, QueueState.failed)
        XCTAssertEqual(scans[0].attempts, 0)
    }

    func testTransientFailuresNeverTurnIntoDeadRows() async {
        seed(1)
        for _ in 0..<20 { _ = await drain(FakeServer(APIError.serverError(500))) }
        XCTAssertEqual(scans.single?.state, QueueState.failed)
        XCTAssertEqual(scans.single?.attempts, 0)
    }

    func test4xxMovesRowToDeadWithServerMessage() async {
        seed(1)
        let report = await drain(FakeServer(rejected(400, "Blind campaigns require a locationId with each scan")))
        XCTAssertEqual(report.dead, 1)
        XCTAssertEqual(scans.single?.state, QueueState.dead)
        XCTAssertEqual(scans.single?.lastError, "HTTP 400: Blind campaigns require a locationId with each scan")
    }

    func test403AndNonDuplicate409AreKeptAsDead() async {
        seed(2)
        _ = await drain(FakeServer(APIError.forbidden, rejected(409, "Campaign is not in progress", code: "CAMPAIGN_NOT_ACTIVE")))
        XCTAssertEqual(scans.map(\.state), [QueueState.dead, QueueState.dead])
    }

    func testDuplicate409CountsAsSynced() async {
        seed(1)
        let report = await drain(FakeServer(rejected(409, "Already recorded", code: "DUPLICATE_REQUEST")))
        XCTAssertEqual(report.synced, 1)
        XCTAssertTrue(scans.isEmpty)
    }

    func test401PausesWithoutTouchingTheRow() async {
        seed(2)
        let server = FakeServer(APIError.unauthorized)
        let report = await drain(server)

        XCTAssertEqual(report.outcome, .pausedAuth)
        XCTAssertEqual(server.scanRequests.count, 1)
        for scan in scans {
            XCTAssertEqual(scan.state, QueueState.pending)
            XCTAssertEqual(scan.attempts, 0)
            XCTAssertNil(scan.lastError)
        }
    }

    func testNoFailureOfAnyKindDeletesARow() async {
        let failures: [Error] = [
            offline, timedOut, APIError.unauthorized, APIError.forbidden, APIError.notFound,
            rejected(409), rejected(422), APIError.serverError(500),
        ]
        for failure in failures {
            let isolated = TestStore()
            isolated.context.insert(QueuedScan(campaignId: "camp-1", tagValue: "TAG"))
            try? isolated.context.save()
            _ = await drainQueue(SyncQueues.scans(context: isolated.context, api: FakeServer(failure).api))
            XCTAssertEqual(isolated.all(QueuedScan.self).count, 1, "after \(failure)")
        }
    }

    func testDeadRowsWaitForTheUser() async {
        seed(1)
        _ = await drain(FakeServer(rejected(400)))
        let server = FakeServer()
        _ = await drain(server)
        XCTAssertTrue(server.scanRequests.isEmpty, "dead row must be skipped")

        scans[0].state = QueueState.pending // what Retry does
        _ = await drain(server)
        XCTAssertEqual(server.scanRequests.count, 1)
        XCTAssertTrue(scans.isEmpty)
    }

    func testEachRowIsTriedOncePerDrain() async {
        seed(3)
        let server = FakeServer(APIError.serverError(500), APIError.serverError(500), APIError.serverError(500))
        _ = await drain(server)
        XCTAssertEqual(server.scanRequests.count, 3)
    }

    func testLegacyDeadFlagIsCarriedOverToState() {
        let parked = QueuedScan(campaignId: "camp-1", tagValue: "OLD")
        parked.dead = true
        store.context.insert(parked)
        let asset = QueuedAssetCreate(name: "Old asset")
        asset.dead = true
        store.context.insert(asset)
        store.context.insert(QueuedScan(campaignId: "camp-1", tagValue: "LIVE"))
        try? store.context.save()

        QueueState.migrateLegacyFlags(in: store.context)

        XCTAssertEqual(store.all(QueuedScan.self).first { $0.tagValue == "OLD" }?.state, QueueState.dead)
        XCTAssertEqual(store.all(QueuedScan.self).first { $0.tagValue == "LIVE" }?.state, QueueState.pending)
        XCTAssertEqual(store.all(QueuedAssetCreate.self).single?.state, QueueState.dead)
    }
}

extension Array {
    var single: Element? { count == 1 ? first : nil }
}
