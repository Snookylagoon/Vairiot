import Foundation
import SwiftData

/// Records one audit scan, online if possible, queued if not.
///
/// The scan is written to the queue *before* the request goes out, and the
/// online request carries that row's id as its clientRequestId. If the server
/// stores the scan but the response is lost, the queued replay reuses the key
/// and the server returns the original event instead of counting it twice.
/// Mirrors the Android `AuditScanRecorder`.
@MainActor
struct AuditScanRecorder {

    enum Outcome: Equatable {
        case recorded(AuditScanEventResponse)
        /// The server already had this exact scan (duplicate key).
        case alreadyRecorded
        /// Saved on the device; sync will send it.
        case queued
        /// The server refused it. Kept as dead for the user to retry or discard.
        case rejected(String)
    }

    let context: ModelContext
    let recordScan: (_ campaignId: String, _ request: RecordScanRequest) async throws -> AuditScanEventResponse
    var onQueued: () -> Void = {}

    func record(
        campaignId: String,
        tagValue: String,
        locationId: String?,
        condition: String?,
        deviceId: String? = nil
    ) async -> Outcome {
        let scan = QueuedScan(
            campaignId: campaignId,
            tagValue: tagValue,
            deviceId: deviceId,
            locationId: locationId,
            condition: condition
        )
        context.insert(scan)
        try? context.save()

        do {
            let event = try await recordScan(campaignId, scan.toRequest())
            context.delete(scan)
            try? context.save()
            return .recorded(event)
        } catch {
            let failure = classifySyncFailure(error)
            switch failure.kind {
            case .duplicate:
                context.delete(scan)
                try? context.save()
                return .alreadyRecorded
            case .network, .transient:
                scan.state = QueueState.failed
                scan.lastError = failure.message
                try? context.save()
                onQueued()
                return .queued
            case .auth:
                // Left pending; it drains after the user signs in again.
                onQueued()
                return .queued
            case .permanent:
                scan.state = QueueState.dead
                scan.attempts += 1
                scan.lastError = failure.message
                try? context.save()
                return .rejected(failure.message)
            }
        }
    }
}

extension AuditScanEventResponse: Equatable {
    static func == (lhs: AuditScanEventResponse, rhs: AuditScanEventResponse) -> Bool {
        lhs.id == rhs.id
    }
}
