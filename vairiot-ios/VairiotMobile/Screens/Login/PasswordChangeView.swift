import SwiftUI
import UIKit

struct PasswordChangeView: View {
    let passwordChangeToken: String
    let apiClient: APIClient
    let tokenManager: TokenManager

    @State private var currentPassword: String = ""
    @State private var newPassword: String = ""
    @State private var confirmPassword: String = ""
    @State private var isLoading: Bool = false
    @State private var errorMessage: String?
    @State private var isChanged: Bool = false

    @Environment(\.dismiss) private var dismiss

    private var passwordsMatch: Bool {
        !newPassword.isEmpty && newPassword == confirmPassword
    }

    private var meetsMinLength: Bool {
        newPassword.count >= 8
    }

    private var hasUppercase: Bool {
        newPassword.contains(where: \.isUppercase)
    }

    private var hasLowercase: Bool {
        newPassword.contains(where: \.isLowercase)
    }

    private var hasNumber: Bool {
        newPassword.contains(where: \.isNumber)
    }

    private var isFormValid: Bool {
        !currentPassword.isEmpty
            && meetsMinLength
            && hasUppercase
            && hasLowercase
            && hasNumber
            && passwordsMatch
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                headerSection
                formFields
                requirementsSection
                if let error = errorMessage {
                    errorText(error)
                }
                changeButton
            }
            .padding(24)
        }
        .navigationTitle("Change Password")
        .navigationBarTitleDisplayMode(.inline)
    }

    // MARK: - Header

    private var headerSection: some View {
        VStack(spacing: 8) {
            Image(systemName: "key.horizontal")
                .font(.system(size: 40))
                .foregroundStyle(Color.vairiotViolet)

            Text("Your password must be changed before you can continue.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
    }

    // MARK: - Form

    private var formFields: some View {
        VStack(spacing: 16) {
            secureFieldGroup(label: "Current Password", text: $currentPassword)
            secureFieldGroup(label: "New Password", text: $newPassword)
            secureFieldGroup(label: "Confirm New Password", text: $confirmPassword)
        }
    }

    // MARK: - Requirements

    private var requirementsSection: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Password Requirements")
                .font(.caption)
                .fontWeight(.semibold)
                .foregroundStyle(.secondary)

            requirementRow("At least 8 characters", met: meetsMinLength)
            requirementRow("One uppercase letter", met: hasUppercase)
            requirementRow("One lowercase letter", met: hasLowercase)
            requirementRow("One number", met: hasNumber)
            requirementRow("Passwords match", met: passwordsMatch)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Color.vairiotWash)
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private func requirementRow(_ text: String, met: Bool) -> some View {
        HStack(spacing: 8) {
            Image(systemName: met ? "checkmark.circle.fill" : "circle")
                .font(.caption)
                .foregroundStyle(met ? Color.successGreen : Color.gray)
            Text(text)
                .font(.caption)
                .foregroundStyle(met ? .primary : .secondary)
        }
    }

    // MARK: - Button

    private var changeButton: some View {
        LoadingButton(
            title: "Change Password",
            isLoading: isLoading
        ) {
            Task { await changePassword() }
        }
        .disabled(!isFormValid)
    }

    // MARK: - Error

    private func errorText(_ message: String) -> some View {
        Text(message)
            .font(.subheadline)
            .foregroundStyle(Color.errorRed)
            .multilineTextAlignment(.center)
    }

    // MARK: - Components

    private func secureFieldGroup(label: String, text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.subheadline)
                .fontWeight(.medium)
                .foregroundStyle(Color.vairiotCharcoal)

            RevealableSecureField(placeholder: label, text: text)
                .padding(12)
                .background(Color.vairiotWash)
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .overlay(
                    RoundedRectangle(cornerRadius: 10)
                        .stroke(Color.gray.opacity(0.2), lineWidth: 1)
                )
        }
    }

    // MARK: - Change Password

    private func changePassword() async {
        errorMessage = nil
        isLoading = true

        let device = DeviceCheckIn(
            fingerprint: UIDevice.current.identifierForVendor?.uuidString ?? UUID().uuidString,
            deviceName: UIDevice.current.name
        )

        let request = ForcedPasswordChangeRequest(
            challengeToken: passwordChangeToken,
            currentPassword: currentPassword,
            newPassword: newPassword,
            device: device
        )

        do {
            let response: LoginResponse = try await apiClient.request(.forcedPasswordChange(request))

            if let accessToken = response.accessToken,
               let refreshToken = response.refreshToken,
               let expiresIn = response.expiresIn {
                let tokens = AuthTokens(
                    accessToken: accessToken,
                    refreshToken: refreshToken,
                    expiresIn: expiresIn
                )
                let tenantId = UserDefaults.standard.string(forKey: "savedTenantId") ?? ""
                tokenManager.save(tokens: tokens, tenantId: tenantId)
                NotificationCenter.default.post(name: .vairiotAuthStateChanged, object: true)
                isChanged = true
            } else {
                errorMessage = "Password change failed. Please try again."
            }
        } catch let error as APIError {
            errorMessage = error.userMessage
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }
}
