import Foundation

@MainActor
@Observable
final class AuditListViewModel {

    // MARK: - State

    var audits: [AuditCampaignResponse] = []
    var isLoading = false
    var isCreating = false
    var errorMessage: String?

    // MARK: - Create form

    var newAuditName = ""
    var newAuditMode = "sighted"
    var newAuditSiteId: String?
    var newAuditLocationId: String?
    var newAuditCategoryId: String?
    var newAuditAssetIds: [String] = []
    var showCreateSheet = false

    // MARK: - Dependencies

    private let apiClient: APIClient

    // MARK: - Init

    init(apiClient: APIClient = .shared) {
        self.apiClient = apiClient
    }

    // MARK: - Load

    func loadAudits() async {
        isLoading = true
        errorMessage = nil

        do {
            audits = try await apiClient.request(.listAudits)
        } catch let error as APIError {
            errorMessage = error.localizedDescription
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }

    // MARK: - Create

    func createAudit() async {
        let trimmedName = newAuditName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else {
            errorMessage = "Audit name is required"
            return
        }

        isCreating = true
        errorMessage = nil

        let request = CreateAuditRequest(
            name: trimmedName,
            mode: newAuditMode,
            siteId: newAuditSiteId,
            locationId: newAuditLocationId,
            categoryId: newAuditCategoryId,
            assetIds: newAuditAssetIds.isEmpty ? nil : newAuditAssetIds
        )

        do {
            let created: AuditCampaignResponse = try await apiClient.request(.createAudit(request))
            audits.insert(created, at: 0)
            resetCreateForm()
            showCreateSheet = false
        } catch let error as APIError {
            errorMessage = error.localizedDescription
        } catch {
            errorMessage = error.localizedDescription
        }

        isCreating = false
    }

    // MARK: - Helpers

    func resetCreateForm() {
        newAuditName = ""
        newAuditMode = "sighted"
        newAuditSiteId = nil
        newAuditLocationId = nil
        newAuditCategoryId = nil
        newAuditAssetIds = []
    }

    func statusColor(for status: String) -> String {
        switch status.lowercased() {
        case "draft":        return "grey"
        case "in_progress":  return "amber"
        case "completed":    return "green"
        default:             return "grey"
        }
    }
}
