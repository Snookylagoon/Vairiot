import Foundation
import SwiftData

/// Local cache of asset records for offline-first access.
///
/// Mirrors the Android Room `CachedAsset` entity. Conversion methods bridge
/// between this persistence model and the API's `AssetResponse`.
@Model
final class CachedAsset {

    @Attribute(.unique) var id: String
    var assetNumber: String
    var name: String
    var assetDescription: String?
    var status: String
    var condition: String
    var serialNumber: String?
    var barcode: String?
    var rfidTag: String?
    var categoryName: String?
    var siteName: String?
    var locationName: String?
    var updatedAt: Date

    init(
        id: String,
        assetNumber: String,
        name: String,
        assetDescription: String? = nil,
        status: String,
        condition: String,
        serialNumber: String? = nil,
        barcode: String? = nil,
        rfidTag: String? = nil,
        categoryName: String? = nil,
        siteName: String? = nil,
        locationName: String? = nil,
        updatedAt: Date = .now
    ) {
        self.id = id
        self.assetNumber = assetNumber
        self.name = name
        self.assetDescription = assetDescription
        self.status = status
        self.condition = condition
        self.serialNumber = serialNumber
        self.barcode = barcode
        self.rfidTag = rfidTag
        self.categoryName = categoryName
        self.siteName = siteName
        self.locationName = locationName
        self.updatedAt = updatedAt
    }
}

// MARK: - Conversion to/from API model

extension CachedAsset {

    /// Create a `CachedAsset` from an API response.
    convenience init(from response: AssetResponse) {
        self.init(
            id: response.id,
            assetNumber: response.assetNumber,
            name: response.name,
            assetDescription: response.description,
            status: response.status,
            condition: response.condition,
            serialNumber: response.serialNumber,
            barcode: response.barcode,
            rfidTag: response.rfidTag,
            categoryName: response.category?.name,
            siteName: response.site?.name,
            locationName: response.location?.name,
            updatedAt: .now
        )
    }

    /// Convert back to the API response shape for UI consumption.
    func toAssetResponse() -> AssetResponse {
        AssetResponse(
            id: id,
            assetNumber: assetNumber,
            name: name,
            description: assetDescription,
            status: status,
            condition: condition,
            serialNumber: serialNumber,
            barcode: barcode,
            rfidTag: rfidTag,
            category: categoryName.map { CategoryRefResponse(id: "", name: $0) },
            site: siteName.map { SiteRefResponse(id: "", name: $0) },
            location: locationName.map { LocationRefResponse(id: "", name: $0) }
        )
    }

    /// Update this record's fields from a fresh API response.
    func update(from response: AssetResponse) {
        assetNumber = response.assetNumber
        name = response.name
        assetDescription = response.description
        status = response.status
        condition = response.condition
        serialNumber = response.serialNumber
        barcode = response.barcode
        rfidTag = response.rfidTag
        categoryName = response.category?.name
        siteName = response.site?.name
        locationName = response.location?.name
        updatedAt = .now
    }
}
