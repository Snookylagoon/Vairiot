package com.vairiot.app.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Offline queue for new assets created without connectivity. Mirrors
 * [com.vairiot.app.data.api.AssetCreateRequest]; drained by
 * [com.vairiot.app.sync.AssetSyncWorker] once the network returns.
 */
@Entity(tableName = "queued_assets")
data class QueuedAsset(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val name: String,
    val rfidTag: String? = null,
    val barcode: String? = null,
    val description: String? = null,
    val serialNumber: String? = null,
    val condition: String = "good",
    val status: String = "active",
    val categoryId: String? = null,
    val siteId: String? = null,
    val locationId: String? = null,
    val createdAtMs: Long = System.currentTimeMillis(),
    val attempts: Int = 0,
    val lastError: String? = null,
)
