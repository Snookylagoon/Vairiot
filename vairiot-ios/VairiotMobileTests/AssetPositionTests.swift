import SwiftData
import XCTest
@testable import VairiotMobile

/// Hands out scripted fixes or errors instead of asking CoreLocation.
@MainActor
final class FakePositionProvider: PositionProviding {
    var results: [Result<GeoFix, Error>]
    init(_ results: Result<GeoFix, Error>...) { self.results = results }

    func currentFix() async throws -> GeoFix {
        try results.removeFirst().get()
    }
}

@MainActor
final class AssetPositionTests: XCTestCase {

    private let fix = GeoFix(
        latitude: 41.71512345, longitude: 44.82712345, accuracyMeters: 6.04,
        capturedAt: Date(timeIntervalSince1970: 1_791_795_600) // 2026-10-12T09:00:00Z
    )

    private func asset(latitude: Double? = nil, longitude: Double? = nil) -> AssetResponse {
        AssetResponse(
            id: "a1", assetNumber: "AST-000001", name: "Pump", description: nil, status: "active",
            condition: "good", serialNumber: nil, barcode: nil, rfidTag: nil,
            category: nil, site: nil, location: nil,
            latitude: latitude, longitude: longitude, geoAccuracyMeters: latitude == nil ? nil : 4, geoSource: "manual"
        )
    }

    /// A tenant with GIS switched on (D7), isolated from the app's own defaults.
    private func gisOn() -> FeatureFlags {
        let defaults = UserDefaults(suiteName: "AssetPositionTests")!
        defaults.removePersistentDomain(forName: "AssetPositionTests")
        let flags = FeatureFlags(defaults: defaults)
        flags.update(from: ["gis": true])
        return flags
    }

    private func json(_ value: some Encodable) throws -> [String: Any] {
        try JSONSerialization.jsonObject(with: JSONEncoder().encode(value)) as! [String: Any]
    }

    // MARK: GeoFix

    func testFixIsRoundedToServerPrecision() {
        XCTAssertEqual(fix.latitude, 41.715123)
        XCTAssertEqual(fix.longitude, 44.827123)
        XCTAssertEqual(fix.accuracyMeters, 6.0)
    }

    // MARK: Update request encoding

    func testUpdateWithoutPositionChangeSendsNoGeoKeys() throws {
        let body = try json(AssetUpdateRequest(name: "Pump"))
        XCTAssertEqual(body["name"] as? String, "Pump")
        XCTAssertNil(body["latitude"])
        XCTAssertNil(body["longitude"])
    }

    func testClearingSendsExplicitNulls() throws {
        var request = AssetUpdateRequest(name: "Pump", latitude: 1, longitude: 2)
        request.clearGeoPosition = true
        let body = try json(request)
        XCTAssertTrue(body["latitude"] is NSNull)
        XCTAssertTrue(body["longitude"] is NSNull)
    }

    // MARK: Edit form

    func testEditFormShowsServerPositionButDoesNotResendIt() {
        let vm = AssetEditViewModel(apiClient: APIClient(), existingAsset: asset(latitude: 41.7, longitude: 44.8),
                                    positionProvider: FakePositionProvider())
        XCTAssertEqual(vm.position?.coordinateText, "41.700000, 44.800000")
        XCTAssertEqual(vm.position?.detailText, "±4 m · Entered manually")
        let request = vm.updateRequest()
        XCTAssertNil(request.latitude)
        XCTAssertFalse(request.clearGeoPosition)
    }

    func testCapturedPositionIsSentAsADeviceFix() async {
        let vm = AssetEditViewModel(apiClient: APIClient(), existingAsset: asset(),
                                    positionProvider: FakePositionProvider(.success(fix)), featureFlags: gisOn())
        await vm.capturePosition()

        XCTAssertEqual(vm.position, AssetPosition(fix))
        let request = vm.updateRequest()
        XCTAssertEqual(request.latitude, 41.715123)
        XCTAssertEqual(request.longitude, 44.827123)
        XCTAssertEqual(request.geoAccuracyMeters, 6.0)
        XCTAssertEqual(request.geoSource, "device")
        XCTAssertEqual(request.geoCapturedAt, "2026-10-12T09:00:00Z")
    }

    func testRemovingAPositionClearsItOnTheServer() {
        let vm = AssetEditViewModel(apiClient: APIClient(), existingAsset: asset(latitude: 41.7, longitude: 44.8),
                                    positionProvider: FakePositionProvider(), featureFlags: gisOn())
        vm.removePosition()
        XCTAssertNil(vm.position)
        XCTAssertTrue(vm.updateRequest().clearGeoPosition)
    }

    func testNoPositionIsSentWhileGisIsOff() async {
        let defaults = UserDefaults(suiteName: "AssetPositionTests.off")!
        defaults.removePersistentDomain(forName: "AssetPositionTests.off")
        let vm = AssetEditViewModel(apiClient: APIClient(), existingAsset: asset(latitude: 41.7, longitude: 44.8),
                                    positionProvider: FakePositionProvider(.success(fix)),
                                    featureFlags: FeatureFlags(defaults: defaults))
        await vm.capturePosition()
        let request = vm.updateRequest()
        XCTAssertNil(request.latitude)
        XCTAssertFalse(request.clearGeoPosition)
    }

    func testDeniedPermissionExplainsAndKeepsThePosition() async {
        let vm = AssetEditViewModel(apiClient: APIClient(), existingAsset: asset(latitude: 41.7, longitude: 44.8),
                                    positionProvider: FakePositionProvider(.failure(PositionCaptureError.denied)))
        await vm.capturePosition()
        XCTAssertTrue(vm.positionAccessDenied)
        XCTAssertNotNil(vm.positionError)
        XCTAssertEqual(vm.position?.latitude, 41.7)
        XCTAssertFalse(vm.positionChanged)
        XCTAssertFalse(vm.isCapturingPosition)
    }

    // MARK: Offline queue and cache

    func testQueuedCreateReplaysItsFix() async {
        let store = TestStore()
        store.context.insert(QueuedAssetCreate(name: "Pump 4", geoFix: fix))
        store.context.insert(QueuedAssetCreate(name: "Pump 5"))
        let server = FakeServer()
        _ = await drainQueue(SyncQueues.assetCreates(context: store.context, api: server.api))

        let sent = Dictionary(uniqueKeysWithValues: server.assetRequests.map { ($0.name, $0) })
        XCTAssertEqual(sent["Pump 4"]?.latitude, 41.715123)
        XCTAssertEqual(sent["Pump 4"]?.longitude, 44.827123)
        XCTAssertEqual(sent["Pump 4"]?.geoAccuracyMeters, 6.0)
        XCTAssertEqual(sent["Pump 4"]?.geoSource, "device")
        XCTAssertEqual(sent["Pump 4"]?.geoCapturedAt, "2026-10-12T09:00:00Z")
        XCTAssertNil(sent["Pump 5"]?.latitude)
        XCTAssertNil(sent["Pump 5"]?.geoSource)
    }

    func testCacheKeepsThePosition() {
        let cached = CachedAsset(from: asset(latitude: 41.7, longitude: 44.8))
        let back = cached.toAssetResponse()
        XCTAssertEqual(back.latitude, 41.7)
        XCTAssertEqual(back.longitude, 44.8)
        XCTAssertEqual(back.geoAccuracyMeters, 4)
        XCTAssertEqual(back.geoSource, "manual")

        cached.update(from: asset())
        XCTAssertNil(cached.latitude)
    }
}
