import SwiftUI

struct AssetListView: View {
    @State private var viewModel: AssetListViewModel
    @State private var showCreateSheet: Bool = false

    private let apiClient: APIClient

    init(apiClient: APIClient) {
        self.apiClient = apiClient
        _viewModel = State(initialValue: AssetListViewModel(apiClient: apiClient))
    }

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            VStack(spacing: 0) {
                if viewModel.isOffline {
                    offlineBanner
                }
                searchBar
                filterBar
                assetList
            }
            .background(Color.vairiotWash)

            createButton
        }
        .navigationTitle("Assets")
        .navigationBarTitleDisplayMode(.large)
        .task {
            if viewModel.assets.isEmpty {
                await viewModel.loadInitial()
            }
        }
        .sheet(isPresented: $showCreateSheet) {
            NavigationStack {
                AssetEditView(apiClient: apiClient) {
                    Task { await viewModel.refresh() }
                }
            }
        }
    }

    // MARK: - Offline Banner

    private var offlineBanner: some View {
        HStack(spacing: 8) {
            Image(systemName: "wifi.slash")
                .font(.caption)
            Text("Offline — showing cached data")
                .font(.caption)
                .fontWeight(.medium)
            Spacer()
        }
        .foregroundStyle(Color.warningAmber)
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(Color.warningAmber.opacity(0.12))
    }

    // MARK: - Search

    private var searchBar: some View {
        ClearableTextField(
            placeholder: "Search assets...",
            text: $viewModel.searchQuery,
            leadingIcon: "magnifyingglass"
        )
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(Color(.systemBackground))
    }

    // MARK: - Filters

    private var filterBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                filterMenu(
                    title: viewModel.selectedStatus?.displayName ?? "Status",
                    isActive: viewModel.selectedStatus != nil
                ) {
                    Button("All Statuses") {
                        viewModel.selectedStatus = nil
                        Task { await viewModel.applyFilters() }
                    }
                    ForEach(AssetStatus.allCases) { status in
                        Button(status.displayName) {
                            viewModel.selectedStatus = status
                            Task { await viewModel.applyFilters() }
                        }
                    }
                }

                filterMenu(
                    title: viewModel.selectedCondition?.displayName ?? "Condition",
                    isActive: viewModel.selectedCondition != nil
                ) {
                    Button("All Conditions") {
                        viewModel.selectedCondition = nil
                        Task { await viewModel.applyFilters() }
                    }
                    ForEach(AssetCondition.allCases) { condition in
                        Button(condition.displayName) {
                            viewModel.selectedCondition = condition
                            Task { await viewModel.applyFilters() }
                        }
                    }
                }

                Divider()
                    .frame(height: 24)

                sortMenu
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
        }
        .background(Color(.systemBackground))
    }

    private func filterMenu<Content: View>(
        title: String,
        isActive: Bool,
        @ViewBuilder content: @escaping () -> Content
    ) -> some View {
        Menu {
            content()
        } label: {
            HStack(spacing: 4) {
                Text(title)
                    .font(.subheadline)
                Image(systemName: "chevron.down")
                    .font(.caption2)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(isActive ? Color.vairiotViolet.opacity(0.12) : Color(.systemGray6))
            .foregroundStyle(isActive ? Color.vairiotViolet : Color.primary)
            .clipShape(Capsule())
            .overlay(
                Capsule()
                    .stroke(isActive ? Color.vairiotViolet.opacity(0.3) : Color.clear, lineWidth: 1)
            )
        }
    }

    private var sortMenu: some View {
        Menu {
            ForEach(AssetListViewModel.SortField.allCases) { field in
                Button {
                    if viewModel.sortBy == field {
                        viewModel.sortOrder = viewModel.sortOrder == .asc ? .desc : .asc
                    } else {
                        viewModel.sortBy = field
                        viewModel.sortOrder = .asc
                    }
                    Task { await viewModel.applyFilters() }
                } label: {
                    HStack {
                        Text(field.displayName)
                        if viewModel.sortBy == field {
                            Image(systemName: viewModel.sortOrder == .asc
                                  ? "chevron.up" : "chevron.down")
                        }
                    }
                }
            }
        } label: {
            HStack(spacing: 4) {
                Image(systemName: "arrow.up.arrow.down")
                    .font(.caption)
                Text("Sort")
                    .font(.subheadline)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(Color(.systemGray6))
            .foregroundStyle(.primary)
            .clipShape(Capsule())
        }
    }

    // MARK: - List

    private var assetList: some View {
        Group {
            if viewModel.isLoading && viewModel.assets.isEmpty {
                loadingState
            } else if viewModel.assets.isEmpty {
                emptyState
            } else {
                List {
                    ForEach(viewModel.assets) { asset in
                        NavigationLink(value: asset.id) {
                            AssetCardView(asset: asset)
                        }
                        .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
                        .listRowSeparator(.hidden)
                        .listRowBackground(Color.clear)
                    }

                    if viewModel.hasMorePages {
                        loadMoreRow
                    }
                }
                .listStyle(.plain)
                .refreshable {
                    await viewModel.refresh()
                }
                .navigationDestination(for: String.self) { assetId in
                    AssetDetailView(assetId: assetId, apiClient: apiClient)
                }
            }
        }
    }

    private var loadMoreRow: some View {
        HStack {
            Spacer()
            if viewModel.isLoadingMore {
                ProgressView()
            } else {
                Color.clear
                    .frame(height: 1)
                    .onAppear {
                        Task { await viewModel.loadMore() }
                    }
            }
            Spacer()
        }
        .listRowSeparator(.hidden)
        .listRowBackground(Color.clear)
    }

    private var loadingState: some View {
        VStack {
            Spacer()
            ProgressView("Loading assets...")
                .foregroundStyle(.secondary)
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    private var emptyState: some View {
        VStack(spacing: 16) {
            Spacer()
            Image(systemName: "tray")
                .font(.system(size: 48))
                .foregroundStyle(.secondary)
            Text("No assets found")
                .font(.headline)
                .foregroundStyle(.secondary)
            if !viewModel.searchQuery.isEmpty || viewModel.selectedStatus != nil || viewModel.selectedCondition != nil {
                Text("Try adjusting your search or filters")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - FAB

    private var createButton: some View {
        Button {
            showCreateSheet = true
        } label: {
            Image(systemName: "plus")
                .font(.title2)
                .fontWeight(.semibold)
                .foregroundStyle(.white)
                .frame(width: 56, height: 56)
                .background(Color.vairiotViolet, in: Circle())
                .shadow(color: Color.vairiotViolet.opacity(0.3), radius: 8, x: 0, y: 4)
        }
        .padding(20)
    }
}

// MARK: - Asset Card

struct AssetCardView: View {
    let asset: AssetResponse

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(asset.name)
                        .font(.headline)
                        .foregroundStyle(Color.vairiotCharcoal)
                        .lineLimit(1)

                    Text(asset.assetNumber)
                        .font(.system(.caption, design: .monospaced))
                        .foregroundStyle(.secondary)
                }

                Spacer()

                StatusBadge(asset.assetStatus)
            }

            if let site = asset.site {
                HStack(spacing: 4) {
                    Image(systemName: "building.2")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    Text(site.name)
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    if let location = asset.location {
                        Text("/ \(location.name)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
        .padding(12)
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .shadow(color: .black.opacity(0.04), radius: 3, x: 0, y: 1)
    }
}
