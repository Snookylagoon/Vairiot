import Foundation
import SwiftData

/// Offline queue for scans that could not be submitted immediately.
///
/// Mirrors the Android Room `QueuedScan` entity. Scans accumulate here when
/// the device is offline and are drained by a background sync worker.
@Model
final class QueuedScan {

    @Attribute(.unique) var id: UUID
    var campaignId: String
    var tagValue: String
    var deviceId: String?
    var locationId: String?
    var condition: String?
    var createdAt: Date
    var attempts: Int
    var lastError: String?

    init(
        id: UUID = UUID(),
        campaignId: String,
        tagValue: String,
        deviceId: String? = nil,
        locationId: String? = nil,
        condition: String? = nil,
        createdAt: Date = .now,
        attempts: Int = 0,
        lastError: String? = nil
    ) {
        self.id = id
        self.campaignId = campaignId
        self.tagValue = tagValue
        self.deviceId = deviceId
        self.locationId = locationId
        self.condition = condition
        self.createdAt = createdAt
        self.attempts = attempts
        self.lastError = lastError
    }
}
