import Foundation
import SwiftData

/// The slices of the API the offline queues need. `live` wraps `APIClient`;
/// tests pass closures that play the server.
struct SyncAPI {
    var recordScan: (_ campaignId: String, _ request: RecordScanRequest) async throws -> AuditScanEventResponse
    var createAsset: (_ request: AssetCreateRequest) async throws -> AssetResponse
    var uploadPhoto: (_ assetId: String, _ image: Data, _ thumb: Data?) async throws -> Void
    /// A photo bound to an audit scan; `scanRef` is the scan's clientRequestId.
    var uploadScanPhoto: (_ campaignId: String, _ scanRef: String, _ image: Data, _ thumb: Data?,
                          _ fields: [String: String]) async throws -> Void = { _, _, _, _, _ in }

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
            },
            uploadScanPhoto: { campaignId, scanRef, image, thumb, fields in
                let _: PhotoResponse = try await client.upload(
                    path: "api/v1/audits/\(campaignId)/scans/\(scanRef)/photos",
                    imageData: image,
                    thumbData: thumb,
                    fields: fields
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
        request.latitude = latitude
        request.longitude = longitude
        request.geoAccuracyMeters = geoAccuracyMeters
        request.conditionGrade = conditionGrade
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
                // Photos of an asset still queued offline wait for that asset;
                // scan photos wait until their scan has left the scan queue.
                let candidates = (try? context.fetch(FetchDescriptor<QueuedPhoto>(
                    predicate: #Predicate { $0.state != dead && ($0.assetId != nil || $0.scanClientRequestId != nil) },
                    sortBy: [SortDescriptor(\.createdAt)]
                ))) ?? []
                let queuedScans = Set(((try? context.fetch(FetchDescriptor<QueuedScan>())) ?? []).map(\.id.uuidString))
                return candidates.filter { photo in
                    guard let key = photo.scanClientRequestId else { return true }
                    return !queuedScans.contains(key)
                }
            },
            send: { photo in
                guard let image = files.load(photo.fileName) else {
                    throw UnsendableError(message: "Photo file is missing from this device")
                }
                let thumb = photo.thumbFileName.flatMap { files.load($0) }
                if let scanRef = photo.scanClientRequestId, let campaignId = photo.campaignId {
                    try await api.uploadScanPhoto(campaignId, scanRef, image, thumb, photo.scanPhotoFields)
                    return
                }
                guard let assetId = photo.assetId else { return }
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
