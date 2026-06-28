import SwiftUI

struct LoginView: View {
    @State private var viewModel: LoginViewModel
    @State private var navigationPath = NavigationPath()

    init(apiClient: APIClient, tokenManager: TokenManager) {
        _viewModel = State(initialValue: LoginViewModel(
            apiClient: apiClient,
            tokenManager: tokenManager
        ))
    }

    var body: some View {
        NavigationStack(path: $navigationPath) {
            ScrollView {
                VStack(spacing: 0) {
                    headerSection
                    formContent
                }
            }
            .background(Color.white)
            .ignoresSafeArea(edges: .top)
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: LoginDestination.self) { destination in
                destinationView(for: destination)
            }
            .onChange(of: viewModel.loginState) { _, newState in
                handleStateChange(newState)
            }
        }
    }

    // MARK: - Header

    private var headerSection: some View {
        ZStack {
            LinearGradient(
                colors: [.vairiotPink, .vairiotViolet],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea(edges: .top)

            VStack(spacing: 8) {
                VairiotLogo(size: 64)

                Text("Vairiot")
                    .font(.largeTitle)
                    .fontWeight(.bold)
                    .foregroundStyle(.white)

                Text("Asset Intelligence")
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.85))
            }
            .padding(.top, 60)
            .padding(.bottom, 40)
        }
        .frame(minHeight: 260)
    }

    // MARK: - Form

    private var formContent: some View {
        VStack(spacing: 20) {
            if let error = viewModel.errorMessage {
                errorBanner(error)
            }

            VStack(spacing: 16) {
                fieldGroup(label: "Email") {
                    TextField("you@company.com", text: $viewModel.email)
                        .keyboardType(.emailAddress)
                        .textContentType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }

                fieldGroup(label: "Password") {
                    SecureField("Password", text: $viewModel.password)
                        .textContentType(.password)
                }

                fieldGroup(label: "Tenant ID") {
                    TextField("your-tenant-id", text: $viewModel.tenantId)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }
            }

            LoadingButton(
                title: "Sign In",
                isLoading: viewModel.isLoading
            ) {
                Task { await viewModel.login() }
            }
            .padding(.top, 8)
        }
        .padding(24)
    }

    // MARK: - Navigation

    private func handleStateChange(_ state: LoginViewModel.LoginState) {
        switch state {
        case .needsTwoFactor(let token):
            navigationPath.append(LoginDestination.twoFactor(challengeToken: token))
        case .needsTwoFactorSetup(let setupToken, let secret, let url, let codes):
            navigationPath.append(LoginDestination.twoFactorSetup(
                setupToken: setupToken,
                secret: secret,
                otpauthUrl: url,
                backupCodes: codes
            ))
        case .needsPasswordChange(let token):
            navigationPath.append(LoginDestination.passwordChange(passwordChangeToken: token))
        default:
            break
        }
    }

    @ViewBuilder
    private func destinationView(for destination: LoginDestination) -> some View {
        switch destination {
        case .twoFactor(let challengeToken):
            TwoFactorView(
                challengeToken: challengeToken,
                apiClient: viewModel.apiClient,
                tokenManager: viewModel.tokenManager
            )
        case .twoFactorSetup(let setupToken, let secret, let otpauthUrl, let backupCodes):
            TwoFactorSetupView(
                setupToken: setupToken,
                secret: secret,
                otpauthUrl: otpauthUrl,
                backupCodes: backupCodes,
                apiClient: viewModel.apiClient,
                tokenManager: viewModel.tokenManager
            )
        case .passwordChange(let passwordChangeToken):
            PasswordChangeView(
                passwordChangeToken: passwordChangeToken,
                apiClient: viewModel.apiClient,
                tokenManager: viewModel.tokenManager
            )
        }
    }

    // MARK: - Components

    private func fieldGroup<Content: View>(label: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.subheadline)
                .fontWeight(.medium)
                .foregroundStyle(Color.vairiotCharcoal)

            content()
                .padding(12)
                .background(Color.vairiotWash)
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .overlay(
                    RoundedRectangle(cornerRadius: 10)
                        .stroke(Color.gray.opacity(0.2), lineWidth: 1)
                )
        }
    }

    private func errorBanner(_ message: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "exclamationmark.triangle.fill")
            Text(message)
                .font(.subheadline)
        }
        .foregroundStyle(Color.errorRed)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Color.errorRed.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }
}

// MARK: - Navigation Destination

enum LoginDestination: Hashable {
    case twoFactor(challengeToken: String)
    case twoFactorSetup(
        setupToken: String,
        secret: String,
        otpauthUrl: String,
        backupCodes: [String]
    )
    case passwordChange(passwordChangeToken: String)
}
