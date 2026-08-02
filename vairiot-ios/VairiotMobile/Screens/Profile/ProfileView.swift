import SwiftUI
import UIKit

struct ProfileView: View {

    @State private var viewModel: ProfileViewModel
    @State private var showSignOutConfirmation = false
    @State private var failedSyncCount = 0
    @State private var showDiscardConfirmation = false
    @State private var showUDIDEntry = false
    @State private var udidEntryText = ""
    @State private var showUDIDInvalid = false
    @State private var showUDIDCopied = false

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
            viewModel.refreshDeviceUDID()
            await viewModel.loadAll()
            failedSyncCount = SyncManager.shared.failedCount
        }
        .onReceive(NotificationCenter.default.publisher(for: .vairiotDeviceUDIDSaved)) { _ in
            viewModel.refreshDeviceUDID()
        }
    }

    // MARK: - Content

    private var profileContent: some View {
        List {
            userInfoSection
            licenceSection
            deviceSection
            if failedSyncCount > 0 { failedSyncSection }
            appInfoSection
            signOutSection
        }
        .listStyle(.insetGrouped)
    }

    // MARK: - Failed offline sync items

    private var failedSyncSection: some View {
        Section("Failed sync items") {
            Text("\(failedSyncCount) offline item\(failedSyncCount == 1 ? "" : "s") could not be uploaded after several tries.")
                .font(.subheadline)
            Button("Retry all") {
                Task {
                    await SyncManager.shared.retryAllFailed()
                    failedSyncCount = SyncManager.shared.failedCount
                }
            }
            Button("Discard", role: .destructive) {
                showDiscardConfirmation = true
            }
            .confirmationDialog(
                "Discard failed items?",
                isPresented: $showDiscardConfirmation,
                titleVisibility: .visible
            ) {
                Button("Discard \(failedSyncCount) item\(failedSyncCount == 1 ? "" : "s")", role: .destructive) {
                    SyncManager.shared.discardAllFailed()
                    failedSyncCount = SyncManager.shared.failedCount
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("These offline items will be permanently deleted and will never reach the server.")
            }
        }
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

    // MARK: - Device (UDID)

    private var deviceSection: some View {
        Section {
            if let udid = viewModel.deviceUDID {
                VStack(alignment: .leading, spacing: 6) {
                    Label("Device UDID", systemImage: "iphone")
                    Text(udid)
                        .font(.footnote.monospaced())
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                }
                .contextMenu {
                    Button {
                        UIPasteboard.general.string = udid
                        showUDIDCopied = true
                    } label: {
                        Label("Copy UDID", systemImage: "doc.on.doc")
                    }
                    Button(role: .destructive) {
                        viewModel.clearDeviceUDID()
                    } label: {
                        Label("Remove", systemImage: "trash")
                    }
                }

                Button {
                    UIPasteboard.general.string = udid
                    showUDIDCopied = true
                } label: {
                    Label("Copy UDID", systemImage: "doc.on.doc")
                }
            } else {
                if let enrolURL = viewModel.udidEnrolmentURL {
                    Link(destination: enrolURL) {
                        HStack {
                            Label("Find my UDID", systemImage: "iphone.badge.exclamationmark")
                            Spacer()
                            Image(systemName: "arrow.up.forward.app")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                Button {
                    udidEntryText = ""
                    showUDIDEntry = true
                } label: {
                    Label("Enter UDID manually", systemImage: "keyboard")
                }
            }
        } header: {
            Text("Device")
        } footer: {
            if viewModel.deviceUDID == nil {
                Text("Your device identifier (UDID) is needed to authorise this iPhone for app installs. It is stored securely on this device only.")
            } else {
                Text("Stored securely in the device Keychain.")
            }
        }
        .alert("Enter UDID", isPresented: $showUDIDEntry) {
            TextField("00008030-001A14E93C38802E", text: $udidEntryText)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.characters)
            Button("Save") {
                if !viewModel.saveDeviceUDID(udidEntryText) {
                    showUDIDInvalid = true
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Paste the UDID shown at the end of the enrollment page.")
        }
        .alert("Invalid UDID", isPresented: $showUDIDInvalid) {
            Button("OK") {}
        } message: {
            Text("That doesn't look like a device UDID. It should match the value shown on the enrollment page, e.g. 00008030-001A14E93C38802E.")
        }
        .alert("Copied", isPresented: $showUDIDCopied) {
            Button("OK") {}
        } message: {
            Text("UDID copied to the clipboard.")
        }
    }

    // MARK: - App Info

    private var appInfoSection: some View {
        Section("About") {
            profileRow(icon: "app.badge", label: "Version", value: viewModel.appVersion)

            if let updateURL = viewModel.updateCheckURL {
                Link(destination: updateURL) {
                    HStack {
                        Label("Check for Updates", systemImage: "arrow.down.circle")
                        Spacer()
                        Image(systemName: "arrow.up.forward.app")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
            }

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
