import UIKit

/// A small JPEG copy for galleries, made on the device (the API keeps image
/// handling dependency-free, KFR-043).
enum ImageThumbnail {
    static func jpeg(from imageData: Data, maxDimension: CGFloat = 320) -> Data? {
        guard let image = UIImage(data: imageData) else { return nil }
        let scale = min(maxDimension / image.size.width, maxDimension / image.size.height, 1.0)
        let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let thumb = UIGraphicsImageRenderer(size: size).image { _ in
            image.draw(in: CGRect(origin: .zero, size: size))
        }
        return thumb.jpegData(compressionQuality: 0.7)
    }
}
