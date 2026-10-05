import Foundation
import SwiftData

/// Offline queue for asset photos.
///
/// The JPEG bytes live in files under `PhotoFileStore` (not in SwiftData), so a
/// photo taken with no signal survives the app being killed. Files are removed
/// only after the server accepts the upload or the user discards a dead row.
/// Mirrors the Android `QueuedPhoto` entity.
@Model
final class QueuedPhoto {

    @Attribute(.unique) var id: UUID
    /// Server asset id. Nil while the asset itself is still queued offline.
    var assetId: String?
    /// `QueuedAssetCreate.localId` of an asset created offline. Filled into
    /// `assetId` once that asset syncs, which makes the photo uploadable.
    var assetLocalId: UUID?
    /// File names inside `PhotoFileStore.directory`. Names, not paths: the app
    /// container path changes between installs and updates.
    var fileName: String
    var thumbFileName: String?
    var createdAt: Date
    var attempts: Int
    var lastError: String?
    var state: String = "pending"

    init(
        id: UUID = UUID(),
        assetId: String? = nil,
        assetLocalId: UUID? = nil,
        fileName: String,
        thumbFileName: String? = nil,
        createdAt: Date = .now
    ) {
        self.id = id
        self.assetId = assetId
        self.assetLocalId = assetLocalId
        self.fileName = fileName
        self.thumbFileName = thumbFileName
        self.createdAt = createdAt
        self.attempts = 0
        self.lastError = nil
        self.state = QueueState.pending
    }
}

/// Where queued photo files live on disk.
struct PhotoFileStore {

    static let shared = PhotoFileStore(
        directory: FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("QueuedPhotos", isDirectory: true)
    )

    let directory: URL

    /// Writes `data` and returns its file name. Excluded from iCloud backup:
    /// these are transient upload copies, not user documents.
    func save(_ data: Data) throws -> String {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let name = "\(UUID().uuidString).jpg"
        var url = directory.appendingPathComponent(name)
        try data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try? url.setResourceValues(values)
        return name
    }

    func load(_ name: String) -> Data? {
        try? Data(contentsOf: directory.appendingPathComponent(name))
    }

    func delete(_ name: String?) {
        guard let name else { return }
        try? FileManager.default.removeItem(at: directory.appendingPathComponent(name))
    }

    func exists(_ name: String) -> Bool {
        FileManager.default.fileExists(atPath: directory.appendingPathComponent(name).path)
    }
}
