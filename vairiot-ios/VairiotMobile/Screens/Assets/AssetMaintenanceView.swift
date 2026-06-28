import SwiftUI

struct AssetMaintenanceView: View {

    let assetId: String
    let assetName: String
    let apiClient: APIClient

    @State private var events: [MaintenanceEventResponse] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var showCreateSheet = false

    var body: some View {
        Group {
            if isLoading && events.isEmpty {
                ProgressView("Loading...")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if events.isEmpty {
                emptyState
            } else {
                eventList
            }
        }
        .navigationTitle("Maintenance")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    showCreateSheet = true
                } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .task {
            await loadEvents()
        }
        .sheet(isPresented: $showCreateSheet) {
            NavigationStack {
                CreateMaintenanceView(
                    assetId: assetId,
                    assetName: assetName,
                    apiClient: apiClient
                ) {
                    Task { await loadEvents() }
                }
            }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 16) {
            Image(systemName: "wrench.and.screwdriver")
                .font(.system(size: 48))
                .foregroundStyle(.secondary)
            Text("No Maintenance Events")
                .font(.title3)
                .fontWeight(.semibold)
            Text("Tap + to create a maintenance event for this asset.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var eventList: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                ForEach(events) { event in
                    NavigationLink {
                        MaintenanceDetailView(eventId: event.id, apiClient: apiClient)
                    } label: {
                        maintenanceCard(event)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding()
        }
    }

    private func maintenanceCard(_ event: MaintenanceEventResponse) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(event.maintenanceType.replacingOccurrences(of: "_", with: " ").capitalized)
                    .font(.headline)
                Spacer()
                StatusBadge(
                    text: statusLabel(event.status),
                    color: statusColor(event.status)
                )
            }

            if let desc = event.description, !desc.isEmpty {
                Text(desc)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }

            if let scheduled = event.scheduledDate {
                Label(scheduled.prefix(10), systemImage: "calendar")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding()
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func loadEvents() async {
        isLoading = true
        do {
            let response: MaintenanceListResponse = try await apiClient.request(
                .listMaintenanceEvents(search: assetName)
            )
            events = response.events.filter { $0.assetId == assetId }
        } catch {
            errorMessage = "Failed to load maintenance events"
        }
        isLoading = false
    }

    private func statusColor(_ status: String) -> Color {
        switch status.lowercased() {
        case "scheduled":   return .blue
        case "in_progress": return .warningAmber
        case "completed":   return .successGreen
        case "cancelled":   return .gray
        default:            return .gray
        }
    }

    private func statusLabel(_ status: String) -> String {
        switch status.lowercased() {
        case "scheduled":   return "Scheduled"
        case "in_progress": return "In Progress"
        case "completed":   return "Completed"
        case "cancelled":   return "Cancelled"
        default:            return status.capitalized
        }
    }
}

// MARK: - Create Maintenance

struct CreateMaintenanceView: View {
    let assetId: String
    let assetName: String
    let apiClient: APIClient
    var onCreated: (() -> Void)?

    @State private var maintenanceType = "inspection"
    @State private var description = ""
    @State private var notes = ""
    @State private var scheduledDate = Date()
    @State private var setScheduledDate = false
    @State private var isSaving = false
    @State private var errorMessage: String?

    @Environment(\.dismiss) private var dismiss

    private let maintenanceTypes = [
        ("inspection", "Inspection"),
        ("preventive", "Preventive"),
        ("corrective", "Corrective"),
        ("calibration", "Calibration"),
        ("cleaning", "Cleaning"),
        ("replacement", "Replacement"),
    ]

    var body: some View {
        Form {
            Section("Asset") {
                Text(assetName)
                    .foregroundStyle(.secondary)
            }

            Section("Type") {
                Picker("Maintenance Type", selection: $maintenanceType) {
                    ForEach(maintenanceTypes, id: \.0) { type in
                        Text(type.1).tag(type.0)
                    }
                }
                .pickerStyle(.inline)
                .labelsHidden()
            }

            Section("Description") {
                TextEditor(text: $description)
                    .frame(minHeight: 60)
            }

            Section("Schedule") {
                Toggle("Set Scheduled Date", isOn: $setScheduledDate)
                if setScheduledDate {
                    DatePicker(
                        "Date",
                        selection: $scheduledDate,
                        displayedComponents: [.date, .hourAndMinute]
                    )
                }
            }

            Section("Notes") {
                TextEditor(text: $notes)
                    .frame(minHeight: 60)
            }

            if let error = errorMessage {
                Section {
                    Text(error)
                        .foregroundStyle(Color.errorRed)
                        .font(.subheadline)
                }
            }
        }
        .navigationTitle("New Maintenance")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel") { dismiss() }
            }
            ToolbarItem(placement: .confirmationAction) {
                if isSaving {
                    ProgressView()
                } else {
                    Button("Save") {
                        Task { await save() }
                    }
                    .fontWeight(.semibold)
                }
            }
        }
    }

    private func save() async {
        isSaving = true
        errorMessage = nil

        let isoFormatter = ISO8601DateFormatter()
        isoFormatter.formatOptions = [.withInternetDateTime]

        let request = MaintenanceCreateRequest(
            assetId: assetId,
            maintenanceType: maintenanceType,
            description: description.isEmpty ? nil : description,
            notes: notes.isEmpty ? nil : notes,
            status: "scheduled",
            scheduledDate: setScheduledDate ? isoFormatter.string(from: scheduledDate) : nil
        )

        do {
            let _: MaintenanceEventResponse = try await apiClient.request(
                .createMaintenanceEvent(request)
            )
            onCreated?()
            dismiss()
        } catch let error as APIError {
            errorMessage = error.userMessage
        } catch {
            errorMessage = error.localizedDescription
        }

        isSaving = false
    }
}
