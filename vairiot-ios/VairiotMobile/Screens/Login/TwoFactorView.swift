import SwiftUI
import UIKit

struct TwoFactorView: View {
    let challengeToken: String
    let apiClient: APIClient
    let tokenManager: TokenManager

    @State private var code: String = ""
    @State private var isLoading: Bool = false
    @State private var errorMessage: String?
    @State private var isVerified: Bool = false

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 32) {
            Spacer()

            headerSection

            codeEntry

            if let error = errorMessage {
                Text(error)
                    .font(.subheadline)
                    .foregroundStyle(Color.errorRed)
                    .multilineTextAlignment(.center)
            }

            LoadingButton(
                title: "Verify",
                isLoading: isLoading
            ) {
                Task { await verify() }
            }
            .disabled(code.count != 6)
            .padding(.horizontal, 24)

            Spacer()
        }
        .padding(24)
        .navigationTitle("Two-Factor Authentication")
        .navigationBarTitleDisplayMode(.inline)
    }

    // MARK: - Header

    private var headerSection: some View {
        VStack(spacing: 12) {
            Image(systemName: "lock.shield")
                .font(.system(size: 44))
                .foregroundStyle(Color.vairiotViolet)

            Text("Enter the 6-digit code from your authenticator app")
                .font(.body)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
    }

    // MARK: - Code Entry

    private var codeEntry: some View {
        TextField("000000", text: $code)
            .keyboardType(.numberPad)
            .font(.system(size: 32, weight: .medium, design: .monospaced))
            .multilineTextAlignment(.center)
            .padding(16)
            .background(Color.vairiotWash)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(Color.vairiotViolet.opacity(0.3), lineWidth: 1)
            )
            .onChange(of: code) { _, newValue in
                let filtered = newValue.filter(\.isNumber)
                if filtered.count > 6 {
                    code = String(filtered.prefix(6))
                } else if filtered != newValue {
                    code = filtered
                }
            }
            .padding(.horizontal, 24)
    }

    // MARK: - Verify

    private func verify() async {
        errorMessage = nil
        isLoading = true

        let device = DeviceCheckIn(
            fingerprint: UIDevice.current.identifierForVendor?.uuidString ?? UUID().uuidString,
            deviceName: UIDevice.current.name
        )

        let request = TwoFactorLoginRequest(
            challengeToken: challengeToken,
            token: code,
            device: device
        )

        do {
            let response: LoginResponse = try await apiClient.request(.loginWith2FA(request))

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
                isVerified = true
            } else {
                errorMessage = "Verification failed. Please try again."
            }
        } catch let error as APIError {
            errorMessage = error.userMessage
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }
}
