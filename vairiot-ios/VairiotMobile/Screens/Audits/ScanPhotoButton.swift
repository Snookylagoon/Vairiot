import PhotosUI
import SwiftUI

/// "Add photo" for the last audit scan (stage 1.8): the camera where there is
/// one, the photo library otherwise. Hands JPEG data to `onPhoto`.
struct ScanPhotoButton: View {
    let lastScan: AuditRunViewModel.LastScan?
    let onPhoto: (Data) -> Void

    @State private var showCamera = false
    @State private var pickerItem: PhotosPickerItem?
    private let hasCamera = UIImagePickerController.isSourceTypeAvailable(.camera)

    var body: some View {
        if let lastScan {
            Group {
                if hasCamera {
                    Button { showCamera = true } label: { label(for: lastScan) }
                } else {
                    PhotosPicker(selection: $pickerItem, matching: .images) { label(for: lastScan) }
                }
            }
            .buttonStyle(.bordered)
            .fullScreenCover(isPresented: $showCamera) {
                CameraImagePicker { image in
                    showCamera = false
                    if let data = image.jpegData(compressionQuality: 0.85) { onPhoto(data) }
                } onCancel: {
                    showCamera = false
                }
                .ignoresSafeArea()
            }
            .onChange(of: pickerItem) { _, item in
                guard let item else { return }
                Task {
                    if let data = try? await item.loadTransferable(type: Data.self) { onPhoto(data) }
                    pickerItem = nil
                }
            }
        }
    }

    private func label(for scan: AuditRunViewModel.LastScan) -> some View {
        Label("Add photo to \(scan.tagValue)", systemImage: "camera")
            .frame(maxWidth: .infinity)
    }
}
