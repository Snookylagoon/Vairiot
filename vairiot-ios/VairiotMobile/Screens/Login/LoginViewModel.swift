import Foundation
import UIKit

@MainActor
@Observable
final class LoginViewModel {

    // MARK: - Login State

    enum LoginState: Equatable {
        case idle
        case loading
        case success
        case needsTwoFactor(challengeToken: String)
        case needsTwoFactorSetup(
            setupToken: String,
            secret: String,
            otpauthUrl: String,
            backupCodes: [String]
        )
        case needsPasswordChange(passwordChangeToken: String)
    }

    // MARK: - Properties

    var email: String = ""
    var password: String = ""
    var tenantId: String = UserDefaults.standard.string(forKey: "savedTenantId") ?? ""
    var isLoading: Bool = false
    var errorMessage: String?
    var loginState: LoginState = .idle

    let apiClient: APIClient
    let tokenManager: TokenManager

    // MARK: - Init

    init(apiClient: APIClient, tokenManager: TokenManager) {
        self.apiClient = apiClient
        self.tokenManager = tokenManager
    }

    // MARK: - Login

    func login() async {
        guard validate() else { return }

        errorMessage = nil
        isLoading = true
        loginState = .loading

        let device = DeviceCheckIn(
            fingerprint: deviceFingerprint(),
            deviceName: UIDevice.current.name
        )

        let request = LoginRequest(
            email: email.trimmingCharacters(in: .whitespacesAndNewlines),
            password: password,
            tenantId: tenantId.trimmingCharacters(in: .whitespacesAndNewlines),
            device: device
        )

        do {
            let response: LoginResponse = try await apiClient.request(.login(request))
            let trimmedTenant = tenantId.trimmingCharacters(in: .whitespacesAndNewlines)
            UserDefaults.standard.set(trimmedTenant, forKey: "savedTenantId")
            handleLoginResponse(response, tenantId: trimmedTenant)
        } catch let error as APIError {
            loginState = .idle
            errorMessage = error.userMessage
        } catch {
            loginState = .idle
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }

    // MARK: - Response Handling

    private func handleLoginResponse(_ response: LoginResponse, tenantId: String? = nil) {
        if let accessToken = response.accessToken,
           let refreshToken = response.refreshToken,
           let expiresIn = response.expiresIn {
            let tokens = AuthTokens(
                accessToken: accessToken,
                refreshToken: refreshToken,
                expiresIn: expiresIn
            )
            tokenManager.save(tokens: tokens, tenantId: tenantId ?? self.tenantId)
            loginState = .success
            NotificationCenter.default.post(name: .vairiotAuthStateChanged, object: true)
            return
        }

        if response.requiresTwoFactor == true,
           let challengeToken = response.twoFactorChallengeToken {
            loginState = .needsTwoFactor(challengeToken: challengeToken)
            return
        }

        if response.requiresTwoFactorSetup == true,
           let setupToken = response.twoFactorSetupToken {
            Task { await fetchTwoFactorSetup(setupToken: setupToken) }
            return
        }

        if response.requiresPasswordChange == true,
           let passwordChangeToken = response.passwordChangeToken {
            loginState = .needsPasswordChange(passwordChangeToken: passwordChangeToken)
            return
        }

        errorMessage = "Unexpected login response"
        loginState = .idle
    }

    private func fetchTwoFactorSetup(setupToken: String) async {
        let generateRequest = TwoFactorSetupGenerateRequest(setupToken: setupToken)
        do {
            let setup: TwoFactorSetupResponse = try await apiClient.request(
                .generate2FASetup(generateRequest)
            )
            loginState = .needsTwoFactorSetup(
                setupToken: setupToken,
                secret: setup.secret,
                otpauthUrl: setup.otpauthUrl,
                backupCodes: setup.backupCodes
            )
        } catch {
            errorMessage = "Failed to set up two-factor authentication"
            loginState = .idle
        }
    }

    // MARK: - Validation

    private func validate() -> Bool {
        if email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            errorMessage = "Email is required"
            return false
        }
        if password.isEmpty {
            errorMessage = "Password is required"
            return false
        }
        if tenantId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            errorMessage = "Tenant ID is required"
            return false
        }
        return true
    }

    // MARK: - Device Fingerprint

    private func deviceFingerprint() -> String {
        UIDevice.current.identifierForVendor?.uuidString ?? UUID().uuidString
    }
}
