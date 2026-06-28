import SwiftUI

struct MaintenanceCreateFromListView: View {
    let apiClient: APIClient
    var onCreated: (() -> Void)?

    @State private var assets: [AssetResponse] = []
    @State private var isLoading = true
    @State private var searchQuery = ""
    @State private var selectedAsset: AssetResponse?
    @State private var showCreateSheet = false

    var body: some View {
        Group {
            if isLoading {
                ProgressView("Loading assets...")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                assetPicker
            }
        }
        .navigationTitle("Select Asset")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await loadAssets()
        }
        .sheet(isPresented: $showCreateSheet) {
            if let asset = selectedAsset {
                NavigationStack {
                    CreateMaintenanceView(
                        assetId: asset.id,
                        assetName: asset.name,
                        apiClient: apiClient
                    ) {
                        onCreated?()
                    }
                }
            }
        }
    }

    private var assetPicker: some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(.secondary)
                TextField("Search assets...", text: $searchQuery)
                    .textFieldStyle(.plain)
                    .autocorrectionDisabled()
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(Color(.secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .padding(.horizontal)
            .padding(.top, 8)

            ScrollView {
                LazyVStack(spacing: 8) {
                    ForEach(filteredAssets) { asset in
                        Button {
                            selectedAsset = asset
                            showCreateSheet = true
                        } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(asset.name)
                                        .font(.headline)
                                        .foregroundStyle(.primary)
                                    Text(asset.assetNumber)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                                Image(systemName: "chevron.right")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            .padding()
                            .background(Color(.secondarySystemGroupedBackground))
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding()
            }
        }
    }

    private var filteredAssets: [AssetResponse] {
        if searchQuery.isEmpty { return assets }
        let query = searchQuery.lowercased()
        return assets.filter {
            $0.name.lowercased().contains(query) ||
            $0.assetNumber.lowercased().contains(query)
        }
    }

    private func loadAssets() async {
        isLoading = true
        do {
            let response: AssetListResponse = try await apiClient.request(
                .listAssets(pageSize: 100)
            )
            assets = response.assets
        } catch {
            assets = []
        }
        isLoading = false
    }
}
