import SwiftUI
import PhotosUI

struct AssetPhotosView: View {

    let assetId: String
    let apiClient: APIClient

    @State private var photos: [PhotoResponse] = []
    @State private var isLoading = true
    @State private var isUploading = false
    @State private var errorMessage: String?
    @State private var showSourcePicker = false
    @State private var showCamera = false
    @State private var selectedPickerItem: PhotosPickerItem?

    var body: some View {
        Group {
            if isLoading && photos.isEmpty {
                ProgressView("Loading photos...")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if photos.isEmpty && !isUploading {
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
            await loadPhotos()
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

    private func uploadPhoto(imageData: Data, thumbData: Data?) async {
        isUploading = true
        errorMessage = nil
        let uploadPath = "\(APIEndpoint.uploadAssetPhotoPath)/\(assetId)/photos"
        do {
            let photo: PhotoResponse = try await apiClient.upload(
                path: uploadPath,
                imageData: imageData,
                thumbData: thumbData
            )
            photos.append(photo)
        } catch {
            errorMessage = "Failed to upload photo"
        }
        isUploading = false
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
