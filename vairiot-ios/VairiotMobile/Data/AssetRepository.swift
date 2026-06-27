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

    private static let pageSize = 200

    init(apiClient: APIClient = .shared, modelContext: ModelContext) {
        self.apiClient = apiClient
        self.modelContext = modelContext
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

    /// Pull every page from the API and replace/upsert the local cache.
    ///
    /// Returns the total reported by the server, or `nil` if any page failed
    /// (the cache stays intact — a partial sync would leave the user staring
    /// at half a register).
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

            let isFullSync = search == nil && statusParam == nil && conditionParam == nil
            if isFullSync {
                replaceAll(with: firstPage.assets)
            } else {
                upsertAll(firstPage.assets)
            }

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
            // Fallback to cache
            let predicate = #Predicate<CachedAsset> { cached in
                cached.barcode == tag ||
                cached.rfidTag == tag ||
                cached.assetNumber == tag
            }
            let descriptor = FetchDescriptor<CachedAsset>(predicate: predicate)
            if let cached = try? modelContext.fetch(descriptor).first {
                return .found(cached.toAssetResponse(), fromCache: true)
            }
            return .notFound
        }
    }

    // MARK: - Private persistence helpers

    private func replaceAll(with assets: [AssetResponse]) {
        // Delete all existing cached assets
        do {
            try modelContext.delete(model: CachedAsset.self)
        } catch {
            // If bulk delete fails, continue with upsert
        }
        for asset in assets {
            modelContext.insert(CachedAsset(from: asset))
        }
    }

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
