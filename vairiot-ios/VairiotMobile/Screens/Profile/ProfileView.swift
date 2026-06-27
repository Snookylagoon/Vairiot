import SwiftUI

struct ProfileView: View {

    @State private var viewModel: ProfileViewModel
    @State private var showSignOutConfirmation = false

    init(apiClient: APIClient = .shared, tokenManager: TokenManager = .shared) {
        _viewModel = State(initialValue: ProfileViewModel(apiClient: apiClient, tokenManager: tokenManager))
    }

    var body: some View {
        Group {
            if viewModel.isLoadingProfile && viewModel.profile == nil {
                ProgressView("Loading profile...")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                profileContent
            }
        }
        .navigationTitle("Profile")
        .alert("Error", isPresented: .constant(viewModel.errorMessage != nil)) {
            Button("OK") { viewModel.errorMessage = nil }
        } message: {
            Text(viewModel.errorMessage ?? "")
        }
        .confirmationDialog(
            "Sign Out",
            isPresented: $showSignOutConfirmation,
            titleVisibility: .visible
        ) {
            Button("Sign Out", role: .destructive) {
                viewModel.signOut()
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Are you sure you want to sign out? You will need to log in again.")
        }
        .task {
            await viewModel.loadAll()
        }
    }

    // MARK: - Content

    private var profileContent: some View {
        List {
            userInfoSection
            licenceSection
            appInfoSection
            signOutSection
        }
        .listStyle(.insetGrouped)
    }

    // MARK: - User Info

    private var userInfoSection: some View {
        Section("Account") {
            if let profile = viewModel.profile {
                profileRow(icon: "envelope", label: "Email", value: profile.email)
                profileRow(icon: "building.2", label: "Tenant", value: profile.tenantName ?? profile.tenantId)
                profileRow(icon: "person.badge.shield.checkmark", label: "Roles", value: viewModel.rolesDisplay)
            } else {
                Text("Unable to load profile")
                    .foregroundStyle(.secondary)
            }
        }
    }

    // MARK: - Licence

    private var licenceSection: some View {
        Section("Licence") {
            if viewModel.isLoadingLicence && viewModel.licence == nil {
                ProgressView()
            } else if let licence = viewModel.licence {
                profileRow(icon: "crown", label: "Tier", value: licence.tierDisplayName)

                HStack {
                    Label {
                        Text("Status")
                    } icon: {
                        Image(systemName: "circle.fill")
                            .font(.caption2)
                            .foregroundStyle(licenceStatusColor(licence.status))
                    }

                    Spacer()

                    Text(licence.status.capitalized)
                        .foregroundStyle(.secondary)
                }

                if let expiresAt = licence.expiresAt {
                    profileRow(icon: "calendar.badge.clock", label: "Expires", value: expiresAt.formattedProfileDate)
                }

                if let daysRemaining = licence.daysRemaining {
                    profileRow(icon: "hourglass", label: "Days Remaining", value: "\(daysRemaining)")
                }
            } else {
                Text("Unable to load licence information")
                    .foregroundStyle(.secondary)
            }
        }
    }

    // MARK: - App Info

    private var appInfoSection: some View {
        Section("About") {
            profileRow(icon: "app.badge", label: "Version", value: viewModel.appVersion)

            HStack {
                Label("Vairiot Mobile", systemImage: "info.circle")
                Spacer()
                Text("Asset Management")
                    .foregroundStyle(.secondary)
            }
        }
    }

    // MARK: - Sign Out

    private var signOutSection: some View {
        Section {
            Button(role: .destructive) {
                showSignOutConfirmation = true
            } label: {
                HStack {
                    Spacer()
                    Label("Sign Out", systemImage: "rectangle.portrait.and.arrow.right")
                        .fontWeight(.semibold)
                    Spacer()
                }
            }
        }
    }

    // MARK: - Helpers

    private func profileRow(icon: String, label: String, value: String) -> some View {
        HStack {
            Label(label, systemImage: icon)
            Spacer()
            Text(value)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.trailing)
        }
    }

    private func licenceStatusColor(_ status: String) -> Color {
        switch status.lowercased() {
        case "active":    return .successGreen
        case "trial":     return .warningAmber
        case "expired":   return .errorRed
        case "suspended": return .errorRed
        default:          return .gray
        }
    }
}

// MARK: - Date Formatting

private extension String {
    var formattedProfileDate: String {
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = iso.date(from: self) ?? ISO8601DateFormatter().date(from: self) else {
            return self
        }
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .none
        return formatter.string(from: date)
    }
}
