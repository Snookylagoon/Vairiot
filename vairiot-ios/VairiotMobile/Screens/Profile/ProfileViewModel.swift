import Foundation

@MainActor
@Observable
final class ProfileViewModel {

    // MARK: - State

    var profile: UserProfileResponse?
    var licence: LicenceStatusResponse?
    var isLoadingProfile = false
    var isLoadingLicence = false
    var errorMessage: String?
    var didSignOut = false

    // MARK: - Dependencies

    private let apiClient: APIClient
    private let tokenManager: TokenManager

    // MARK: - Init

    init(apiClient: APIClient = .shared, tokenManager: TokenManager = .shared) {
        self.apiClient = apiClient
        self.tokenManager = tokenManager
    }

    // MARK: - Load

    func loadProfile() async {
        isLoadingProfile = true
        errorMessage = nil

        do {
            profile = try await apiClient.request(.getMe)
        } catch let error as APIError {
            errorMessage = error.localizedDescription
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoadingProfile = false
    }

    func loadLicence() async {
        isLoadingLicence = true

        do {
            licence = try await apiClient.request(.getLicenceStatus)
        } catch {
            // Licence load is non-critical.
        }

        isLoadingLicence = false
    }

    func loadAll() async {
        await withTaskGroup(of: Void.self) { group in
            group.addTask { await self.loadProfile() }
            group.addTask { await self.loadLicence() }
        }
    }

    // MARK: - Sign Out

    func signOut() {
        tokenManager.clear()
        NotificationCenter.default.post(name: .vairiotAuthStateChanged, object: false)
        didSignOut = true
    }

    // MARK: - Computed

    var appVersion: String {
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "?"
        let build = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "?"
        return "\(version) (\(build))"
    }

    var rolesDisplay: String {
        guard let roles = profile?.roles, !roles.isEmpty else { return "No roles" }
        return roles.map { $0.replacingOccurrences(of: "_", with: " ").capitalized }.joined(separator: ", ")
    }

    var licenceStatusColor: String {
        guard let status = licence?.status.lowercased() else { return "grey" }
        switch status {
        case "active":    return "green"
        case "trial":     return "amber"
        case "expired":   return "red"
        case "suspended": return "red"
        default:          return "grey"
        }
    }
}
