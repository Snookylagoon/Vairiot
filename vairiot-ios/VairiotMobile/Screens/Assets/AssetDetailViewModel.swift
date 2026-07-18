import Foundation
import SwiftData

@MainActor
@Observable
final class AssetDetailViewModel {

    // MARK: - Properties

    var asset: AssetResponse?
    var isLoading: Bool = false
    var isFromCache: Bool = false
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
            isFromCache = false
        } catch let error as APIError {
            if case .networkError = error, loadFromCache() {
                // served cached copy
            } else {
                errorMessage = error.userMessage
            }
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }

    func refresh() async {
        errorMessage = nil
        do {
            asset = try await apiClient.request(.getAsset(id: assetId))
            isFromCache = false
        } catch let error as APIError {
            if case .networkError = error, loadFromCache() {
                // served cached copy
            } else {
                errorMessage = error.userMessage
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Offline fallback: serve the cached copy of this asset if we have one.
    private func loadFromCache() -> Bool {
        let id = assetId
        let predicate = #Predicate<CachedAsset> { $0.id == id }
        guard let cached = try? VairiotStore.shared.context
            .fetch(FetchDescriptor<CachedAsset>(predicate: predicate)).first else { return false }
        asset = cached.toAssetResponse()
        isFromCache = true
        return true
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