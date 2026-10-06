import Foundation
import SwiftData

/// Where the asset cache stands against the server. Mirrors Android.
struct AssetSyncCursor: Codable, Equatable {
    /// Tenant the cache was filled for. A different tenant means start over.
    var tenantId: String
    /// Page 1's `serverTime` from the last completed sync (ISO-8601).
    var serverTime: String
    /// Device time of the last completed sync, for "Last synced X ago".
    var lastSyncedAt: Date
    /// Device time of the last full (non-delta) sync.
    var lastFullSyncAt: Date
}

protocol AssetSyncCursorStore {
    func load() -> AssetSyncCursor?
    func save(_ cursor: AssetSyncCursor)
    /// A sync completed without a cursor (older server): only the time is known.
    func markSynced(at date: Date)
    var lastSyncedAt: Date? { get }
}

/// UserDefaults-backed cursor (one record per device).
struct DefaultsAssetSyncCursorStore: AssetSyncCursorStore {
    private static let cursorKey = "assetSync.cursor"
    private static let syncedKey = "assetSync.lastSyncedAt"
    var defaults: UserDefaults = .standard

    func load() -> AssetSyncCursor? {
        guard let data = defaults.data(forKey: Self.cursorKey) else { return nil }
        return try? JSONDecoder().decode(AssetSyncCursor.self, from: data)
    }

    func save(_ cursor: AssetSyncCursor) {
        defaults.set(try? JSONEncoder().encode(cursor), forKey: Self.cursorKey)
        defaults.set(cursor.lastSyncedAt, forKey: Self.syncedKey)
    }

    func markSynced(at date: Date) {
        defaults.set(date, forKey: Self.syncedKey)
    }

    var lastSyncedAt: Date? { defaults.object(forKey: Self.syncedKey) as? Date }
}

/// Keeps the SwiftData asset cache in step with the server using
/// `GET /assets?changedSince=` instead of re-downloading the register.
/// Same rules as Android's `AssetDeltaSync`:
///
/// - First sync, a tenant switch, or 24h since the last full sync: full sync
///   (changedSince = epoch). Edits that don't touch the asset row (a renamed
///   category) are invisible to the delta, so a daily full sync catches them.
/// - Otherwise: a delta from the last `serverTime` minus a 2-minute overlap,
///   upserting changes and removing `deletedIds`.
///
/// All pages are fetched before the cache is touched and the cursor is saved
/// last, so a dropped connection leaves the old cache and cursor intact.
/// Provisional rows for assets created offline (`pending-…`) are never removed.
@MainActor
struct AssetDeltaSync {
    static let epoch = "1970-01-01T00:00:00Z"
    static let overlap: TimeInterval = 2 * 60
    static let fullSyncEvery: TimeInterval = 24 * 3600

    let context: ModelContext
    let store: AssetSyncCursorStore
    let fetchPage: (_ changedSince: String?, _ changedUntil: String?, _ page: Int) async throws -> AssetListResponse
    var now: () -> Date = Date.init

    /// Runs a sync for `tenantId`. Returns the number of cached assets; throws on failure.
    @discardableResult
    func sync(tenantId: String) async throws -> Int {
        let cursor = store.load().flatMap { $0.tenantId == tenantId ? $0 : nil }
        let full = cursor.map { now().timeIntervalSince($0.lastFullSyncAt) >= Self.fullSyncEvery } ?? true
        let since: String
        if full {
            since = Self.epoch
        } else {
            let last = ISO8601DateFormatter.withFractions.date(from: cursor!.serverTime)
                ?? ISO8601DateFormatter().date(from: cursor!.serverTime)
                ?? .distantPast
            since = ISO8601DateFormatter().string(from: last.addingTimeInterval(-Self.overlap))
        }

        let first = try await fetchPage(since, nil, 1)
        guard let serverTime = first.serverTime else {
            return try await legacyFullSync(first)
        }

        var changed = first.assets
        if first.totalPages >= 2 {
            for page in 2...first.totalPages {
                changed += try await fetchPage(since, serverTime, page).assets
            }
        }

        if full {
            replaceAll(with: changed)
        } else {
            upsert(changed)
            delete(ids: first.deletedIds ?? [])
        }
        try context.save()

        let at = now()
        store.save(AssetSyncCursor(
            tenantId: tenantId,
            serverTime: serverTime,
            lastSyncedAt: at,
            lastFullSyncAt: full ? at : cursor!.lastFullSyncAt
        ))
        return cachedCount
    }

    /// The server ignored changedSince and sent a plain list: download it all.
    private func legacyFullSync(_ first: AssetListResponse) async throws -> Int {
        var all = first.assets
        if first.totalPages >= 2 {
            for page in 2...first.totalPages {
                all += try await fetchPage(nil, nil, page).assets
            }
        }
        replaceAll(with: all)
        try context.save()
        store.markSynced(at: now())
        return cachedCount
    }

    private var cachedCount: Int {
        (try? context.fetchCount(FetchDescriptor<CachedAsset>(
            predicate: #Predicate { !$0.id.starts(with: "pending-") }))) ?? 0
    }

    private func replaceAll(with assets: [AssetResponse]) {
        // Keep provisional rows: those assets are still in the offline queue.
        let stale = (try? context.fetch(FetchDescriptor<CachedAsset>(
            predicate: #Predicate { !$0.id.starts(with: "pending-") }))) ?? []
        stale.forEach(context.delete)
        for asset in assets { context.insert(CachedAsset(from: asset)) }
    }

    private func upsert(_ assets: [AssetResponse]) {
        for asset in assets {
            let id = asset.id
            if let existing = try? context.fetch(FetchDescriptor<CachedAsset>(
                predicate: #Predicate { $0.id == id })).first {
                existing.update(from: asset)
            } else {
                context.insert(CachedAsset(from: asset))
            }
        }
    }

    private func delete(ids: [String]) {
        guard !ids.isEmpty else { return }
        let rows = (try? context.fetch(FetchDescriptor<CachedAsset>(
            predicate: #Predicate { ids.contains($0.id) }))) ?? []
        rows.forEach(context.delete)
    }
}

extension ISO8601DateFormatter {
    /// The API sends milliseconds (`2026-10-05T10:00:00.000Z`).
    static let withFractions: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
}

/// "Last synced …" wording for the asset list (whole minutes and hours, so it
/// doesn't flicker). Nil when there has been no sync. Matches Android.
func formatSyncAge(_ lastSynced: Date?, now: Date = .now) -> String? {
    guard let lastSynced else { return nil }
    let minutes = Int(max(0, now.timeIntervalSince(lastSynced)) / 60)
    switch minutes {
    case ..<1: return "Last synced just now"
    case 1: return "Last synced 1 minute ago"
    case ..<60: return "Last synced \(minutes) minutes ago"
    case ..<120: return "Last synced 1 hour ago"
    case ..<(48 * 60): return "Last synced \(minutes / 60) hours ago"
    default: return "Last synced \(minutes / (24 * 60)) days ago"
    }
}

extension Notification.Name {
    /// Posted when the asset cache finishes a sync, so "Last synced" updates.
    static let vairiotAssetCacheSynced = Notification.Name("vairiotAssetCacheSynced")
}
