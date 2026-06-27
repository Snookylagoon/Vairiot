import Foundation

// MARK: - Enums

enum AssetStatus: String, Codable, CaseIterable, Identifiable {
    case active
    case inactive
    case inUse = "in_use"
    case maintenance
    case disposed

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .active:      return "Active"
        case .inactive:    return "Inactive"
        case .inUse:       return "In Use"
        case .maintenance: return "Maintenance"
        case .disposed:    return "Disposed"
        }
    }
}

enum AssetCondition: String, Codable, CaseIterable, Identifiable {
    case new
    case good
    case fair
    case poor
    case damaged

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .new:     return "New"
        case .good:    return "Good"
        case .fair:    return "Fair"
        case .poor:    return "Poor"
        case .damaged: return "Damaged"
        }
    }
}

// MARK: - Reference Types

struct CategoryRefResponse: Codable, Identifiable, Hashable {
    let id: String
    let name: String
}

struct SiteRefResponse: Codable, Identifiable, Hashable {
    let id: String
    let name: String
}

struct LocationRefResponse: Codable, Identifiable, Hashable {
    let id: String
    let name: String
}

// MARK: - Asset Response

struct AssetResponse: Codable, Identifiable {
    let id: String
    let assetNumber: String
    let name: String
    let description: String?
    let status: String
    let condition: String
    let serialNumber: String?
    let barcode: String?
    let rfidTag: String?
    let category: CategoryRefResponse?
    let site: SiteRefResponse?
    let location: LocationRefResponse?

    var assetStatus: AssetStatus? {
        AssetStatus(rawValue: status)
    }

    var assetCondition: AssetCondition? {
        AssetCondition(rawValue: condition)
    }
}

// MARK: - Asset List Response

struct AssetListResponse: Codable {
    let assets: [AssetResponse]
    let total: Int
    let page: Int
    let pageSize: Int
    let totalPages: Int
}

// MARK: - Asset Create / Update

struct AssetCreateRequest: Codable {
    let name: String
    var rfidTag: String?
    var barcode: String?
    var description: String?
    var serialNumber: String?
    var condition: String = "good"
    var status: String = "active"
    var categoryId: String?
    var siteId: String?
    var locationId: String?
}

struct AssetUpdateRequest: Codable {
    var name: String?
    var description: String?
    var status: String?
    var condition: String?
    var serialNumber: String?
    var barcode: String?
    var rfidTag: String?
    var notes: String?
    var siteId: String?
    var locationId: String?
}
