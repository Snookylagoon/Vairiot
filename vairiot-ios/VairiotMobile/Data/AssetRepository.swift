import Foundation
import SwiftData

/// Local-first asset repository matching the Android `AssetRepository`.
///
/// Reads from the SwiftData cache for immediate display and pulls fresh data
/// from the API on demand. Tag lookups try the network first and fall back to
/// the cache when offline.
@MainActor
final class AssetRepository: ObservableObject {

    private let apiClient: APIClient
    private let modelContext: ModelContext
    private let syncStore: AssetSyncCursorStore

    private static let pageSize = 200

    init(
        apiClient: APIClient = .shared,
        modelContext: ModelContext,
        syncStore: AssetSyncCursorStore = DefaultsAssetSyncCursorStore()
    ) {
        self.apiClient = apiClient
        self.modelContext = modelContext
        self.syncStore = syncStore
    }

    // MARK: - Local query

    /// Query cached assets whose name, asset number, barcode, or serial number
    /// contain the given string (case-insensitive).
    func observeAssets(query: String) -> [AssetResponse] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        let descriptor: FetchDescriptor<CachedAsset>

        if trimmed.isEmpty {
            descriptor = FetchDescriptor<CachedAsset>(
                sortBy: [SortDescriptor(\.name)]
            )
        } else {
            let predicate = #Predicate<CachedAsset> { asset in
                asset.name.localizedStandardContains(trimmed) ||
                asset.assetNumber.localizedStandardContains(trimmed) ||
                (asset.barcode ?? "").localizedStandardContains(trimmed) ||
                (asset.serialNumber ?? "").localizedStandardContains(trimmed)
            }
            descriptor = FetchDescriptor<CachedAsset>(
                predicate: predicate,
                sortBy: [SortDescriptor(\.name)]
            )
        }

        do {
            let cached = try modelContext.fetch(descriptor)
            return cached.map { $0.toAssetResponse() }
        } catch {
            return []
        }
    }

    // MARK: - Full refresh from API

    /// Brings the local cache up to date. Unfiltered refreshes use delta sync
    /// (`AssetDeltaSync`): only assets changed since the last sync are fetched.
    /// Filtered refreshes pull the matching pages and upsert them.
    ///
    /// Returns the total, or `nil` if anything failed (the cache stays intact —
    /// a partial sync would leave the user staring at half a register).
    @discardableResult
    func refresh(
        query: String? = nil,
        status: String? = nil,
        condition: String? = nil,
        sortBy: String? = nil,
        sortOrder: String? = nil
    ) async -> Int? {
        let search = query?.trimmingCharacters(in: .whitespacesAndNewlines)
            .isEmpty == false ? query : nil
        let statusParam = status?.isEmpty == false ? status : nil
        let conditionParam = condition?.isEmpty == false ? condition : nil

        if search == nil && statusParam == nil && conditionParam == nil {
            let apiClient = self.apiClient
            let delta = AssetDeltaSync(context: modelContext, store: syncStore) { since, until, page in
                try await apiClient.request(.listAssets(
                    page: page, pageSize: Self.pageSize, changedSince: since, changedUntil: until
                ))
            }
            do {
                let count = try await delta.sync(tenantId: TokenManager.shared.tenantId ?? "")
                NotificationCenter.default.post(name: .vairiotAssetCacheSynced, object: nil)
                return count
            } catch {
                return nil
            }
        }

        do {
            let firstPage: AssetListResponse = try await apiClient.request(
                .listAssets(
                    search: search,
                    status: statusParam,
                    condition: conditionParam,
                    sortBy: sortBy,
                    sortOrder: sortOrder,
                    page: 1,
                    pageSize: Self.pageSize
                )
            )

            upsertAll(firstPage.assets)

            var page = 2
            while page <= firstPage.totalPages {
                let nextPage: AssetListResponse = try await apiClient.request(
                    .listAssets(
                        search: search,
                        status: statusParam,
                        condition: conditionParam,
                        sortBy: sortBy,
                        sortOrder: sortOrder,
                        page: page,
                        pageSize: Self.pageSize
                    )
                )
                upsertAll(nextPage.assets)
                page += 1
            }

            try modelContext.save()
            return firstPage.total
        } catch {
            return nil
        }
    }

    // MARK: - Tag lookup

    /// Look up a single asset by scanned tag / barcode / asset number.
    ///
    /// Tries the server first; on failure (offline/unreachable) falls back
    /// to the local cache.
    func lookupByTag(tag: String) async -> TagLookup {
        do {
            let asset: AssetResponse = try await apiClient.request(.getAssetByTag(tag: tag))
            upsertAll([asset])
            try modelContext.save()
            return .found(asset, fromCache: false)
        } catch {
            // Offline resolution mirrors the server's getAssetByTag: GS1
            // Digital Link URIs, raw IARs and grouped HRIs resolve against
            // the GS1 columns before the legacy tag/barcode/number match.
            if let scan = Gs1.parseAssetScan(tag) {
                if let giai = scan.giai, let cached = fetchFirst(#Predicate<CachedAsset> { $0.giai == giai }) {
                    return .found(cached.toAssetResponse(), fromCache: true)
                }
                if let iar = scan.iar, let cached = fetchFirst(#Predicate<CachedAsset> { $0.individualAssetReference == iar }) {
                    return .found(cached.toAssetResponse(), fromCache: true)
                }
            }
            if let iar = Gs1.parseHri(tag), let cached = fetchFirst(#Predicate<CachedAsset> { $0.individualAssetReference == iar }) {
                return .found(cached.toAssetResponse(), fromCache: true)
            }
            let predicate = #Predicate<CachedAsset> { cached in
                cached.barcode == tag ||
                cached.rfidTag == tag ||
                cached.assetNumber == tag
            }
            if let cached = fetchFirst(predicate) {
                return .found(cached.toAssetResponse(), fromCache: true)
            }
            return .notFound
        }
    }

    private func fetchFirst(_ predicate: Predicate<CachedAsset>) -> CachedAsset? {
        let descriptor = FetchDescriptor<CachedAsset>(predicate: predicate)
        return try? modelContext.fetch(descriptor).first
    }

    // MARK: - Private persistence helpers

    private func upsertAll(_ assets: [AssetResponse]) {
        for asset in assets {
            let assetId = asset.id
            let predicate = #Predicate<CachedAsset> { cached in
                cached.id == assetId
            }
            let descriptor = FetchDescriptor<CachedAsset>(predicate: predicate)
            if let existing = try? modelContext.fetch(descriptor).first {
                existing.update(from: asset)
            } else {
                modelContext.insert(CachedAsset(from: asset))
            }
        }
    }
}

// MARK: - Tag Lookup Result

enum TagLookup {
    case found(AssetResponse, fromCache: Bool)
    case notFound
}
