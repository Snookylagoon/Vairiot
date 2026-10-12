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
    // GS1 identity — allocated by the server, never authored by the app
    var individualAssetReference: String? = nil
    var allocationAuthority: String? = nil
    var giai: String? = nil
    let category: CategoryRefResponse?
    let site: SiteRefResponse?
    let location: LocationRefResponse?
    // GIS position (WGS 84) — complements site / location
    var latitude: Double? = nil
    var longitude: Double? = nil
    var geoAccuracyMeters: Double? = nil
    var geoSource: String? = nil
    var geoCapturedAt: String? = nil

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
    // Delta sync only (GET /assets?changedSince=). Nil from a plain list, or
    // from a server that predates delta sync.
    var deletedIds: [String]? = nil
    var serverTime: String? = nil
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
    /// Idempotency key so offline replays can't create duplicate assets.
    var clientRequestId: String?
    var latitude: Double?
    var longitude: Double?
    var geoAccuracyMeters: Double?
    var geoSource: String?
    var geoCapturedAt: String?
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
    var latitude: Double?
    var longitude: Double?
    var geoAccuracyMeters: Double?
    var geoSource: String?
    var geoCapturedAt: String?
    /// Sends `latitude` / `longitude` as explicit nulls, which the API reads as
    /// "remove the position". Synthesized encoding omits nil fields instead.
    var clearGeoPosition = false

    enum CodingKeys: String, CodingKey {
        case name, description, status, condition, serialNumber, barcode, rfidTag, notes
        case siteId, locationId
        case latitude, longitude, geoAccuracyMeters, geoSource, geoCapturedAt
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(name, forKey: .name)
        try c.encodeIfPresent(description, forKey: .description)
        try c.encodeIfPresent(status, forKey: .status)
        try c.encodeIfPresent(condition, forKey: .condition)
        try c.encodeIfPresent(serialNumber, forKey: .serialNumber)
        try c.encodeIfPresent(barcode, forKey: .barcode)
        try c.encodeIfPresent(rfidTag, forKey: .rfidTag)
        try c.encodeIfPresent(notes, forKey: .notes)
        try c.encodeIfPresent(siteId, forKey: .siteId)
        try c.encodeIfPresent(locationId, forKey: .locationId)
        if clearGeoPosition {
            try c.encodeNil(forKey: .latitude)
            try c.encodeNil(forKey: .longitude)
        } else {
            try c.encodeIfPresent(latitude, forKey: .latitude)
            try c.encodeIfPresent(longitude, forKey: .longitude)
            try c.encodeIfPresent(geoAccuracyMeters, forKey: .geoAccuracyMeters)
            try c.encodeIfPresent(geoSource, forKey: .geoSource)
            try c.encodeIfPresent(geoCapturedAt, forKey: .geoCapturedAt)
        }
    }
}
