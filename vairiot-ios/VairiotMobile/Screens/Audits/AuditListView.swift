import SwiftUI

struct AuditListView: View {

    @State private var viewModel: AuditListViewModel

    init(apiClient: APIClient = .shared) {
        _viewModel = State(initialValue: AuditListViewModel(apiClient: apiClient))
    }

    var body: some View {
        Group {
            if viewModel.isLoading && viewModel.audits.isEmpty {
                ProgressView("Loading audits...")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if viewModel.audits.isEmpty {
                emptyState
            } else {
                auditList
            }
        }
        .navigationTitle("Audits")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    viewModel.resetCreateForm()
                    viewModel.showCreateSheet = true
                } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .sheet(isPresented: $viewModel.showCreateSheet) {
            createAuditSheet
        }
        .alert("Error", isPresented: .constant(viewModel.errorMessage != nil)) {
            Button("OK") { viewModel.errorMessage = nil }
        } message: {
            Text(viewModel.errorMessage ?? "")
        }
        .task {
            await viewModel.loadAudits()
        }
        .refreshable {
            await viewModel.loadAudits()
        }
    }

    // MARK: - Audit List

    private var auditList: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                ForEach(viewModel.audits) { audit in
                    NavigationLink {
                        AuditRunView(audit: audit)
                    } label: {
                        AuditCard(audit: audit)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal)
            .padding(.top, 8)
        }
    }

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(spacing: 16) {
            Image(systemName: "checklist.checked")
                .font(.system(size: 48))
                .foregroundStyle(.secondary)

            Text("No Audits")
                .font(.title2)
                .fontWeight(.semibold)

            Text("Create an audit campaign to start tracking your assets.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)

            Button {
                viewModel.resetCreateForm()
                viewModel.showCreateSheet = true
            } label: {
                Label("Create Audit", systemImage: "plus")
            }
            .buttonStyle(.borderedProminent)
            .tint(.vairiotViolet)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Create Sheet

    private var createAuditSheet: some View {
        NavigationStack {
            Form {
                Section("Audit Details") {
                    TextField("Audit Name", text: $viewModel.newAuditName)
                        .textInputAutocapitalization(.words)

                    Picker("Mode", selection: $viewModel.newAuditMode) {
                        Text("Sighted").tag("sighted")
                        Text("Blind").tag("blind")
                    }
                }
            }
            .navigationTitle("New Audit")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        viewModel.showCreateSheet = false
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    LoadingButton(
                        title: "Create",
                        isLoading: viewModel.isCreating
                    ) {
                        Task { await viewModel.createAudit() }
                    }
                }
            }
        }
        .presentationDetents([.medium])
    }
}

// MARK: - Audit Card

private struct AuditCard: View {

    let audit: AuditCampaignResponse

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(audit.name)
                    .font(.headline)
                    .foregroundStyle(.primary)

                Spacer()

                statusBadge
            }

            HStack(spacing: 16) {
                Label(audit.mode.capitalized, systemImage: "eye")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                Label("\(audit.scanCount) scans", systemImage: "barcode.viewfinder")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            if let createdAt = audit.createdAt.formattedDate {
                HStack(spacing: 4) {
                    Image(systemName: "calendar")
                        .font(.caption2)
                    Text("Created \(createdAt)")
                        .font(.caption2)
                }
                .foregroundStyle(.secondary)
            }
        }
        .padding()
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private var statusBadge: some View {
        let (text, color) = statusInfo(audit.status)
        return StatusBadge(text: text, color: color)
    }

    private func statusInfo(_ status: String) -> (String, Color) {
        switch status.lowercased() {
        case "draft":
            return ("Draft", .gray)
        case "in_progress":
            return ("In Progress", .warningAmber)
        case "completed":
            return ("Completed", .successGreen)
        default:
            return (status.capitalized, .gray)
        }
    }
}

// MARK: - String Date Formatting

private extension String {
    var formattedDate: String? {
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = iso.date(from: self) ?? ISO8601DateFormatter().date(from: self) else {
            return nil
        }
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .none
        return formatter.string(from: date)
    }
}
