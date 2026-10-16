import XCTest
@testable import VairiotMobile

/// GIS screens are shown only when the tenant has `gis` on (D7, stage 0.9),
/// and the answer survives a restart so offline screens agree with the server.
@MainActor
final class FeatureFlagsTests: XCTestCase {

    private var defaults: UserDefaults!

    override func setUp() {
        super.setUp()
        defaults = UserDefaults(suiteName: "FeatureFlagsTests")
        defaults.removePersistentDomain(forName: "FeatureFlagsTests")
    }

    func testOffUntilTheServerSwitchesItOn() {
        let flags = FeatureFlags(defaults: defaults)
        XCTAssertFalse(flags.gisEnabled)
        flags.update(from: ["gis": false, "blindAudit": true])
        XCTAssertFalse(flags.gisEnabled)
        XCTAssertTrue(flags.isEnabled("blindAudit"))
    }

    func testOnlyTrueSwitchesAModuleOn() {
        let flags = FeatureFlags(defaults: defaults)
        flags.update(from: ["gis": true])
        XCTAssertTrue(flags.gisEnabled)
        flags.update(from: nil)
        XCTAssertFalse(flags.gisEnabled)
    }

    func testCachedAcrossInstances() {
        FeatureFlags(defaults: defaults).update(from: ["gis": true])
        XCTAssertTrue(FeatureFlags(defaults: defaults).gisEnabled)
    }
}
