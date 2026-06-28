import SwiftUI

struct AssetDetailView: View {
    @State private var viewModel: AssetDetailViewModel
    @State private var showEditSheet: Bool = false
    @State private var showScanner: Bool = false
    @State private var showPhotos: Bool = false
    @State private var showMaintenance: Bool = false
    @State private var showLabel: Bool = false

    private let apiClient: APIClient

    @Environment(\.dismiss) private var dismiss

    init(assetId: String, apiClient: APIClient) {
        self.apiClient = apiClient
        _viewModel = State(initialValue: AssetDetailViewModel(
            assetId: assetId,
            apiClient: apiClient
        ))
    }

    var body: some View {
        Group {
            if viewModel.isLoading && viewModel.asset == nil {
                ProgressView("Loading asset...")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let error = viewModel.errorMessage, viewModel.asset == nil {
                errorView(error)
            } else if let asset = viewModel.asset {
                assetContent(asset)
            }
        }
        .navigationTitle("Asset Detail")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                shareButton
            }
        }
        .task {
            await viewModel.load()
        }
        .alert("Delete Asset", isPresented: $viewModel.showDeleteConfirmation) {
            Button("Cancel", role: .cancel) {}
            Button("Delete", role: .destructive) {
                Task { await viewModel.deleteAsset() }
            }
        } message: {
            Text("Are you sure you want to delete this asset? This action cannot be undone.")
        }
        .onChange(of: viewModel.isDeleted) { _, deleted in
            if deleted { dismiss() }
        }
        .sheet(isPresented: $showEditSheet) {
            if let asset = viewModel.asset {
                NavigationStack {
                    AssetEditView(
                        apiClient: apiClient,
                        existingAsset: asset
                    ) {
                        Task { await viewModel.refresh() }
                    }
                }
            }
        }
        .fullScreenCover(isPresented: $showScanner) {
            ScannerView(
                onBarcodeScanned: { code in
                    showScanner = false
                    if let asset = viewModel.asset {
                        Task {
                            let request = AssetUpdateRequest(barcode: code)
                            do {
                                let _: AssetResponse = try await apiClient.request(
                                    .updateAsset(id: asset.id, request)
                                )
                                await viewModel.refresh()
                            } catch {}
                        }
                    }
                },
                onDismiss: { showScanner = false }
            )
        }
        .navigationDestination(isPresented: $showPhotos) {
            if let asset = viewModel.asset {
                AssetPhotosView(assetId: asset.id, apiClient: apiClient)
            }
        }
        .navigationDestination(isPresented: $showMaintenance) {
            if let asset = viewModel.asset {
                AssetMaintenanceView(assetId: asset.id, assetName: asset.name, apiClient: apiClient)
            }
        }
        .navigationDestination(isPresented: $showLabel) {
            if let asset = viewModel.asset {
                LabelDesignView(asset: asset, apiClient: apiClient)
            }
        }
    }

    // MARK: - Content

    private func assetContent(_ asset: AssetResponse) -> some View {
        ScrollView {
            VStack(spacing: 16) {
                headerCard(asset)
                infoSection(asset)
                if let description = asset.description, !description.isEmpty {
                    descriptionSection(description)
                }
                actionButtons
            }
            .padding(16)
        }
        .background(Color.vairiotWash)
        .refreshable {
            await viewModel.refresh()
        }
    }

    // MARK: - Header Card

    private func headerCard(_ asset: AssetResponse) -> some View {
        VStack(spacing: 12) {
            Text(asset.name)
                .font(.title2)
                .fontWeight(.bold)
                .foregroundStyle(Color.vairiotCharcoal)
                .multilineTextAlignment(.center)

            Text(asset.assetNumber)
                .font(.system(.body, design: .monospaced))
                .foregroundStyle(.secondary)

            StatusBadge(asset.assetStatus)
        }
        .frame(maxWidth: .infinity)
        .padding(20)
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.06), radius: 4, x: 0, y: 2)
    }

    // MARK: - Info Section

    private func infoSection(_ asset: AssetResponse) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            sectionHeader("Details")

            VStack(spacing: 0) {
                infoRow(icon: "folder", label: "Category", value: asset.category?.name)
                Divider().padding(.leading, 44)
                infoRow(icon: "building.2", label: "Site", value: asset.site?.name)
                Divider().padding(.leading, 44)
                infoRow(icon: "mappin.and.ellipse", label: "Location", value: asset.location?.name)
                Divider().padding(.leading, 44)
                infoRow(icon: "number", label: "Serial Number", value: asset.serialNumber)
                Divider().padding(.leading, 44)
                infoRow(icon: "barcode", label: "Barcode", value: asset.barcode)
                Divider().padding(.leading, 44)
                infoRow(icon: "wave.3.right", label: "RFID Tag", value: asset.rfidTag)
                Divider().padding(.leading, 44)
                infoRow(icon: "wrench.and.screwdriver", label: "Condition",
                        value: asset.assetCondition?.displayName)
            }
            .background(Color(.systemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }

    private func sectionHeader(_ title: String) -> some View {
        Text(title)
            .font(.subheadline)
            .fontWeight(.semibold)
            .foregroundStyle(.secondary)
            .padding(.bottom, 8)
            .padding(.leading, 4)
    }

    private func infoRow(icon: String, label: String, value: String?) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.body)
                .foregroundStyle(Color.vairiotViolet)
                .frame(width: 24)

            Text(label)
                .font(.subheadline)
                .foregroundStyle(.secondary)

            Spacer()

            Text(value ?? "---")
                .font(.subheadline)
                .foregroundStyle(value != nil ? .primary : .secondary)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    // MARK: - Description

    private func descriptionSection(_ description: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            sectionHeader("Description")

            Text(description)
                .font(.body)
                .foregroundStyle(.primary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(16)
                .background(Color(.systemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }

    // MARK: - Actions

    private var actionButtons: some View {
        VStack(spacing: 12) {
            HStack(spacing: 12) {
                actionButton(icon: "pencil", title: "Edit", color: .vairiotViolet) {
                    showEditSheet = true
                }
                actionButton(icon: "qrcode.viewfinder", title: "Scan", color: .vairiotPink) {
                    showScanner = true
                }
            }

            HStack(spacing: 12) {
                actionButton(icon: "photo.on.rectangle", title: "Photos", color: .blue) {
                    showPhotos = true
                }
                actionButton(icon: "wrench", title: "Maintenance", color: .warningAmber) {
                    showMaintenance = true
                }
            }

            HStack(spacing: 12) {
                actionButton(icon: "tag", title: "Label", color: .successGreen) {
                    showLabel = true
                }
                Spacer()
                    .frame(maxWidth: .infinity)
            }

            Button(role: .destructive) {
                viewModel.showDeleteConfirmation = true
            } label: {
                HStack {
                    Image(systemName: "trash")
                    Text("Delete Asset")
                }
                .font(.subheadline)
                .fontWeight(.medium)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
            }
            .tint(.errorRed)
            .padding(.top, 8)
        }
    }

    private func actionButton(
        icon: String,
        title: String,
        color: Color,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            VStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.title3)
                Text(title)
                    .font(.caption)
                    .fontWeight(.medium)
            }
            .foregroundStyle(color)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(color.opacity(0.08))
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(color.opacity(0.15), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Share

    private var shareButton: some View {
        ShareLink(
            item: "Asset: \(viewModel.asset?.name ?? "") (\(viewModel.asset?.assetNumber ?? ""))"
        ) {
            Image(systemName: "square.and.arrow.up")
        }
    }

    // MARK: - Error

    private func errorView(_ message: String) -> some View {
        VStack(spacing: 16) {
            Spacer()
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 40))
                .foregroundStyle(Color.errorRed)
            Text(message)
                .font(.body)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Button("Retry") {
                Task { await viewModel.load() }
            }
            .buttonStyle(.borderedProminent)
            .tint(.vairiotViolet)
            Spacer()
        }
        .padding()
    }
}
