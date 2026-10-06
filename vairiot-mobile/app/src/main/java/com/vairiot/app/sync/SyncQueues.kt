package com.vairiot.app.sync

import com.vairiot.app.data.api.AssetCreateRequest
import com.vairiot.app.data.api.AssetResponse
import com.vairiot.app.data.api.AuditScanEventResponse
import com.vairiot.app.data.api.RecordScanRequest
import com.vairiot.app.data.api.VairiotApiService
import com.vairiot.app.data.local.QueuedAsset
import com.vairiot.app.data.local.QueuedAssetDao
import com.vairiot.app.data.local.QueuedPhoto
import com.vairiot.app.data.local.QueuedPhotoDao
import com.vairiot.app.data.local.QueuedScan
import com.vairiot.app.data.local.QueuedScanDao
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import java.io.File
import java.time.Instant

// The narrow slices of VairiotApiService the queues need, so tests can swap in
// a fake API without implementing the whole Retrofit interface.

fun interface ScanSender {
    suspend fun send(campaignId: String, request: RecordScanRequest): AuditScanEventResponse
}

fun interface AssetSender {
    suspend fun create(request: AssetCreateRequest): AssetResponse
}

fun interface PhotoUploader {
    suspend fun upload(assetId: String, photo: File, thumb: File?)
}

fun VairiotApiService.scanSender() = ScanSender { id, request -> recordAuditScan(id, request) }

fun VairiotApiService.assetSender() = AssetSender { request -> createAsset(request) }

fun VairiotApiService.photoUploader() = PhotoUploader { assetId, photo, thumb ->
    val webp = "image/webp".toMediaTypeOrNull()
    uploadAssetPhoto(
        assetId,
        MultipartBody.Part.createFormData("photo", photo.name, photo.asRequestBody(webp)),
        thumb?.let { MultipartBody.Part.createFormData("thumb", it.name, it.asRequestBody(webp)) },
    )
}

/**
 * The request for a queued scan. The online attempt and every replay are built
 * here, so they always carry the same fields and the same idempotency key.
 */
fun QueuedScan.toRequest() = RecordScanRequest(
    tagValue = tagValue,
    deviceId = deviceId,
    locationId = locationId,
    condition = condition,
    clientRequestId = clientRequestId,
    capturedAt = Instant.ofEpochMilli(createdAtMs).toString(),
)

fun QueuedAsset.toRequest() = AssetCreateRequest(
    name = name,
    rfidTag = rfidTag,
    barcode = barcode,
    description = description,
    serialNumber = serialNumber,
    condition = condition,
    status = status,
    categoryId = categoryId,
    siteId = siteId,
    locationId = locationId,
    clientRequestId = clientRequestId,
)

class ScanSyncQueue(
    private val dao: QueuedScanDao,
    private val sender: ScanSender,
) : SyncQueue<QueuedScan> {
    override suspend fun nextBatch(limit: Int) = dao.takeBatch(limit)
    override fun idOf(item: QueuedScan) = item.id
    override suspend fun send(item: QueuedScan) {
        sender.send(item.campaignId, item.toRequest())
    }
    override suspend fun onSynced(item: QueuedScan) = dao.deleteById(item.id)
    override suspend fun markFailed(id: Long, error: String) = dao.markFailed(id, error)
    override suspend fun markDead(id: Long, error: String) = dao.markDead(id, error)
}

class AssetSyncQueue(
    private val dao: QueuedAssetDao,
    private val photoDao: QueuedPhotoDao,
    private val sender: AssetSender,
) : SyncQueue<QueuedAsset> {
    // send() and onSynced() run back to back for the same row (see drainQueue).
    private var created: AssetResponse? = null

    override suspend fun nextBatch(limit: Int) = dao.takeBatch(limit)
    override fun idOf(item: QueuedAsset) = item.id
    override suspend fun send(item: QueuedAsset) {
        created = null
        created = sender.create(item.toRequest())
    }
    override suspend fun onSynced(item: QueuedAsset) {
        // Photos taken against the offline asset can upload now it has an id.
        created?.let { photoDao.attachToAsset(item.clientRequestId, it.id) }
        dao.deleteById(item.id)
    }
    override suspend fun markFailed(id: Long, error: String) = dao.markFailed(id, error)
    override suspend fun markDead(id: Long, error: String) = dao.markDead(id, error)
}

class PhotoSyncQueue(
    private val dao: QueuedPhotoDao,
    private val uploader: PhotoUploader,
) : SyncQueue<QueuedPhoto> {
    override suspend fun nextBatch(limit: Int) = dao.takeBatch(limit)
    override fun idOf(item: QueuedPhoto) = item.id
    override suspend fun send(item: QueuedPhoto) {
        val assetId = item.assetId ?: throw IllegalStateException("Photo has no asset yet")
        val photo = File(item.filePath)
        if (!photo.exists()) throw UnsendableException("Photo file is missing from this device")
        val thumb = item.thumbPath?.let(::File)?.takeIf { it.exists() }
        uploader.upload(assetId, photo, thumb)
    }
    override suspend fun onSynced(item: QueuedPhoto) {
        dao.deleteById(item.id)
        deletePhotoFiles(item)
    }
    override suspend fun markFailed(id: Long, error: String) = dao.markFailed(id, error)
    override suspend fun markDead(id: Long, error: String) = dao.markDead(id, error)
}

/** Removes a queued photo's files. Only after upload, or a user-confirmed discard. */
fun deletePhotoFiles(item: QueuedPhoto) {
    File(item.filePath).delete()
    item.thumbPath?.let { File(it).delete() }
}
