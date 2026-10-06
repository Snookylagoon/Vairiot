import SwiftData
import SwiftUI
import UIKit

struct ProfileView: View {

    @State private var viewModel: ProfileViewModel
    @State private var showSignOutConfirmation = false
    // Live views of the offline queues (SwiftData updates these on change).
    @Query(sort: \QueuedScan.createdAt) private var queuedScans: [QueuedScan]
    @Query(sort: \QueuedAssetCreate.createdAt) private var queuedAssets: [QueuedAssetCreate]
    @Query(sort: \QueuedPhoto.createdAt) private var queuedPhotos: [QueuedPhoto]
    @State private var pendingDiscard: PendingUpload?
    @State private var showDiscardAllConfirmation = false
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
            if pendingTotal > 0 { pendingUploadsSection }
            appInfoSection
            signOutSection
        }
        .listStyle(.insetGrouped)
    }

    // MARK: - Pending uploads

    /// Rejected rows listed individually; the rest are summarised.
    private static let maxRejectedShown = 5

    private var pendingTotal: Int { queuedScans.count + queuedAssets.count + queuedPhotos.count }

    private var rejected: [(item: PendingUpload, label: String, error: String?)] {
        let dead = QueueState.dead
        return queuedScans.filter { $0.state == dead }.map { (.scan($0), "Audit scan \($0.tagValue)", $0.lastError) }
            + queuedAssets.filter { $0.state == dead }.map { (.asset($0), "New asset \"\($0.name)\"", $0.lastError) }
            + queuedPhotos.filter { $0.state == dead }.map { (.photo($0), "Asset photo", $0.lastError) }
    }

    /// Work saved on this device that the server doesn't have yet. Nothing here
    /// is deleted automatically: waiting and retrying rows sync on their own,
    /// rejected rows stay until the user retries or discards them.
    private var pendingUploadsSection: some View {
        Section("Pending uploads") {
            queueRow("Audit scans", states: queuedScans.map(\.state))
            queueRow("New assets", states: queuedAssets.map(\.state))
            queueRow("Photos", states: queuedPhotos.map(\.state))

            ForEach(Array(rejected.prefix(Self.maxRejectedShown).enumerated()), id: \.offset) { _, entry in
                VStack(alignment: .leading, spacing: 6) {
                    Text(entry.label)
                        .font(.subheadline)
                        .fontWeight(.medium)
                    if let error = entry.error {
                        Text(error)
                            .font(.caption)
                            .foregroundStyle(Color.errorRed)
                    }
                    HStack(spacing: 16) {
                        Button("Retry") {
                            Task { await SyncManager.shared.retry(entry.item) }
                        }
                        Button("Discard", role: .destructive) {
                            pendingDiscard = entry.item
                        }
                    }
                    .buttonStyle(.borderless)
                    .font(.subheadline)
                }
                .padding(.vertical, 2)
            }
            if rejected.count > Self.maxRejectedShown {
                let hidden = rejected.count - Self.maxRejectedShown
                Text("…and \(hidden) more rejected item\(hidden == 1 ? "" : "s")")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            if rejected.isEmpty {
                Button("Sync now") {
                    Task { await SyncManager.shared.syncNow() }
                }
            } else {
                Button("Retry all rejected") {
                    Task { await SyncManager.shared.retryAllRejected() }
                }
                Button("Discard all rejected", role: .destructive) {
                    showDiscardAllConfirmation = true
                }
            }
        }
        .confirmationDialog(
            "Discard this item?",
            isPresented: Binding(get: { pendingDiscard != nil }, set: { if !$0 { pendingDiscard = nil } }),
            titleVisibility: .visible
        ) {
            Button("Discard", role: .destructive) {
                if let item = pendingDiscard { SyncManager.shared.discard(item) }
                pendingDiscard = nil
            }
            Button("Cancel", role: .cancel) { pendingDiscard = nil }
        } message: {
            Text("It will be permanently deleted from this device and will never reach the server.")
        }
        .confirmationDialog(
            "Discard all rejected items?",
            isPresented: $showDiscardAllConfirmation,
            titleVisibility: .visible
        ) {
            Button("Discard \(rejected.count) item\(rejected.count == 1 ? "" : "s")", role: .destructive) {
                SyncManager.shared.discardAllRejected()
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("They will be permanently deleted from this device and will never reach the server.")
        }
    }

    @ViewBuilder
    private func queueRow(_ label: String, states: [String]) -> some View {
        let waiting = states.filter { $0 == QueueState.pending }.count
        let retrying = states.filter { $0 == QueueState.failed }.count
        let rejectedCount = states.filter { $0 == QueueState.dead }.count
        if !states.isEmpty {
            HStack {
                Text(label)
                Spacer()
                Text([
                    waiting > 0 ? "\(waiting) waiting" : nil,
                    retrying > 0 ? "\(retrying) retrying" : nil,
                    rejectedCount > 0 ? "\(rejectedCount) rejected" : nil,
                ].compactMap { $0 }.joined(separator: " · "))
                .font(.subheadline)
                .foregroundStyle(rejectedCount > 0 ? Color.errorRed : .secondary)
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
