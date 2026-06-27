import Foundation

// MARK: - Create / Update

struct MaintenanceCreateRequest: Codable {
    let assetId: String
    let maintenanceType: String
    var description: String?
    var notes: String?
    var status: String?
    var scheduledDate: String?
}

struct MaintenanceUpdateRequest: Codable {
    var status: String?
    var notes: String?
    var completedDate: String?
}

// MARK: - Response

struct MaintenanceEventResponse: Codable, Identifiable {
    let id: String
    let assetId: String
    let maintenanceType: String
    let vendor: String?
    let workOrderNumber: String?
    let cost: String?
    let description: String?
    let notes: String?
    let scheduledDate: String?
    let completedDate: String?
    let status: String
    let createdBy: String?
    let createdAt: String
    let updatedAt: String?
    let asset: MaintenanceAssetRef?
}

struct MaintenanceAssetRef: Codable, Identifiable {
    let id: String
    let assetNumber: String
    let name: String
}

// MARK: - List Response

struct MaintenanceListResponse: Codable {
    let events: [MaintenanceEventResponse]
    let total: Int
    let page: Int
    let pageSize: Int
    let totalPages: Int
}
