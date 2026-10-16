import Foundation

/// Keeps a recent GPS fix while an audit is open, so each scan can carry the
/// device position without waiting for GPS (stage 1.5). Mirrors the Android
/// `ScanPositionTracker`. A scan takes `latest()`, which is nil when there is
/// no fix younger than `maxAge`, when permission is missing, or when GIS is off.
@MainActor
final class ScanPositionTracker {

    private let provider: PositionProviding
    private let clock: () -> Date
    private let refreshEvery: TimeInterval
    private let maxAge: TimeInterval
    private var fix: GeoFix?
    private var task: Task<Void, Never>?

    init(
        provider: PositionProviding,
        clock: @escaping () -> Date = Date.init,
        refreshEvery: TimeInterval = 20,
        maxAge: TimeInterval = 60
    ) {
        self.provider = provider
        self.clock = clock
        self.refreshEvery = refreshEvery
        self.maxAge = maxAge
    }

    /// Refreshes the fix until `stop()` or until the tracker is released. Idempotent.
    func start() {
        guard task == nil else { return }
        let interval = UInt64(refreshEvery * 1_000_000_000)
        task = Task { [weak self] in
            while !Task.isCancelled {
                guard let self else { return }
                await self.refreshOnce()
                try? await Task.sleep(nanoseconds: interval)
            }
        }
    }

    func stop() {
        task?.cancel()
        task = nil
    }

    /// One attempt; a failure (no permission, GPS off, busy) keeps the last fix.
    func refreshOnce() async {
        if let next = try? await provider.currentFix() { fix = next }
    }

    /// The current fix if it is recent enough to describe where the scan happened.
    func latest() -> GeoFix? {
        guard let fix, clock().timeIntervalSince(fix.capturedAt) <= maxAge else { return nil }
        return fix
    }
}
