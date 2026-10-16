import XCTest
@testable import VairiotMobile

/// Stage 2.4: the asset's IPSAS class, read-only on the asset screen.
final class AssetClassLabelTests: XCTestCase {

    private func decode(_ json: String) throws -> AssetResponse {
        try JSONDecoder().decode(AssetResponse.self, from: Data(json.utf8))
    }

    func testClassWithItsRecognition() throws {
        let asset = try decode("""
        {"id":"a1","assetNumber":"AST-1","name":"Sign","status":"active","condition":"good",
         "assetClass":{"id":"c1","code":"SGN","name":"Road signs"},"recognitionStatus":"EXPENSED"}
        """)
        XCTAssertEqual(asset.assetClassLabel, "SGN · Road signs (expensed, below threshold)")
    }

    func testNoClassYetWaitsForFinance() throws {
        let asset = try decode("""
        {"id":"a1","assetNumber":"AST-1","name":"Sign","status":"active","condition":"good","recognitionStatus":"PENDING_REVIEW"}
        """)
        XCTAssertEqual(asset.assetClassLabel, "None yet (waiting for Finance)")
    }

    func testNothingWithoutAnIpsasLedgerOrFromAnOlderServer() throws {
        let asset = try decode("""
        {"id":"a1","assetNumber":"AST-1","name":"Sign","status":"active","condition":"good"}
        """)
        XCTAssertNil(asset.assetClassLabel)
    }

    @MainActor
    func testIpsasFlag() {
        let defaults = UserDefaults(suiteName: "AssetClassLabelTests")!
        defaults.removePersistentDomain(forName: "AssetClassLabelTests")
        let flags = FeatureFlags(defaults: defaults)
        XCTAssertFalse(flags.ipsasEnabled)
        flags.update(from: ["ipsas": true])
        XCTAssertTrue(flags.ipsasEnabled)
    }
}
