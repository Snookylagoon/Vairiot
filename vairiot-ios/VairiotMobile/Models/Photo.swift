import Foundation

struct PhotoResponse: Codable, Identifiable {
    let id: String
    let mimeType: String
    let sizeBytes: Int
    let width: Int?
    let height: Int?
    let caption: String?
    var hasThumb: Bool = false
    let createdAt: String
    let createdBy: String?
}

struct PhotoUpdateRequest: Codable {
    let caption: String?
}
