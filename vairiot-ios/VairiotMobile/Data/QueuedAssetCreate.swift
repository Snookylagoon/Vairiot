import Foundation
import SwiftData

/// Offline queue for new assets created without connectivity.
///
/// Mirrors `AssetCreateRequest`. Records accumulate here when the device is
/// offline and are drained by `SyncManager` once the network returns. Each
/// queued create also inserts a provisional `CachedAsset` (id
/// `pending-<localId>`) so the new asset appears in the cached list
/// immediately; the provisional row is replaced by the server copy on sync.
@Model
final class QueuedAssetCreate {

    @Attribute(.unique) var localId: UUID
    var name: String
    var assetDescription: String?
    var serialNumber: String?
    var barcode: String?
    var rfidTag: String?
    var status: String
    var condition: String
    var categoryId: String?
    var siteId: String?
    var locationId: String?
    var createdAt: Date
    var attempts: Int
    var lastError: String?

    init(
        localId: UUID = UUID(),
        name: String,
        assetDescription: String? = nil,
        serialNumber: String? = nil,
        barcode: String? = nil,
        rfidTag: String? = nil,
        status: String = "active",
        condition: String = "good",
        categoryId: String? = nil,
        siteId: String? = nil,
        locationId: String? = nil,
        createdAt: Date = .now,
        attempts: Int = 0,
        lastError: String? = nil
    ) {
        self.localId = localId
        self.name = name
        self.assetDescription = assetDescription
        self.serialNumber = serialNumber
        self.barcode = barcode
        self.rfidTag = rfidTag
        self.status = status
        self.condition = condition
        self.categoryId = categoryId
        self.siteId = siteId
        self.locationId = locationId
        self.createdAt = createdAt
        self.attempts = attempts
        self.lastError = lastError
    }

    /// The id used for this asset's provisional row in the `CachedAsset` cache.
    var provisionalCacheId: String { "pending-\(localId.uuidString)" }

    func toCreateRequest() -> AssetCreateRequest {
        AssetCreateRequest(
            name: name,
            rfidTag: rfidTag,
            barcode: barcode,
            description: assetDescription,
            serialNumber: serialNumber,
            condition: condition,
            status: status,
            categoryId: categoryId,
            siteId: siteId,
            locationId: locationId
        )
    }
}
