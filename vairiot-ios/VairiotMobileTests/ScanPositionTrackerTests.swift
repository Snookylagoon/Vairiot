import XCTest
@testable import VairiotMobile

/// Stage 1.5: audit scans attach a recent fix and never wait for GPS.
@MainActor
final class ScanPositionTrackerTests: XCTestCase {

    private var now = Date(timeIntervalSince1970: 1_791_795_600)
    private func fix(at date: Date) -> GeoFix {
        GeoFix(latitude: 41.7151, longitude: 44.8271, accuracyMeters: 6, capturedAt: date)
    }

    func testNoFixUntilGpsHasAnswered() {
        let tracker = ScanPositionTracker(provider: FakePositionProvider(), clock: { self.now })
        XCTAssertNil(tracker.latest())
    }

    func testRecentFixIsAttachedAndAnOldOneIsNot() async {
        let tracker = ScanPositionTracker(provider: FakePositionProvider(.success(fix(at: now))),
                                          clock: { self.now }, maxAge: 60)
        await tracker.refreshOnce()
        XCTAssertEqual(tracker.latest()?.latitude, 41.7151)
        now = now.addingTimeInterval(61)
        XCTAssertNil(tracker.latest())
    }

    func testFailedRefreshKeepsTheLastGoodFix() async {
        let tracker = ScanPositionTracker(
            provider: FakePositionProvider(.success(fix(at: now)), .failure(PositionCaptureError.denied)),
            clock: { self.now })
        await tracker.refreshOnce()
        await tracker.refreshOnce()
        XCTAssertEqual(tracker.latest()?.longitude, 44.8271)
    }

    func testQueuedScanCarriesTheFixIntoItsRequest() {
        let scan = QueuedScan(campaignId: "c1", tagValue: "RFID-1", fix: fix(at: now))
        let request = scan.toRequest()
        XCTAssertEqual(request.latitude, 41.7151)
        XCTAssertEqual(request.longitude, 44.8271)
        XCTAssertEqual(request.geoAccuracyMeters, 6)
    }
}
