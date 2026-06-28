import SwiftUI

struct AssetEditView: View {
    @State private var viewModel: AssetEditViewModel
    @Environment(\.dismiss) private var dismiss
    var onSaved: (() -> Void)?

    @State private var showAddSite = false
    @State private var showAddLocation = false
    @State private var showAddCategory = false
    @State private var newItemName = ""

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
        .alert("New Category", isPresented: $showAddCategory) {
            TextField("Category name", text: $newItemName)
            Button("Add") {
                let name = newItemName.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !name.isEmpty else { return }
                Task { await viewModel.createCategory(name: name) }
                newItemName = ""
            }
            Button("Cancel", role: .cancel) { newItemName = "" }
        } message: {
            Text("Enter a name for the new category.")
        }
        .alert("New Site", isPresented: $showAddSite) {
            TextField("Site name", text: $newItemName)
            Button("Add") {
                let name = newItemName.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !name.isEmpty else { return }
                Task { await viewModel.createSite(name: name) }
                newItemName = ""
            }
            Button("Cancel", role: .cancel) { newItemName = "" }
        } message: {
            Text("Enter a name for the new site.")
        }
        .alert("New Location", isPresented: $showAddLocation) {
            TextField("Location name", text: $newItemName)
            Button("Add") {
                let name = newItemName.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !name.isEmpty else { return }
                Task { await viewModel.createLocation(name: name) }
                newItemName = ""
            }
            Button("Cancel", role: .cancel) { newItemName = "" }
        } message: {
            if let site = viewModel.sites.first(where: { $0.id == viewModel.selectedSiteId }) {
                Text("Enter a name for the new location at \(site.name).")
            } else {
                Text("Enter a name for the new location.")
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
            .pickerStyle(.navigationLink)

            Picker("Condition", selection: $viewModel.selectedCondition) {
                ForEach(AssetCondition.allCases) { condition in
                    Text(condition.displayName).tag(condition)
                }
            }
            .pickerStyle(.navigationLink)

            Picker("Category", selection: $viewModel.selectedCategoryId) {
                Text("None").tag(nil as String?)
                ForEach(viewModel.categories) { category in
                    Text(category.name).tag(category.id as String?)
                }
            }
            .pickerStyle(.navigationLink)

            Button {
                newItemName = ""
                showAddCategory = true
            } label: {
                Label("Add New Category", systemImage: "plus.circle")
                    .font(.subheadline)
                    .foregroundStyle(Color.vairiotViolet)
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
            .pickerStyle(.navigationLink)
            .onChange(of: viewModel.selectedSiteId) { _, _ in
                viewModel.onSiteChanged()
            }

            Button {
                newItemName = ""
                showAddSite = true
            } label: {
                Label("Add New Site", systemImage: "plus.circle")
                    .font(.subheadline)
                    .foregroundStyle(Color.vairiotViolet)
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
                .pickerStyle(.navigationLink)
                .disabled(viewModel.selectedSiteId == nil)
            }

            Button {
                newItemName = ""
                showAddLocation = true
            } label: {
                Label("Add New Location", systemImage: "plus.circle")
                    .font(.subheadline)
                    .foregroundStyle(Color.vairiotViolet)
            }
            .disabled(viewModel.selectedSiteId == nil)
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
