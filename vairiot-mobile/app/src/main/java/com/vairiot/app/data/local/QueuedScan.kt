package com.vairiot.app.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey
import java.util.UUID

object QueueState {
    const val PENDING = "pending"
    /** Exhausted its attempts — kept for the user to retry or discard, never silently deleted. */
    const val DEAD = "dead"
}

@Entity(tableName = "queued_scans")
data class QueuedScan(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val campaignId: String,
    val tagValue: String,
    val deviceId: String? = null,
    val locationId: String? = null,
    val condition: String? = null,
    val createdAtMs: Long = System.currentTimeMillis(),
    val attempts: Int = 0,
    val lastError: String? = null,
    val state: String = QueueState.PENDING,
    val clientRequestId: String = UUID.randomUUID().toString(),
)
