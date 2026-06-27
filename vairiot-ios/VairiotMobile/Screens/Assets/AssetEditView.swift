import SwiftUI

struct AssetEditView: View {
    @State private var viewModel: AssetEditViewModel
    @Environment(\.dismiss) private var dismiss
    var onSaved: (() -> Void)?

    init(
        apiClient: APIClient,
        existingAsset: AssetResponse? = nil,
        onSaved: (() -> Void)? = nil
    ) {
        _viewModel = State(initialValue: AssetEditViewModel(
            apiClient: apiClient,
            existingAsset: existingAsset
        ))
        self.onSaved = onSaved
    }

    var body: some View {
        Form {
            if viewModel.isLoading {
                Section {
                    HStack {
                        Spacer()
                        ProgressView("Loading form data...")
                        Spacer()
                    }
                }
            } else {
                basicInfoSection
                identifiersSection
                classificationSection
                locationSection
                notesSection
            }

            if let error = viewModel.errorMessage {
                Section {
                    Text(error)
                        .foregroundStyle(Color.errorRed)
                        .font(.subheadline)
                }
            }
        }
        .navigationTitle(viewModel.navigationTitle)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel") { dismiss() }
            }
            ToolbarItem(placement: .confirmationAction) {
                saveButton
            }
        }
        .task {
            await viewModel.loadReferenceData()
        }
        .onChange(of: viewModel.isSaved) { _, saved in
            if saved {
                onSaved?()
                dismiss()
            }
        }
    }

    // MARK: - Basic Info

    private var basicInfoSection: some View {
        Section("Basic Information") {
            VStack(alignment: .leading, spacing: 4) {
                TextField("Asset Name *", text: $viewModel.name)
                if viewModel.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    Text("Required")
                        .font(.caption2)
                        .foregroundStyle(Color.errorRed)
                }
            }

            VStack(alignment: .leading) {
                Text("Description")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                TextEditor(text: $viewModel.description)
                    .frame(minHeight: 80)
            }
        }
    }

    // MARK: - Identifiers

    private var identifiersSection: some View {
        Section("Identifiers") {
            TextField("Serial Number", text: $viewModel.serialNumber)
                .textContentType(.none)
                .autocorrectionDisabled()

            TextField("Barcode", text: $viewModel.barcode)
                .autocorrectionDisabled()

            TextField("RFID Tag", text: $viewModel.rfidTag)
                .autocorrectionDisabled()
        }
    }

    // MARK: - Classification

    private var classificationSection: some View {
        Section("Classification") {
            Picker("Status", selection: $viewModel.selectedStatus) {
                ForEach(AssetStatus.allCases) { status in
                    Text(status.displayName).tag(status)
                }
            }

            Picker("Condition", selection: $viewModel.selectedCondition) {
                ForEach(AssetCondition.allCases) { condition in
                    Text(condition.displayName).tag(condition)
                }
            }

            Picker("Category", selection: $viewModel.selectedCategoryId) {
                Text("None").tag(nil as String?)
                ForEach(viewModel.categories) { category in
                    Text(category.name).tag(category.id as String?)
                }
            }
        }
    }

    // MARK: - Location

    private var locationSection: some View {
        Section("Location") {
            Picker("Site", selection: $viewModel.selectedSiteId) {
                Text("None").tag(nil as String?)
                ForEach(viewModel.sites) { site in
                    Text(site.name).tag(site.id as String?)
                }
            }
            .onChange(of: viewModel.selectedSiteId) { _, _ in
                viewModel.onSiteChanged()
            }

            if viewModel.isLoadingLocations {
                HStack {
                    Text("Location")
                    Spacer()
                    ProgressView()
                }
            } else {
                Picker("Location", selection: $viewModel.selectedLocationId) {
                    Text("None").tag(nil as String?)
                    ForEach(viewModel.locations) { location in
                        Text(location.name).tag(location.id as String?)
                    }
                }
                .disabled(viewModel.selectedSiteId == nil)
            }
        }
    }

    // MARK: - Notes

    private var notesSection: some View {
        Section("Notes") {
            TextEditor(text: $viewModel.notes)
                .frame(minHeight: 60)
        }
    }

    // MARK: - Save Button

    private var saveButton: some View {
        Group {
            if viewModel.isSaving {
                ProgressView()
            } else {
                Button("Save") {
                    Task { await viewModel.save() }
                }
                .disabled(!viewModel.isFormValid)
                .fontWeight(.semibold)
            }
        }
    }
}
