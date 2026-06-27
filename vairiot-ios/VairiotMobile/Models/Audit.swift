import Foundation

// MARK: - Audit Campaign

struct AuditCampaignResponse: Codable, Identifiable {
    let id: String
    let name: String
    var mode: String = "sighted"
    let status: String
    let siteId: String?
    let locationId: String?
    let linkedCampaignId: String?
    let scheduledAt: String?
    let startedAt: String?
    let completedAt: String?
    let createdAt: String
    let _count: AuditCountResponse?

    var scanCount: Int {
        _count?.scanEvents ?? 0
    }
}

struct AuditCountResponse: Codable {
    let scanEvents: Int
}

// MARK: - Create Audit

struct CreateAuditRequest: Codable {
    let name: String
    var mode: String?
    var siteId: String?
    var locationId: String?
    var categoryId: String?
    var assetIds: [String]?
}

// MARK: - Scan Events

struct RecordScanRequest: Codable {
    let tagValue: String
    var deviceId: String?
    var locationId: String?
    var condition: String?
}

struct AuditScanEventResponse: Codable, Identifiable {
    let id: String
    let campaignId: String
    let tagValue: String
    let assetId: String?
    let result: String
    let scannedAt: String
}

// MARK: - Zones

struct ZoneSubmissionResponse: Codable, Identifiable {
    let id: String
    let campaignId: String
    let locationId: String
    let submittedBy: String
    let submittedAt: String
}

// MARK: - Report

struct AuditReportResponse: Codable {
    let campaignId: String
    let totalScanned: Int
    let totalExpected: Int
    let found: Int
    let missing: [MissingAssetResponse]
    let unknownTags: [String]
}

struct MissingAssetResponse: Codable, Identifiable {
    let id: String
    let assetNumber: String
    let name: String
}
