import XCTest
@testable import VairiotMobile

/// Stage 1.15: graded condition on audit scans.
@MainActor
final class ConditionGradeTests: XCTestCase {

    func testQueuedScanSendsItsGrade() {
        let scan = QueuedScan(campaignId: "c1", tagValue: "RFID-1")
        scan.conditionGrade = 2
        XCTAssertEqual(scan.toRequest().conditionGrade, 2)
        XCTAssertNil(scan.toRequest().condition)
    }

    func testBuiltInScaleMatchesTheServerDefault() {
        let scale = ConditionScaleEntry.defaultScale
        XCTAssertEqual(scale.map(\.grade), [5, 4, 3, 2, 1])
        XCTAssertEqual(scale.filter(\.photoRequired).map(\.grade), [2, 1])
    }

    func testScaleDecodesFromTheApi() throws {
        let json = ##"{"source":"tenant","entries":[{"grade":3,"label":"Worn","criteria":"Faded.","colour":"#d97706","impairmentIndicator":false,"photoRequired":true}]}"##
        let scale = try JSONDecoder().decode(ConditionScaleResponse.self, from: Data(json.utf8))
        XCTAssertEqual(scale.entries.first?.label, "Worn")
        XCTAssertTrue(scale.entries.first?.photoRequired ?? false)
    }
}
