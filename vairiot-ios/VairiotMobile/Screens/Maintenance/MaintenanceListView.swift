import SwiftUI

struct MaintenanceListView: View {

    @State private var viewModel: MaintenanceListViewModel

    init(apiClient: APIClient = .shared) {
        _viewModel = State(initialValue: MaintenanceListViewModel(apiClient: apiClient))
    }

    var body: some View {
        VStack(spacing: 0) {
            searchBar
            statusFilter

            Group {
                if viewModel.isLoading && viewModel.events.isEmpty {
                    ProgressView("Loading maintenance events...")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if viewModel.events.isEmpty {
                    emptyState
                } else {
                    eventList
                }
            }
        }
        .navigationTitle("Maintenance")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                NavigationLink {
                    Text("Create Maintenance Event")
                } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .alert("Error", isPresented: .constant(viewModel.errorMessage != nil)) {
            Button("OK") { viewModel.errorMessage = nil }
        } message: {
            Text(viewModel.errorMessage ?? "")
        }
        .task {
            await viewModel.loadEvents()
        }
        .refreshable {
            await viewModel.loadEvents(reset: true)
        }
    }

    // MARK: - Search Bar

    private var searchBar: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(.secondary)

            TextField("Search maintenance events...", text: $viewModel.searchQuery)
                .textFieldStyle(.plain)
                .autocorrectionDisabled()
                .onChange(of: viewModel.searchQuery) { _, _ in
                    viewModel.performSearch()
                }

            if !viewModel.searchQuery.isEmpty {
                Button {
                    viewModel.searchQuery = ""
                    viewModel.performSearch()
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .padding(.horizontal)
        .padding(.top, 8)
    }

    // MARK: - Status Filter

    private var statusFilter: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(MaintenanceListViewModel.statusOptions, id: \.label) { option in
                    let isSelected = viewModel.selectedStatus == option.value
                    Button {
                        viewModel.applyStatusFilter(option.value)
                    } label: {
                        Text(option.label)
                            .font(.caption)
                            .fontWeight(.medium)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(isSelected ? Color.vairiotViolet : Color(.tertiarySystemGroupedBackground))
                            .foregroundStyle(isSelected ? .white : .primary)
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal)
            .padding(.vertical, 8)
        }
    }

    // MARK: - Event List

    private var eventList: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                ForEach(viewModel.events) { event in
                    NavigationLink {
                        MaintenanceDetailView(eventId: event.id)
                    } label: {
                        MaintenanceCard(event: event, viewModel: viewModel)
                    }
                    .buttonStyle(.plain)
                    .onAppear {
                        if viewModel.shouldLoadMore(for: event) {
                            Task { await viewModel.loadNextPage() }
                        }
                    }
                }

                if viewModel.isLoadingMore {
                    ProgressView()
                        .padding()
                }
            }
            .padding(.horizontal)
            .padding(.top, 4)
        }
    }

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(spacing: 16) {
            Image(systemName: "wrench.and.screwdriver")
                .font(.system(size: 48))
                .foregroundStyle(.secondary)

            Text("No Maintenance Events")
                .font(.title2)
                .fontWeight(.semibold)

            Text("Maintenance events for your assets will appear here.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - Maintenance Card

private struct MaintenanceCard: View {
    let event: MaintenanceEventResponse
    let viewModel: MaintenanceListViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    if let asset = event.asset {
                        Text(asset.name)
                            .font(.headline)
                            .foregroundStyle(.primary)
                        Text(asset.assetNumber)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    } else {
                        Text("Asset")
                            .font(.headline)
                            .foregroundStyle(.primary)
                    }
                }

                Spacer()

                StatusBadge(
                    text: viewModel.statusLabel(for: event.status),
                    color: viewModel.statusColor(for: event.status)
                )
            }

            HStack(spacing: 12) {
                Label(event.maintenanceType.replacingOccurrences(of: "_", with: " ").capitalized,
                      systemImage: "wrench")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                if let scheduled = event.scheduledDate?.formattedMaintenanceDate {
                    Label(scheduled, systemImage: "calendar")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            if let description = event.description, !description.isEmpty {
                Text(description)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
        }
        .padding()
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

// MARK: - Date Formatting

private extension String {
    var formattedMaintenanceDate: String? {
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
