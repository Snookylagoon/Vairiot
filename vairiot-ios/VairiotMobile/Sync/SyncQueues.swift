import Foundation
import SwiftData

/// The slices of the API the offline queues need. `live` wraps `APIClient`;
/// tests pass closures that play the server.
struct SyncAPI {
    var recordScan: (_ campaignId: String, _ request: RecordScanRequest) async throws -> AuditScanEventResponse
    var createAsset: (_ request: AssetCreateRequest) async throws -> AssetResponse
    var uploadPhoto: (_ assetId: String, _ image: Data, _ thumb: Data?) async throws -> Void

    static func live(_ client: APIClient = .shared) -> SyncAPI {
        SyncAPI(
            recordScan: { campaignId, request in
                try await client.request(.recordAuditScan(campaignId: campaignId, request))
            },
            createAsset: { request in
                try await client.request(.createAsset(request))
            },
            uploadPhoto: { assetId, image, thumb in
                let _: PhotoResponse = try await client.upload(
                    path: "\(APIEndpoint.uploadAssetPhotoPath)/\(assetId)/photos",
                    imageData: image,
                    thumbData: thumb
                )
            }
        )
    }
}

extension QueuedScan {
    /// The request for this scan. The online attempt and every replay are
    /// built here, so they carry the same fields and the same key.
    func toRequest() -> RecordScanRequest {
        var request = RecordScanRequest(tagValue: tagValue)
        request.deviceId = deviceId
        request.locationId = locationId
        request.condition = condition
        request.clientRequestId = id.uuidString
        request.capturedAt = ISO8601DateFormatter().string(from: createdAt)
        return request
    }
}

/// Builds the `SyncQueue` for each offline queue over a SwiftData context.
@MainActor
enum SyncQueues {

    static func scans(context: ModelContext, api: SyncAPI) -> SyncQueue<QueuedScan> {
        let dead = QueueState.dead
        return SyncQueue(
            nextBatch: {
                (try? context.fetch(FetchDescriptor<QueuedScan>(
                    predicate: #Predicate { $0.state != dead },
                    sortBy: [SortDescriptor(\.createdAt)]
                ))) ?? []
            },
            send: { scan in
                _ = try await api.recordScan(scan.campaignId, scan.toRequest())
            },
            onSynced: { scan in
                context.delete(scan)
                try? context.save()
            },
            markFailed: { scan, error in
                scan.state = QueueState.failed
                scan.lastError = error
                try? context.save()
            },
            markDead: { scan, error in
                scan.state = QueueState.dead
                scan.attempts += 1
                scan.lastError = error
                try? context.save()
            }
        )
    }

    static func assetCreates(context: ModelContext, api: SyncAPI) -> SyncQueue<QueuedAssetCreate> {
        let dead = QueueState.dead
        // send() and onSynced() run back to back for the same row (drainQueue).
        var created: AssetResponse?
        return SyncQueue(
            nextBatch: {
                (try? context.fetch(FetchDescriptor<QueuedAssetCreate>(
                    predicate: #Predicate { $0.state != dead },
                    sortBy: [SortDescriptor(\.createdAt)]
                ))) ?? []
            },
            send: { item in
                created = nil
                created = try await api.createAsset(item.toCreateRequest())
            },
            onSynced: { item in
                // Swap the provisional cache row for the server copy.
                let pendingId = item.provisionalCacheId
                if let provisional = try? context.fetch(FetchDescriptor<CachedAsset>(
                    predicate: #Predicate { $0.id == pendingId })).first {
                    context.delete(provisional)
                }
                if let created {
                    context.insert(CachedAsset(from: created))
                    // Photos taken against the offline asset can upload now it has an id.
                    let localId: UUID? = item.localId
                    let photos = (try? context.fetch(FetchDescriptor<QueuedPhoto>(
                        predicate: #Predicate { $0.assetLocalId == localId && $0.assetId == nil }))) ?? []
                    for photo in photos { photo.assetId = created.id }
                }
                context.delete(item)
                try? context.save()
            },
            markFailed: { item, error in
                item.state = QueueState.failed
                item.lastError = error
                try? context.save()
            },
            markDead: { item, error in
                item.state = QueueState.dead
                item.attempts += 1
                item.lastError = error
                try? context.save()
            }
        )
    }

    static func photos(
        context: ModelContext,
        api: SyncAPI,
        files: PhotoFileStore = .shared
    ) -> SyncQueue<QueuedPhoto> {
        let dead = QueueState.dead
        return SyncQueue(
            nextBatch: {
                // Photos of an asset still queued offline wait for that asset.
                (try? context.fetch(FetchDescriptor<QueuedPhoto>(
                    predicate: #Predicate { $0.state != dead && $0.assetId != nil },
                    sortBy: [SortDescriptor(\.createdAt)]
                ))) ?? []
            },
            send: { photo in
                guard let assetId = photo.assetId else { return }
                guard let image = files.load(photo.fileName) else {
                    throw UnsendableError(message: "Photo file is missing from this device")
                }
                let thumb = photo.thumbFileName.flatMap { files.load($0) }
                try await api.uploadPhoto(assetId, image, thumb)
            },
            onSynced: { photo in
                files.delete(photo.fileName)
                files.delete(photo.thumbFileName)
                context.delete(photo)
                try? context.save()
            },
            markFailed: { photo, error in
                photo.state = QueueState.failed
                photo.lastError = error
                try? context.save()
            },
            markDead: { photo, error in
                photo.state = QueueState.dead
                photo.attempts += 1
                photo.lastError = error
                try? context.save()
            }
        )
    }
}
