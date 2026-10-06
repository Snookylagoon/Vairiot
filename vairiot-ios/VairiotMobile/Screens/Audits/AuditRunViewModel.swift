import Foundation
import SwiftData

@MainActor
@Observable
final class AuditRunViewModel {

    // MARK: - Scan Result

    enum ScanResult: Equatable {
        case found(assetName: String)
        /// Blind audits: the server records the tag without revealing a match.
        case recorded(tagValue: String)
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
    /// Locations of the campaign's site; blind audits scan one zone at a time.
    var locations: [LocationRefResponse] = []

    // MARK: - Condition

    /// Optional condition recorded with the next scan ("" = not assessed).
    var selectedCondition = ""
    static let conditionOptions = ["", "good", "fair", "poor", "damaged"]

    /// Scans for this audit saved on the device and not yet on the server.
    var pendingScanCount = 0

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
        let tag = tagValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !tag.isEmpty else { return }

        // Blind campaigns reject any scan without a zone (audit.service.ts), so
        // check here rather than queue a scan the server can never accept.
        var zoneId: String?
        if isBlind {
            guard let selected = selectedZoneLocationId, !selected.isEmpty else {
                errorMessage = "Select a zone before scanning."
                return
            }
            guard !isZoneLocked(selected) else {
                errorMessage = "This zone has been submitted and is locked."
                return
            }
            zoneId = selected
        }

        isRecording = true
        errorMessage = nil

        // Written to the queue first and sent with that row's key, so a lost
        // response can't turn into a double count when the queue replays it.
        let recorder = AuditScanRecorder(
            context: VairiotStore.shared.context,
            recordScan: { [apiClient] campaignId, request in
                try await apiClient.request(.recordAuditScan(campaignId: campaignId, request))
            },
            onQueued: { SyncManager.shared.syncSoon() }
        )
        let outcome = await recorder.record(
            campaignId: audit.id,
            tagValue: tag,
            locationId: zoneId,
            condition: selectedCondition.isEmpty ? nil : selectedCondition
        )

        switch outcome {
        case .recorded(let event):
            scanCount += 1
            switch event.result.lowercased() {
            case "found":
                lastScanResult = .found(assetName: event.assetId ?? tag)
            case "recorded":
                lastScanResult = .recorded(tagValue: tag)
            default:
                lastScanResult = .unknown(tagValue: tag)
            }
            selectedCondition = ""
            successMessage = "Scan recorded"
        case .alreadyRecorded:
            selectedCondition = ""
            successMessage = "Already recorded"
        case .queued:
            scanCount += 1
            lastScanResult = .queued(tagValue: tag)
            selectedCondition = ""
            successMessage = "Offline — scan queued"
        case .rejected(let message):
            // Previously any non-network failure was shown and the scan dropped;
            // it is now kept under Profile → Pending uploads.
            errorMessage = "Scan not accepted: \(message). It is kept under Profile → Pending uploads."
        }

        refreshPendingCount()
        isRecording = false
    }

    func refreshPendingCount() {
        let campaignId = audit.id
        let dead = QueueState.dead
        pendingScanCount = (try? VairiotStore.shared.context.fetchCount(FetchDescriptor<QueuedScan>(
            predicate: #Predicate { $0.campaignId == campaignId && $0.state != dead }))) ?? 0
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

    /// Loads the site's locations for the blind-audit zone picker.
    func loadLocations() async {
        guard isBlind, let siteId = audit.siteId else { return }
        do {
            let loaded: [LocationRefResponse] = try await apiClient.request(.listSiteLocations(siteId: siteId))
            locations = loaded
            ReferenceCache.store(kind: "location", items: loaded.map { ($0.id, $0.name) }, parentId: siteId)
        } catch {
            // Offline: fall back to the last copy so a blind audit can still be
            // scanned in a dead zone (shared with the new-asset form's cache).
            locations = ReferenceCache.load(kind: "location", parentId: siteId)
                .map { LocationRefResponse(id: $0.id, name: $0.name) }
        }
    }

    func isZoneLocked(_ locationId: String) -> Bool {
        zones.contains { $0.locationId == locationId }
    }

    func locationName(_ locationId: String) -> String {
        locations.first { $0.id == locationId }?.name ?? locationId
    }

    func loadZones() async {
        do {
            zones = try await apiClient.request(.listAuditZones(campaignId: audit.id))
        } catch {
            // Non-critical; zones may not exist yet.
        }
    }

    // MARK: - Helpers

    var isBlind: Bool {
        audit.mode.lowercased() == "blind"
    }

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
