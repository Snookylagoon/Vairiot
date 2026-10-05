import Foundation
import Network
import SwiftData

/// A row on one of the offline queues, for the Profile "Pending uploads" UI.
enum PendingUpload {
    case scan(QueuedScan)
    case asset(QueuedAssetCreate)
    case photo(QueuedPhoto)
}

/// Watches connectivity and drains the offline queues (asset creates, then
/// photos, then scans) when the network comes back, the app foregrounds, the
/// user signs in, or the background task runs (`BackgroundSync`).
///
/// The drain rules live in `drainQueue` and match Android: failures never
/// delete a row; rows the server rejects are parked as dead for the user to
/// retry or discard under Profile → Pending uploads.
@MainActor
final class SyncManager {

    static let shared = SyncManager()

    private let monitor = NWPathMonitor()
    private var isSyncing = false
    private let api: SyncAPI = .live()

    // Foreground retry after a transient failure (5xx, a row that failed
    // mid-drain). Android gets this from WorkManager backoff; iOS has to do it
    // itself. Offline is not retried here — reconnecting triggers a sync.
    private static let minRetryDelay: TimeInterval = 30
    private static let maxRetryDelay: TimeInterval = 15 * 60
    private var retryDelay = minRetryDelay
    private var retryTask: Task<Void, Never>?

    private(set) var isOnline = true

    private var context: ModelContext { VairiotStore.shared.context }

    private init() {}

    /// Call once at app launch to begin watching connectivity.
    func start() {
        QueueState.migrateLegacyFlags(in: context)
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

    /// Rows not yet accepted by the server and not rejected (pending or retrying).
    var pendingCount: Int {
        let dead = QueueState.dead
        let creates = (try? context.fetchCount(
            FetchDescriptor<QueuedAssetCreate>(predicate: #Predicate { $0.state != dead }))) ?? 0
        let scans = (try? context.fetchCount(
            FetchDescriptor<QueuedScan>(predicate: #Predicate { $0.state != dead }))) ?? 0
        let photos = (try? context.fetchCount(
            FetchDescriptor<QueuedPhoto>(predicate: #Predicate { $0.state != dead }))) ?? 0
        return creates + scans + photos
    }

    /// Drains every queue. Returns `.pausedAuth` when signed out or the session
    /// was rejected, `.retry` when something is left to try later.
    @discardableResult
    func syncNow() async -> DrainOutcome {
        guard TokenManager.shared.isLoggedIn else { return .pausedAuth }
        // Another drain is already running and will cover everything.
        guard !isSyncing else { return .done }
        isSyncing = true
        defer {
            isSyncing = false
            NotificationCenter.default.post(name: .vairiotSyncQueuesChanged, object: nil)
        }

        // Assets first: their photos only become uploadable once they exist.
        let reports = [
            await drainQueue(SyncQueues.assetCreates(context: context, api: api)),
            await drainQueue(SyncQueues.photos(context: context, api: api)),
            await drainQueue(SyncQueues.scans(context: context, api: api)),
        ]
        let outcome: DrainOutcome
        if reports.contains(where: { $0.outcome == .pausedAuth }) {
            outcome = .pausedAuth
        } else if reports.contains(where: { $0.outcome == .retry }) {
            outcome = .retry
        } else {
            outcome = .done
        }

        if outcome == .retry && isOnline {
            syncSoon()
            retryDelay = min(retryDelay * 2, Self.maxRetryDelay)
        } else if outcome == .done {
            retryDelay = Self.minRetryDelay
        }
        return outcome
    }

    /// Runs a sync after the current backoff delay, unless one is already waiting.
    func syncSoon() {
        guard retryTask == nil else { return }
        let delay = retryDelay
        retryTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(delay))
            guard let self, !Task.isCancelled else { return }
            self.retryTask = nil
            await self.syncNow()
        }
    }

    // MARK: - User actions on rejected rows

    /// Send a rejected row again (e.g. after the cause was fixed on the server).
    func retry(_ item: PendingUpload) async {
        switch item {
        case .scan(let scan):   scan.state = QueueState.pending; scan.lastError = nil
        case .asset(let asset): asset.state = QueueState.pending; asset.lastError = nil
        case .photo(let photo): photo.state = QueueState.pending; photo.lastError = nil
        }
        try? context.save()
        await syncNow()
    }

    func retryAllRejected() async {
        for item in rejectedItems() {
            switch item {
            case .scan(let scan):   scan.state = QueueState.pending; scan.lastError = nil
            case .asset(let asset): asset.state = QueueState.pending; asset.lastError = nil
            case .photo(let photo): photo.state = QueueState.pending; photo.lastError = nil
            }
        }
        try? context.save()
        await syncNow()
    }

    /// Permanently delete one rejected row (user-confirmed in the UI). Rows
    /// that are not dead are left alone: they are still going to sync.
    func discard(_ item: PendingUpload) {
        switch item {
        case .scan(let scan):
            guard scan.state == QueueState.dead else { return }
            context.delete(scan)
        case .asset(let asset):
            guard asset.state == QueueState.dead else { return }
            discardAsset(asset)
        case .photo(let photo):
            guard photo.state == QueueState.dead else { return }
            deletePhoto(photo)
        }
        try? context.save()
        NotificationCenter.default.post(name: .vairiotSyncQueuesChanged, object: nil)
    }

    func discardAllRejected() {
        for item in rejectedItems() { discard(item) }
    }

    private func rejectedItems() -> [PendingUpload] {
        let dead = QueueState.dead
        let scans = (try? context.fetch(FetchDescriptor<QueuedScan>(predicate: #Predicate { $0.state == dead }))) ?? []
        let assets = (try? context.fetch(FetchDescriptor<QueuedAssetCreate>(predicate: #Predicate { $0.state == dead }))) ?? []
        let photos = (try? context.fetch(FetchDescriptor<QueuedPhoto>(predicate: #Predicate { $0.state == dead }))) ?? []
        return scans.map(PendingUpload.scan) + assets.map(PendingUpload.asset) + photos.map(PendingUpload.photo)
    }

    private func discardAsset(_ asset: QueuedAssetCreate) {
        // The provisional list row and any photos waiting on this asset go with it:
        // without the asset they could never upload.
        let pendingId = asset.provisionalCacheId
        if let provisional = try? context.fetch(FetchDescriptor<CachedAsset>(
            predicate: #Predicate { $0.id == pendingId })).first {
            context.delete(provisional)
        }
        let localId: UUID? = asset.localId
        let photos = (try? context.fetch(FetchDescriptor<QueuedPhoto>(
            predicate: #Predicate { $0.assetLocalId == localId && $0.assetId == nil }))) ?? []
        photos.forEach(deletePhoto)
        context.delete(asset)
    }

    private func deletePhoto(_ photo: QueuedPhoto) {
        PhotoFileStore.shared.delete(photo.fileName)
        PhotoFileStore.shared.delete(photo.thumbFileName)
        context.delete(photo)
    }
}

extension Notification.Name {
    /// Posted after a sync run or a retry/discard, so screens can refresh counts.
    static let vairiotSyncQueuesChanged = Notification.Name("vairiotSyncQueuesChanged")
}
