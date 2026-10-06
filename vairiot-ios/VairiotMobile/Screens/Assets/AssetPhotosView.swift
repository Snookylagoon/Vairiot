import SwiftUI
import PhotosUI
import SwiftData

struct AssetPhotosView: View {

    let assetId: String
    let apiClient: APIClient

    @State private var photos: [PhotoResponse] = []
    @State private var isLoading = true
    @State private var isUploading = false
    @State private var errorMessage: String?
    @State private var noticeMessage: String?
    /// Photos of this asset saved on the device and not yet uploaded.
    @State private var pendingCount = 0
    @State private var showSourcePicker = false
    @State private var showCamera = false
    @State private var selectedPickerItem: PhotosPickerItem?

    var body: some View {
        Group {
            if isLoading && photos.isEmpty {
                ProgressView("Loading photos...")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if photos.isEmpty && !isUploading && pendingCount == 0 && noticeMessage == nil {
                emptyState
            } else {
                photoContent
            }
        }
        .navigationTitle("Photos")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    showSourcePicker = true
                } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .task {
            refreshPendingCount()
            await loadPhotos()
        }
        .onReceive(NotificationCenter.default.publisher(for: .vairiotSyncQueuesChanged)) { _ in
            refreshPendingCount()
            Task { await loadPhotos() }
        }
        .confirmationDialog("Add Photo", isPresented: $showSourcePicker) {
            Button("Take Photo") {
                showCamera = true
            }
            PhotosPicker(selection: $selectedPickerItem, matching: .images) {
                Text("Choose from Library")
            }
            Button("Cancel", role: .cancel) {}
        }
        .fullScreenCover(isPresented: $showCamera) {
            CameraImagePicker { image in
                showCamera = false
                guard let data = image.jpegData(compressionQuality: 0.85) else { return }
                let thumb = generateThumbnail(from: data, maxDimension: 200)
                Task { await uploadPhoto(imageData: data, thumbData: thumb) }
            } onCancel: {
                showCamera = false
            }
        }
        .onChange(of: selectedPickerItem) { _, item in
            guard let item else { return }
            Task {
                guard let data = try? await item.loadTransferable(type: Data.self) else { return }
                let thumb = generateThumbnail(from: data, maxDimension: 200)
                await uploadPhoto(imageData: data, thumbData: thumb)
                selectedPickerItem = nil
            }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 16) {
            Image(systemName: "photo.on.rectangle")
                .font(.system(size: 48))
                .foregroundStyle(.secondary)
            Text("No Photos")
                .font(.title3)
                .fontWeight(.semibold)
            Text("Tap + to add photos of this asset.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var photoContent: some View {
        ScrollView {
            VStack(spacing: 16) {
                if isUploading {
                    ProgressView("Uploading photo...")
                        .padding()
                }

                if let error = errorMessage {
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(Color.errorRed)
                        .padding(.horizontal)
                }

                if let notice = noticeMessage {
                    Text(notice)
                        .font(.caption)
                        .padding(.horizontal)
                }

                if pendingCount > 0 {
                    Label(
                        "\(pendingCount) photo\(pendingCount == 1 ? "" : "s") waiting to upload",
                        systemImage: "clock.arrow.circlepath"
                    )
                    .font(.caption)
                    .foregroundStyle(Color.warningAmber)
                    .padding(.horizontal)
                }

                PhotoGalleryView(
                    photos: photos,
                    onDelete: { photo in
                        Task { await deletePhoto(photo) }
                    },
                    apiClient: apiClient
                )
                .padding(.horizontal)
            }
            .padding(.top)
        }
    }

    private func loadPhotos() async {
        isLoading = true
        do {
            photos = try await apiClient.request(.listAssetPhotos(assetId: assetId))
        } catch {
            errorMessage = "Failed to load photos"
        }
        isLoading = false
    }

    /// Saves the photo to disk and the offline queue first, then tries to
    /// upload it. A photo taken with no signal (or whose upload dies with the
    /// app) stays queued and is uploaded by SyncManager later.
    private func uploadPhoto(imageData: Data, thumbData: Data?) async {
        isUploading = true
        errorMessage = nil
        noticeMessage = nil
        defer {
            isUploading = false
            refreshPendingCount()
        }

        let files = PhotoFileStore.shared
        let context = VairiotStore.shared.context
        let queued: QueuedPhoto
        do {
            let fileName = try files.save(imageData)
            let thumbName = try thumbData.map { try files.save($0) }
            queued = QueuedPhoto(assetId: assetId, fileName: fileName, thumbFileName: thumbName)
            context.insert(queued)
            try context.save()
        } catch {
            errorMessage = "Could not save photo on this device: \(error.localizedDescription)"
            return
        }

        let uploadPath = "\(APIEndpoint.uploadAssetPhotoPath)/\(assetId)/photos"
        do {
            let photo: PhotoResponse = try await apiClient.upload(
                path: uploadPath,
                imageData: imageData,
                thumbData: thumbData
            )
            files.delete(queued.fileName)
            files.delete(queued.thumbFileName)
            context.delete(queued)
            try? context.save()
            photos.append(photo)
        } catch {
            let failure = classifySyncFailure(error)
            switch failure.kind {
            case .duplicate:
                files.delete(queued.fileName)
                files.delete(queued.thumbFileName)
                context.delete(queued)
                try? context.save()
                await loadPhotos()
            case .network, .transient, .auth:
                if failure.kind != .auth {
                    queued.state = QueueState.failed
                    queued.lastError = failure.message
                    try? context.save()
                }
                SyncManager.shared.syncSoon()
                noticeMessage = "Photo saved on this device. It will upload automatically when back online."
            case .permanent:
                queued.state = QueueState.dead
                queued.attempts += 1
                queued.lastError = failure.message
                try? context.save()
                errorMessage = "Upload rejected: \(failure.message). Kept under Profile → Pending uploads."
            }
        }
    }

    private func refreshPendingCount() {
        let id: String? = assetId
        let dead = QueueState.dead
        pendingCount = (try? VairiotStore.shared.context.fetchCount(FetchDescriptor<QueuedPhoto>(
            predicate: #Predicate { $0.assetId == id && $0.state != dead }))) ?? 0
    }

    private func deletePhoto(_ photo: PhotoResponse) async {
        do {
            try await apiClient.requestVoid(.deletePhoto(id: photo.id))
            photos.removeAll { $0.id == photo.id }
        } catch {
            errorMessage = "Failed to delete photo"
        }
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
}
