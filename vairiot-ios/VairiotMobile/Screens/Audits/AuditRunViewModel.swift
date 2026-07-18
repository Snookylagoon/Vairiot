import Foundation
import SwiftData

@MainActor
@Observable
final class AuditRunViewModel {

    // MARK: - Scan Result

    enum ScanResult: Equatable {
        case found(assetName: String)
        case unknown(tagValue: String)
        case queued(tagValue: String)
    }

    // MARK: - State

    var audit: AuditCampaignResponse
    var scanCount: Int
    var lastScanResult: ScanResult?
    var zones: [ZoneSubmissionResponse] = []
    var report: AuditReportResponse?
    var isScanning = false
    var isStarting = false
    var isRecording = false
    var isSubmittingZone = false
    var isCompleting = false
    var isLoadingReport = false
    var showScanner = false
    var errorMessage: String?
    var successMessage: String?

    // MARK: - Zone selection

    var selectedZoneLocationId: String?

    // MARK: - Dependencies

    private let apiClient: APIClient

    // MARK: - Init

    init(audit: AuditCampaignResponse, apiClient: APIClient = .shared) {
        self.audit = audit
        self.scanCount = audit.scanCount
        self.apiClient = apiClient
    }

    // MARK: - Start Audit

    func startAudit() async {
        isStarting = true
        errorMessage = nil

        do {
            let updated: AuditCampaignResponse = try await apiClient.request(
                .startAudit(id: audit.id)
            )
            audit = updated
            successMessage = "Audit started"
        } catch let error as APIError {
            errorMessage = error.localizedDescription
        } catch {
            errorMessage = error.localizedDescription
        }

        isStarting = false
    }

    // MARK: - Record Scan

    func recordScan(tagValue: String) async {
        isRecording = true
        errorMessage = nil

        let request = RecordScanRequest(tagValue: tagValue)

        do {
            let event: AuditScanEventResponse = try await apiClient.request(
                .recordAuditScan(campaignId: audit.id, request)
            )
            scanCount += 1

            switch event.result.lowercased() {
            case "found":
                lastScanResult = .found(assetName: event.assetId ?? tagValue)
            default:
                lastScanResult = .unknown(tagValue: tagValue)
            }

            successMessage = "Scan recorded"
        } catch let error as APIError {
            if case .networkError = error {
                // Offline: queue the scan for background sync so it isn't lost.
                queueOfflineScan(tagValue: tagValue)
                scanCount += 1
                lastScanResult = .queued(tagValue: tagValue)
                successMessage = "Offline — scan queued"
            } else {
                errorMessage = error.localizedDescription
            }
        } catch {
            errorMessage = error.localizedDescription
        }

        isRecording = false
    }

    private func queueOfflineScan(tagValue: String) {
        let context = VairiotStore.shared.context
        context.insert(QueuedScan(campaignId: audit.id, tagValue: tagValue))
        try? context.save()
    }

    // MARK: - Submit Zone

    func submitZone(locationId: String) async {
        isSubmittingZone = true
        errorMessage = nil

        do {
            let zone: ZoneSubmissionResponse = try await apiClient.request(
                .submitAuditZone(campaignId: audit.id, locationId: locationId)
            )
            zones.append(zone)
            selectedZoneLocationId = nil
            successMessage = "Zone submitted"
        } catch let error as APIError {
            errorMessage = error.localizedDescription
        } catch {
            errorMessage = error.localizedDescription
        }

        isSubmittingZone = false
    }

    // MARK: - Complete Audit

    func completeAudit() async {
        isCompleting = true
        errorMessage = nil

        do {
            let updated: AuditCampaignResponse = try await apiClient.request(
                .completeAudit(id: audit.id)
            )
            audit = updated
            successMessage = "Audit completed"
            await loadReport()
        } catch let error as APIError {
            errorMessage = error.localizedDescription
        } catch {
            errorMessage = error.localizedDescription
        }

        isCompleting = false
    }

    // MARK: - Load Report

    func loadReport() async {
        isLoadingReport = true

        do {
            report = try await apiClient.request(.getAuditReport(id: audit.id))
        } catch let error as APIError {
            errorMessage = error.localizedDescription
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoadingReport = false
    }

    // MARK: - Load Zones

    func loadZones() async {
        do {
            zones = try await apiClient.request(.listAuditZones(campaignId: audit.id))
        } catch {
            // Non-critical; zones may not exist yet.
        }
    }

    // MARK: - Helpers

    var isActive: Bool {
        audit.status.lowercased() == "in_progress"
    }

    var isDraft: Bool {
        audit.status.lowercased() == "draft"
    }

    var isCompleted: Bool {
        audit.status.lowercased() == "completed"
    }
}
