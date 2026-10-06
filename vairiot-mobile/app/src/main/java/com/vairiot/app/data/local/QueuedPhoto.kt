package com.vairiot.app.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey
import java.util.UUID

/**
 * Offline queue for asset photos. The compressed files already live in
 * `filesDir/photos` (see [com.vairiot.app.ImageCompressor]), so a photo taken
 * with no signal survives an app kill or reboot and is uploaded by
 * [com.vairiot.app.sync.PhotoSyncWorker]. The files are deleted only after the
 * server accepts the upload, or when the user discards a DEAD row.
 */
@Entity(tableName = "queued_photos")
data class QueuedPhoto(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    /** Absolute path of the compressed display image on the device. */
    val filePath: String,
    /** Absolute path of the client-made thumbnail, if one was produced. */
    val thumbPath: String? = null,
    /** Server asset id. Null while the asset itself is still in the offline queue. */
    val assetId: String? = null,
    /**
     * [QueuedAsset.clientRequestId] of an asset created offline. When that asset
     * syncs, [QueuedPhotoDao.attachToAsset] fills in [assetId] and the photo
     * becomes uploadable.
     */
    val assetClientRequestId: String? = null,
    val createdAtMs: Long = System.currentTimeMillis(),
    val attempts: Int = 0,
    val lastError: String? = null,
    val state: String = QueueState.PENDING,
    val clientRequestId: String = UUID.randomUUID().toString(),
)
