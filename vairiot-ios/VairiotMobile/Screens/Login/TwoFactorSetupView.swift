import SwiftUI
import UIKit
import CoreImage.CIFilterBuiltins

struct TwoFactorSetupView: View {
    let setupToken: String
    let secret: String
    let otpauthUrl: String
    let backupCodes: [String]
    let apiClient: APIClient
    let tokenManager: TokenManager

    @State private var code: String = ""
    @State private var isLoading: Bool = false
    @State private var errorMessage: String?
    @State private var isVerified: Bool = false
    @State private var showCopiedToast: Bool = false

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                qrSection
                secretSection
                backupCodesSection
                verifySection
            }
            .padding(24)
        }
        .navigationTitle("Set Up 2FA")
        .navigationBarTitleDisplayMode(.inline)
        .overlay(alignment: .top) {
            if showCopiedToast {
                toastView
            }
        }
    }

    // MARK: - QR Code

    private var qrSection: some View {
        VStack(spacing: 12) {
            Text("Scan this QR code with your authenticator app")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

            if let qrImage = generateQRCode(from: otpauthUrl) {
                Image(uiImage: qrImage)
                    .interpolation(.none)
                    .resizable()
                    .scaledToFit()
                    .frame(width: 200, height: 200)
                    .padding(16)
                    .background(Color.white)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .shadow(color: .black.opacity(0.08), radius: 8)
            }
        }
    }

    // MARK: - Secret Key

    private var secretSection: some View {
        VStack(spacing: 8) {
            Text("Or enter this secret key manually:")
                .font(.caption)
                .foregroundStyle(.secondary)

            HStack {
                Text(secret)
                    .font(.system(.body, design: .monospaced))
                    .foregroundStyle(Color.vairiotCharcoal)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)

                Button {
                    UIPasteboard.general.string = secret
                    withAnimation {
                        showCopiedToast = true
                    }
                    Task {
                        try? await Task.sleep(for: .seconds(2))
                        withAnimation { showCopiedToast = false }
                    }
                } label: {
                    Image(systemName: "doc.on.doc")
                        .font(.body)
                        .foregroundStyle(Color.vairiotViolet)
                }
            }
            .padding(12)
            .background(Color.vairiotWash)
            .clipShape(RoundedRectangle(cornerRadius: 10))
        }
    }

    // MARK: - Backup Codes

    private var backupCodesSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundStyle(Color.warningAmber)
                Text("Save these backup codes")
                    .font(.headline)
            }

            Text("Store them in a safe place. Each code can only be used once.")
                .font(.caption)
                .foregroundStyle(.secondary)

            LazyVGrid(columns: [
                GridItem(.flexible()),
                GridItem(.flexible())
            ], spacing: 8) {
                ForEach(backupCodes, id: \.self) { code in
                    Text(code)
                        .font(.system(.caption, design: .monospaced))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 6)
                        .frame(maxWidth: .infinity)
                        .background(Color.vairiotWash)
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                }
            }

            Button {
                UIPasteboard.general.string = backupCodes.joined(separator: "\n")
                withAnimation {
                    showCopiedToast = true
                }
                Task {
                    try? await Task.sleep(for: .seconds(2))
                    withAnimation { showCopiedToast = false }
                }
            } label: {
                Label("Copy All Codes", systemImage: "doc.on.doc")
                    .font(.subheadline)
            }
        }
        .padding(16)
        .background(Color.warningAmber.opacity(0.06))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color.warningAmber.opacity(0.2), lineWidth: 1)
        )
    }

    // MARK: - Verification

    private var verifySection: some View {
        VStack(spacing: 16) {
            Text("Enter the code from your authenticator app to verify setup")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

            TextField("000000", text: $code)
                .keyboardType(.numberPad)
                .font(.system(size: 28, weight: .medium, design: .monospaced))
                .multilineTextAlignment(.center)
                .padding(14)
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

            if let error = errorMessage {
                Text(error)
                    .font(.subheadline)
                    .foregroundStyle(Color.errorRed)
            }

            LoadingButton(
                title: "Verify & Activate",
                isLoading: isLoading
            ) {
                Task { await verify() }
            }
            .disabled(code.count != 6)
        }
    }

    // MARK: - Toast

    private var toastView: some View {
        Text("Copied to clipboard")
            .font(.subheadline)
            .fontWeight(.medium)
            .foregroundStyle(.white)
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(Color.vairiotCharcoal, in: Capsule())
            .transition(.move(edge: .top).combined(with: .opacity))
            .padding(.top, 8)
    }

    // MARK: - QR Code Generation

    private func generateQRCode(from string: String) -> UIImage? {
        let context = CIContext()
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(string.utf8)
        filter.correctionLevel = "M"

        guard let ciImage = filter.outputImage else { return nil }

        let scale = 200.0 / ciImage.extent.width
        let scaledImage = ciImage.transformed(by: CGAffineTransform(scaleX: scale, y: scale))

        guard let cgImage = context.createCGImage(scaledImage, from: scaledImage.extent) else {
            return nil
        }

        return UIImage(cgImage: cgImage)
    }

    // MARK: - Verify

    private func verify() async {
        errorMessage = nil
        isLoading = true

        let device = DeviceCheckIn(
            fingerprint: UIDevice.current.identifierForVendor?.uuidString ?? UUID().uuidString,
            deviceName: UIDevice.current.name
        )

        let request = TwoFactorSetupVerifyRequest(
            setupToken: setupToken,
            token: code,
            device: device
        )

        do {
            let response: LoginResponse = try await apiClient.request(.verify2FASetup(request))

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
