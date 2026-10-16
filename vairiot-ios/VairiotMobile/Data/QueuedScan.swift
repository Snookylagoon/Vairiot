import Foundation
import SwiftData

/// Offline queue for scans that could not be submitted immediately.
///
/// Mirrors the Android Room `QueuedScan` entity. `id` doubles as the
/// clientRequestId, so the online attempt and every replay share one key.
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
    /// `QueueState` value. A literal default so SwiftData's lightweight
    /// migration can add the column to existing stores.
    var state: String = "pending"
    /// Pre-S0.3 dead-letter flag. Read once by `QueueState.migrateLegacyFlags`
    /// to carry old parked rows over to `state`; not written any more.
    var dead: Bool = false
    /// Device position when the tag was scanned (stage 1.5); nil with GIS off
    /// or no recent fix. Optional, so lightweight migration adds the columns.
    var latitude: Double?
    var longitude: Double?
    var geoAccuracyMeters: Double?

    init(
        id: UUID = UUID(),
        campaignId: String,
        tagValue: String,
        deviceId: String? = nil,
        locationId: String? = nil,
        condition: String? = nil,
        createdAt: Date = .now,
        attempts: Int = 0,
        lastError: String? = nil,
        fix: GeoFix? = nil
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
        self.latitude = fix?.latitude
        self.longitude = fix?.longitude
        self.geoAccuracyMeters = fix?.accuracyMeters
    }
}
