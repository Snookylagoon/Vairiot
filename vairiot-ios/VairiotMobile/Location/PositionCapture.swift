import CoreLocation
import Foundation

/// A GPS fix for an asset, in WGS 84 decimal degrees.
struct GeoFix: Equatable {
    let latitude: Double
    let longitude: Double
    /// Horizontal accuracy radius in metres (68% confidence).
    let accuracyMeters: Double
    let capturedAt: Date

    init(latitude: Double, longitude: Double, accuracyMeters: Double, capturedAt: Date) {
        // Six decimal places ≈ 0.1 m, the precision the server stores.
        self.latitude = (latitude * 1_000_000).rounded() / 1_000_000
        self.longitude = (longitude * 1_000_000).rounded() / 1_000_000
        self.accuracyMeters = (accuracyMeters * 10).rounded() / 10
        self.capturedAt = capturedAt
    }

    init(_ location: CLLocation) {
        self.init(
            latitude: location.coordinate.latitude,
            longitude: location.coordinate.longitude,
            accuracyMeters: location.horizontalAccuracy,
            capturedAt: location.timestamp
        )
    }
}

enum PositionCaptureError: LocalizedError, Equatable {
    case denied
    case unavailable
    case busy

    var errorDescription: String? {
        switch self {
        case .denied: "Location access is off for Vairiot. Turn it on in Settings › Privacy & Security › Location Services."
        case .unavailable: "Couldn't get a GPS fix. Move nearer a window or outdoors and try again."
        case .busy: "Already getting a position."
        }
    }
}

@MainActor
protocol PositionProviding {
    func currentFix() async throws -> GeoFix
}

/// Takes one GPS fix: asks for when-in-use permission if needed, then listens
/// until a reading is accurate to `targetAccuracy` or `timeout` passes, and
/// returns the best reading seen.
@MainActor
final class DevicePositionProvider: NSObject, PositionProviding {

    private let manager = CLLocationManager()
    private let targetAccuracy: CLLocationAccuracy
    private let timeout: Duration

    private var authContinuation: CheckedContinuation<CLAuthorizationStatus, Never>?
    private var fixContinuation: CheckedContinuation<GeoFix, Error>?
    private var best: CLLocation?
    private var startedAt = Date.distantPast
    private var timeoutTask: Task<Void, Never>?

    init(targetAccuracy: CLLocationAccuracy = 15, timeout: Duration = .seconds(15)) {
        self.targetAccuracy = targetAccuracy
        self.timeout = timeout
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
    }

    func currentFix() async throws -> GeoFix {
        guard fixContinuation == nil else { throw PositionCaptureError.busy }

        let status = await authorization()
        guard status == .authorizedWhenInUse || status == .authorizedAlways else {
            throw PositionCaptureError.denied
        }

        return try await withCheckedThrowingContinuation { continuation in
            fixContinuation = continuation
            best = nil
            startedAt = .now
            manager.startUpdatingLocation()
            timeoutTask = Task { [weak self, timeout] in
                try? await Task.sleep(for: timeout)
                guard !Task.isCancelled else { return }
                self?.finish(error: nil)
            }
        }
    }

    private func authorization() async -> CLAuthorizationStatus {
        let status = manager.authorizationStatus
        guard status == .notDetermined else { return status }
        return await withCheckedContinuation { continuation in
            authContinuation = continuation
            manager.requestWhenInUseAuthorization()
        }
    }

    private func authorizationChanged(_ status: CLAuthorizationStatus) {
        // The delegate also fires once on creation, before the user answers.
        guard status != .notDetermined, let continuation = authContinuation else { return }
        authContinuation = nil
        continuation.resume(returning: status)
    }

    private func received(_ locations: [CLLocation]) {
        guard fixContinuation != nil else { return }
        // Skip invalid readings and cached ones from before this capture.
        for location in locations where location.horizontalAccuracy >= 0
            && location.timestamp >= startedAt.addingTimeInterval(-2) {
            if best == nil || location.horizontalAccuracy < best!.horizontalAccuracy {
                best = location
            }
        }
        if let best, best.horizontalAccuracy <= targetAccuracy {
            finish(error: nil)
        }
    }

    private func failed(_ error: Error) {
        // locationUnknown is transient; keep listening until the timeout.
        if let clError = error as? CLError, clError.code == .locationUnknown { return }
        let denied = (error as? CLError)?.code == .denied
        finish(error: denied ? .denied : .unavailable)
    }

    private func finish(error: PositionCaptureError?) {
        guard let continuation = fixContinuation else { return }
        fixContinuation = nil
        manager.stopUpdatingLocation()
        timeoutTask?.cancel()
        timeoutTask = nil

        if let error {
            continuation.resume(throwing: error)
        } else if let best {
            continuation.resume(returning: GeoFix(best))
        } else {
            continuation.resume(throwing: PositionCaptureError.unavailable)
        }
    }
}

extension DevicePositionProvider: CLLocationManagerDelegate {
    // CLLocationManager calls back on the thread it was created on — main here.
    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        MainActor.assumeIsolated { authorizationChanged(status) }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        MainActor.assumeIsolated { received(locations) }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        MainActor.assumeIsolated { failed(error) }
    }
}
