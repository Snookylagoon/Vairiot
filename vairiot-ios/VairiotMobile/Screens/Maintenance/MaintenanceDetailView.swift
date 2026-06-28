import SwiftUI
import PhotosUI

struct MaintenanceDetailView: View {

    @State private var viewModel: MaintenanceDetailViewModel
    @State private var selectedPhotoItem: PhotosPickerItem?
    @State private var showPhotoSourcePicker = false
    @State private var showCamera = false

    init(eventId: String, apiClient: APIClient = .shared) {
        _viewModel = State(initialValue: MaintenanceDetailViewModel(eventId: eventId, apiClient: apiClient))
    }

    var body: some View {
        Group {
            if viewModel.isLoading && viewModel.event == nil {
                ProgressView("Loading...")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let event = viewModel.event {
                eventContent(event)
            } else {
                Text("Event not found")
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .navigationTitle("Maintenance Detail")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button("Edit") {
                    viewModel.prepareEditForm()
                    viewModel.showEditSheet = true
                }
                .disabled(viewModel.event == nil)
            }
        }
        .sheet(isPresented: $viewModel.showEditSheet) {
            editSheet
        }
        .alert("Error", isPresented: .constant(viewModel.errorMessage != nil)) {
            Button("OK") { viewModel.errorMessage = nil }
        } message: {
            Text(viewModel.errorMessage ?? "")
        }
        .task {
            await viewModel.loadEvent()
            await viewModel.loadPhotos()
        }
    }

    // MARK: - Event Content

    private func eventContent(_ event: MaintenanceEventResponse) -> some View {
        ScrollView {
            VStack(spacing: 16) {
                assetSection(event)
                detailsSection(event)
                datesSection(event)

                if let description = event.description, !description.isEmpty {
                    descriptionSection(description)
                }

                if let notes = event.notes, !notes.isEmpty {
                    notesSection(notes)
                }

                photosSection
            }
            .padding()
        }
    }

    // MARK: - Asset Section

    private func assetSection(_ event: MaintenanceEventResponse) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader("Asset")

            if let asset = event.asset {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(asset.name)
                            .font(.headline)
                        Text(asset.assetNumber)
                            .font(.subheadline)
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
        }
    }

    // MARK: - Details Section

    private func detailsSection(_ event: MaintenanceEventResponse) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader("Details")

            VStack(spacing: 0) {
                detailRow(label: "Type",
                          value: event.maintenanceType.replacingOccurrences(of: "_", with: " ").capitalized)

                Divider().padding(.horizontal)

                HStack {
                    Text("Status")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Spacer()
                    StatusBadge(
                        text: viewModel.statusLabel(for: event.status),
                        color: viewModel.statusColor(for: event.status)
                    )
                }
                .padding(.horizontal)
                .padding(.vertical, 10)

                if let vendor = event.vendor, !vendor.isEmpty {
                    Divider().padding(.horizontal)
                    detailRow(label: "Vendor", value: vendor)
                }

                if let workOrder = event.workOrderNumber, !workOrder.isEmpty {
                    Divider().padding(.horizontal)
                    detailRow(label: "Work Order", value: workOrder)
                }

                if let cost = event.cost, !cost.isEmpty {
                    Divider().padding(.horizontal)
                    detailRow(label: "Cost", value: cost)
                }
            }
            .background(Color(.secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }

    // MARK: - Dates Section

    private func datesSection(_ event: MaintenanceEventResponse) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader("Dates")

            VStack(spacing: 0) {
                if let scheduled = event.scheduledDate {
                    detailRow(label: "Scheduled", value: scheduled.formattedDetailDate)
                }

                if let completed = event.completedDate {
                    if event.scheduledDate != nil { Divider().padding(.horizontal) }
                    detailRow(label: "Completed", value: completed.formattedDetailDate)
                }

                Divider().padding(.horizontal)
                detailRow(label: "Created", value: event.createdAt.formattedDetailDate)

                if let updated = event.updatedAt {
                    Divider().padding(.horizontal)
                    detailRow(label: "Updated", value: updated.formattedDetailDate)
                }
            }
            .background(Color(.secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }

    // MARK: - Description / Notes

    private func descriptionSection(_ description: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader("Description")
            Text(description)
                .font(.subheadline)
                .padding()
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color(.secondarySystemGroupedBackground))
                .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }

    private func notesSection(_ notes: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader("Notes")
            Text(notes)
                .font(.subheadline)
                .padding()
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color(.secondarySystemGroupedBackground))
                .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }

    // MARK: - Photos

    private var photosSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                sectionHeader("Photos")
                Spacer()

                Button {
                    showPhotoSourcePicker = true
                } label: {
                    Label("Add", systemImage: "plus")
                        .font(.subheadline)
                }
            }

            if viewModel.isUploadingPhoto {
                ProgressView("Uploading photo...")
                    .padding()
            }

            PhotoGalleryView(
                photos: viewModel.photos,
                onDelete: nil
            )
        }
        .confirmationDialog("Add Photo", isPresented: $showPhotoSourcePicker) {
            Button("Take Photo") {
                showCamera = true
            }
            PhotosPicker(selection: $selectedPhotoItem, matching: .images) {
                Text("Choose from Library")
            }
            Button("Cancel", role: .cancel) {}
        }
        .fullScreenCover(isPresented: $showCamera) {
            CameraImagePicker { image in
                showCamera = false
                guard let data = image.jpegData(compressionQuality: 0.85) else { return }
                let thumb = generateThumbnail(from: data, maxDimension: 200)
                Task { await viewModel.uploadPhoto(imageData: data, thumbData: thumb) }
            } onCancel: {
                showCamera = false
            }
        }
        .onChange(of: selectedPhotoItem) { _, item in
            guard let item else { return }
            Task { await handlePhotoSelection(item) }
        }
    }

    // MARK: - Edit Sheet

    private var editSheet: some View {
        NavigationStack {
            Form {
                Section("Status") {
                    Picker("Status", selection: $viewModel.editStatus) {
                        Text("Scheduled").tag("scheduled")
                        Text("In Progress").tag("in_progress")
                        Text("Completed").tag("completed")
                        Text("Cancelled").tag("cancelled")
                    }
                }

                Section("Notes") {
                    TextEditor(text: $viewModel.editNotes)
                        .frame(minHeight: 100)
                }

                Section("Completed Date") {
                    Toggle("Set Completed Date", isOn: $viewModel.shouldSetCompletedDate)
                    if viewModel.shouldSetCompletedDate {
                        DatePicker(
                            "Completed",
                            selection: $viewModel.editCompletedDate,
                            displayedComponents: [.date, .hourAndMinute]
                        )
                    }
                }
            }
            .navigationTitle("Edit Event")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        viewModel.showEditSheet = false
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    LoadingButton(
                        title: "Save",
                        isLoading: viewModel.isUpdating
                    ) {
                        Task { await viewModel.updateEvent() }
                    }
                }
            }
        }
    }

    // MARK: - Photo Handling

    private func handlePhotoSelection(_ item: PhotosPickerItem) async {
        guard let data = try? await item.loadTransferable(type: Data.self) else { return }

        let thumbData = generateThumbnail(from: data, maxDimension: 200)
        await viewModel.uploadPhoto(imageData: data, thumbData: thumbData)
        selectedPhotoItem = nil
    }

    private func generateThumbnail(from imageData: Data, maxDimension: CGFloat) -> Data? {
        guard let image = UIImage(data: imageData) else { return nil }
        let scale = min(maxDimension / image.size.width, maxDimension / image.size.height, 1.0)
        let newSize = CGSize(width: image.size.width * scale, height: image.size.height * scale)

        let renderer = UIGraphicsImageRenderer(size: newSize)
        let thumb = renderer.image { _ in
            image.draw(in: CGRect(origin: .zero, size: newSize))
        }
        return thumb.jpegData(compressionQuality: 0.7)
    }

    // MARK: - Helpers

    private func sectionHeader(_ title: String) -> some View {
        Text(title)
            .font(.subheadline)
            .fontWeight(.semibold)
            .foregroundStyle(.secondary)
    }

    private func detailRow(label: String, value: String) -> some View {
        HStack {
            Text(label)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Spacer()
            Text(value)
                .font(.subheadline)
        }
        .padding(.horizontal)
        .padding(.vertical, 10)
    }
}

// MARK: - Date Formatting

private extension String {
    var formattedDetailDate: String {
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = iso.date(from: self) ?? ISO8601DateFormatter().date(from: self) else {
            return self
        }
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        return formatter.string(from: date)
    }
}
