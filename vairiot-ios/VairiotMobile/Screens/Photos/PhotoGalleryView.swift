import SwiftUI
import PhotosUI

struct PhotoGalleryView: View {

    let photos: [PhotoResponse]
    var onAddPhoto: ((Data, Data?) -> Void)?
    var onDelete: ((PhotoResponse) -> Void)?
    var apiClient: APIClient = .shared

    @State private var selectedPhoto: PhotoResponse?
    @State private var showFullScreen = false
    @State private var editingCaption: PhotoResponse?
    @State private var captionText = ""
    @State private var selectedPickerItem: PhotosPickerItem?

    private let columns = [
        GridItem(.flexible(), spacing: 4),
        GridItem(.flexible(), spacing: 4),
        GridItem(.flexible(), spacing: 4),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if photos.isEmpty && onAddPhoto == nil {
                Text("No photos")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .padding()
            } else {
                photoGrid
            }

            if let onAddPhoto {
                addPhotoButton(handler: onAddPhoto)
            }
        }
        .sheet(isPresented: $showFullScreen) {
            if let photo = selectedPhoto {
                PhotoFullScreenView(photo: photo, apiClient: apiClient)
            }
        }
        .alert("Edit Caption", isPresented: .constant(editingCaption != nil)) {
            TextField("Caption", text: $captionText)
            Button("Save") {
                guard let photo = editingCaption else { return }
                Task { await updateCaption(photo: photo) }
                editingCaption = nil
            }
            Button("Cancel", role: .cancel) {
                editingCaption = nil
            }
        }
    }

    // MARK: - Photo Grid

    private var photoGrid: some View {
        LazyVGrid(columns: columns, spacing: 4) {
            ForEach(photos) { photo in
                PhotoThumbnail(photo: photo, apiClient: apiClient)
                    .aspectRatio(1, contentMode: .fill)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .onTapGesture {
                        selectedPhoto = photo
                        showFullScreen = true
                    }
                    .contextMenu {
                        Button {
                            captionText = photo.caption ?? ""
                            editingCaption = photo
                        } label: {
                            Label("Edit Caption", systemImage: "text.cursor")
                        }

                        if let onDelete {
                            Button(role: .destructive) {
                                onDelete(photo)
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                        }
                    }
            }
        }
    }

    // MARK: - Add Photo Button

    private func addPhotoButton(handler: @escaping (Data, Data?) -> Void) -> some View {
        PhotosPicker(selection: $selectedPickerItem, matching: .images) {
            Label("Add Photo", systemImage: "camera")
                .font(.subheadline)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
        }
        .buttonStyle(.bordered)
        .tint(.vairiotViolet)
        .onChange(of: selectedPickerItem) { _, item in
            guard let item else { return }
            Task {
                guard let data = try? await item.loadTransferable(type: Data.self) else { return }
                let thumb = generateThumbnail(from: data, maxDimension: 200)
                handler(data, thumb)
                selectedPickerItem = nil
            }
        }
    }

    // MARK: - Caption

    private func updateCaption(photo: PhotoResponse) async {
        let request = PhotoUpdateRequest(caption: captionText.isEmpty ? nil : captionText)
        do {
            let _: PhotoResponse = try await apiClient.request(.updatePhoto(id: photo.id, request))
        } catch {
            // Caption update is non-critical.
        }
    }

    // MARK: - Thumbnail Generation

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

// MARK: - Photo Thumbnail

struct PhotoThumbnail: View {
    let photo: PhotoResponse
    let apiClient: APIClient

    @State private var image: UIImage?
    @State private var isLoading = true

    var body: some View {
        ZStack {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
            } else if isLoading {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color(.tertiarySystemGroupedBackground))
            } else {
                Image(systemName: "photo")
                    .font(.title2)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color(.tertiarySystemGroupedBackground))
            }
        }
        .task {
            await loadThumbnail()
        }
    }

    private func loadThumbnail() async {
        isLoading = true
        do {
            let data = try await apiClient.downloadData(.downloadPhoto(id: photo.id, thumb: true))
            if let uiImage = UIImage(data: data) {
                image = uiImage
            }
        } catch {
            // Thumbnail load failed; show placeholder.
        }
        isLoading = false
    }
}

// MARK: - Full Screen Photo View

struct PhotoFullScreenView: View {
    let photo: PhotoResponse
    let apiClient: APIClient

    @State private var image: UIImage?
    @State private var isLoading = true
    @State private var scale: CGFloat = 1.0
    @State private var lastScale: CGFloat = 1.0
    @State private var offset: CGSize = .zero
    @State private var lastOffset: CGSize = .zero
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ZStack {
                Color.black.ignoresSafeArea()

                if let image {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFit()
                        .scaleEffect(scale)
                        .offset(offset)
                        .gesture(magnificationGesture)
                        .gesture(dragGesture)
                        .onTapGesture(count: 2) {
                            withAnimation {
                                if scale > 1 {
                                    scale = 1
                                    offset = .zero
                                } else {
                                    scale = 3
                                }
                                lastScale = scale
                                lastOffset = offset
                            }
                        }
                } else if isLoading {
                    ProgressView()
                        .tint(.white)
                } else {
                    Image(systemName: "photo")
                        .font(.largeTitle)
                        .foregroundStyle(.gray)
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                        .foregroundStyle(.white)
                }
            }
            .toolbarBackground(.hidden, for: .navigationBar)
        }
        .task {
            await loadFullImage()
        }
    }

    private var magnificationGesture: some Gesture {
        MagnifyGesture()
            .onChanged { value in
                let newScale = lastScale * value.magnification
                scale = max(1, min(newScale, 5))
            }
            .onEnded { _ in
                lastScale = scale
                if scale <= 1 {
                    withAnimation {
                        offset = .zero
                        lastOffset = .zero
                    }
                }
            }
    }

    private var dragGesture: some Gesture {
        DragGesture()
            .onChanged { value in
                guard scale > 1 else { return }
                offset = CGSize(
                    width: lastOffset.width + value.translation.width,
                    height: lastOffset.height + value.translation.height
                )
            }
            .onEnded { _ in
                lastOffset = offset
            }
    }

    private func loadFullImage() async {
        isLoading = true
        do {
            let data = try await apiClient.downloadData(.downloadPhoto(id: photo.id, thumb: false))
            if let uiImage = UIImage(data: data) {
                image = uiImage
            }
        } catch {
            // Full image load failed.
        }
        isLoading = false
    }
}
