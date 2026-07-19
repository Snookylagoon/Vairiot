import Foundation
import Network
import SwiftData

/// Watches connectivity and drains the offline queues (`QueuedAssetCreate`,
/// then `QueuedScan`) whenever the network comes back or the app foregrounds.
///
/// Mirrors the Android `ScanSyncWorker`: FIFO drain, delete on success, stop
/// early when the device is still offline or the session is rejected. Records
/// that exhaust `maxAttempts` are parked (`dead = true`) for the user to retry
/// or discard — never silently deleted.
@MainActor
final class SyncManager {

    static let shared = SyncManager()

    private static let maxAttempts = 5

    private let apiClient: APIClient = .shared
    private let monitor = NWPathMonitor()
    private var isSyncing = false

    private(set) var isOnline = true

    private var context: ModelContext { VairiotStore.shared.context }

    private init() {}

    /// Call once at app launch to begin watching connectivity.
    func start() {
        monitor.pathUpdateHandler = { [weak self] path in
            Task { @MainActor in
                guard let self else { return }
                let nowOnline = path.status == .satisfied
                let cameOnline = nowOnline && !self.isOnline
                self.isOnline = nowOnline
                if cameOnline { await self.syncNow() }
            }
        }
        monitor.start(queue: DispatchQueue(label: "com.vairiot.network-monitor"))
    }

    /// Number of records still waiting to sync (for UI badges).
    var pendingCount: Int {
        let creates = (try? context.fetchCount(
            FetchDescriptor<QueuedAssetCreate>(predicate: #Predicate { !$0.dead }))) ?? 0
        let scans = (try? context.fetchCount(
            FetchDescriptor<QueuedScan>(predicate: #Predicate { !$0.dead }))) ?? 0
        return creates + scans
    }

    /// Records that exhausted their sync attempts and await a user decision.
    var failedCount: Int {
        let creates = (try? context.fetchCount(
            FetchDescriptor<QueuedAssetCreate>(predicate: #Predicate { $0.dead }))) ?? 0
        let scans = (try? context.fetchCount(
            FetchDescriptor<QueuedScan>(predicate: #Predicate { $0.dead }))) ?? 0
        return creates + scans
    }

    /// Re-queue all failed records and try to sync immediately.
    func retryAllFailed() async {
        if let creates = try? context.fetch(FetchDescriptor<QueuedAssetCreate>(predicate: #Predicate { $0.dead })) {
            for c in creates { c.dead = false; c.attempts = 0; c.lastError = nil }
        }
        if let scans = try? context.fetch(FetchDescriptor<QueuedScan>(predicate: #Predicate { $0.dead })) {
            for s in scans { s.dead = false; s.attempts = 0; s.lastError = nil }
        }
        try? context.save()
        await syncNow()
    }

    /// Permanently discard all failed records (user-confirmed in the UI).
    func discardAllFailed() {
        if let creates = try? context.fetch(FetchDescriptor<QueuedAssetCreate>(predicate: #Predicate { $0.dead })) {
            for c in creates {
                // Also remove the provisional cache row so the asset stops appearing.
                let pendingId = c.provisionalCacheId
                if let provisional = try? context.fetch(
                    FetchDescriptor<CachedAsset>(predicate: #Predicate { $0.id == pendingId })).first {
                    context.delete(provisional)
                }
                context.delete(c)
            }
        }
        if let scans = try? context.fetch(FetchDescriptor<QueuedScan>(predicate: #Predicate { $0.dead })) {
            for s in scans { context.delete(s) }
        }
        try? context.save()
    }

    func syncNow() async {
        guard !isSyncing, TokenManager.shared.isLoggedIn else { return }
        isSyncing = true
        defer { isSyncing = false }
        await drainAssetCreates()
        await drainScans()
    }

    // MARK: - Asset creates

    private func drainAssetCreates() async {
        var descriptor = FetchDescriptor<QueuedAssetCreate>(sortBy: [SortDescriptor(\.createdAt)])
        descriptor.predicate = #Predicate { !$0.dead }
        guard let queued = try? context.fetch(descriptor), !queued.isEmpty else { return }

        for item in queued {
            do {
                let created: AssetResponse = try await apiClient.request(.createAsset(item.toCreateRequest()))

                // Swap the provisional cache row for the server copy.
                let pendingId = item.provisionalCacheId
                let predicate = #Predicate<CachedAsset> { $0.id == pendingId }
                if let provisional = try? context.fetch(FetchDescriptor<CachedAsset>(predicate: predicate)).first {
                    context.delete(provisional)
                }
                context.insert(CachedAsset(from: created))
                context.delete(item)
                try? context.save()
            } catch {
                if case APIError.networkError = error { return } // still offline — stop draining
                if case APIError.unauthorized = error { return } // session rejected — stop, don't burn attempts
                if case APIError.forbidden = error { return }
                recordFailure(of: item, error: error)
            }
        }
    }

    // MARK: - Audit scans

    private func drainScans() async {
        var descriptor = FetchDescriptor<QueuedScan>(sortBy: [SortDescriptor(\.createdAt)])
        descriptor.predicate = #Predicate { !$0.dead }
        guard let queued = try? context.fetch(descriptor), !queued.isEmpty else { return }

        for scan in queued {
            var request = RecordScanRequest(tagValue: scan.tagValue)
            request.deviceId = scan.deviceId
            request.locationId = scan.locationId
            request.condition = scan.condition
            request.clientRequestId = scan.id.uuidString
            request.capturedAt = ISO8601DateFormatter().string(from: scan.createdAt)
            do {
                let _: AuditScanEventResponse = try await apiClient.request(
                    .recordAuditScan(campaignId: scan.campaignId, request)
                )
                context.delete(scan)
                try? context.save()
            } catch {
                if case APIError.networkError = error { return }
                if case APIError.unauthorized = error { return }
                if case APIError.forbidden = error { return }
                recordFailure(of: scan, error: error)
            }
        }
    }

    // MARK: - Failure bookkeeping

    private func recordFailure(of item: QueuedAssetCreate, error: Error) {
        item.attempts += 1
        item.lastError = (error as? APIError)?.userMessage ?? error.localizedDescription
        if item.attempts >= Self.maxAttempts { item.dead = true }
        try? context.save()
    }

    private func recordFailure(of scan: QueuedScan, error: Error) {
        scan.attempts += 1
        scan.lastError = (error as? APIError)?.userMessage ?? error.localizedDescription
        if scan.attempts >= Self.maxAttempts { scan.dead = true }
        try? context.save()
    }
}
