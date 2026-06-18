package com.vairiot.app.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "queued_scans")
data class QueuedScan(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val campaignId: String,
    val tagValue: String,
    val deviceId: String? = null,
    val createdAtMs: Long = System.currentTimeMillis(),
    val attempts: Int = 0,
    val lastError: String? = null,
)
