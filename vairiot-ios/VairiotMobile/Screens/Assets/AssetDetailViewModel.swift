import Foundation

@MainActor
@Observable
final class AssetDetailViewModel {

    // MARK: - Properties

    var asset: AssetResponse?
    var isLoading: Bool = false
    var errorMessage: String?
    var showDeleteConfirmation: Bool = false
    var isDeleting: Bool = false
    var isDeleted: Bool = false

    let assetId: String
    let apiClient: APIClient

    // MARK: - Init

    init(assetId: String, apiClient: APIClient) {
        self.assetId = assetId
        self.apiClient = apiClient
    }

    // MARK: - Load

    func load() async {
        isLoading = true
        errorMessage = nil

        do {
            asset = try await apiClient.request(.getAsset(id: assetId))
        } catch let error as APIError {
            errorMessage = error.userMessage
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }

    func refresh() async {
        errorMessage = nil
        do {
            asset = try await apiClient.request(.getAsset(id: assetId))
        } catch let error as APIError {
            errorMessage = error.userMessage
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Delete

    func deleteAsset() async {
        isDeleting = true
        errorMessage = nil

        do {
            try await apiClient.requestVoid(.deleteAsset(id: assetId))
            isDeleted = true
        } catch let error as APIError {
            errorMessage = error.userMessage
        } catch {
            errorMessage = error.localizedDescription
        }

        isDeleting = false
    }
}