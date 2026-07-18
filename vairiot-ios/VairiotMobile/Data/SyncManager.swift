import Foundation
import Network
import SwiftData

/// Watches connectivity and drains the offline queues (`QueuedAssetCreate`,
/// then `QueuedScan`) whenever the network comes back or the app foregrounds.
///
/// Mirrors the Android `ScanSyncWorker`: FIFO drain, delete on success, drop
/// poison records after `maxAttempts` server rejections, stop early when the
/// device is still offline.
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
        let creates = (try? context.fetchCount(FetchDescriptor<QueuedAssetCreate>())) ?? 0
        let scans = (try? context.fetchCount(FetchDescriptor<QueuedScan>())) ?? 0
        return creates + scans
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
        let descriptor = FetchDescriptor<QueuedAssetCreate>(sortBy: [SortDescriptor(\.createdAt)])
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
                recordFailure(of: item, error: error)
            }
        }
    }

    // MARK: - Audit scans

    private func drainScans() async {
        let descriptor = FetchDescriptor<QueuedScan>(sortBy: [SortDescriptor(\.createdAt)])
        guard let queued = try? context.fetch(descriptor), !queued.isEmpty else { return }

        for scan in queued {
            var request = RecordScanRequest(tagValue: scan.tagValue)
            request.deviceId = scan.deviceId
            request.locationId = scan.locationId
            request.condition = scan.condition
            do {
                let _: AuditScanEventResponse = try await apiClient.request(
                    .recordAuditScan(campaignId: scan.campaignId, request)
                )
                context.delete(scan)
                try? context.save()
            } catch {
                if case APIError.networkError = error { return }
                recordFailure(of: scan, error: error)
            }
        }
    }

    // MARK: - Failure bookkeeping

    private func recordFailure(of item: QueuedAssetCreate, error: Error) {
        item.attempts += 1
        item.lastError = (error as? APIError)?.userMessage ?? error.localizedDescription
        if item.attempts >= Self.maxAttempts { context.delete(item) }
        try? context.save()
    }

    private func recordFailure(of scan: QueuedScan, error: Error) {
        scan.attempts += 1
        scan.lastError = (error as? APIError)?.userMessage ?? error.localizedDescription
        if scan.attempts >= Self.maxAttempts { context.delete(scan) }
        try? context.save()
    }
}
