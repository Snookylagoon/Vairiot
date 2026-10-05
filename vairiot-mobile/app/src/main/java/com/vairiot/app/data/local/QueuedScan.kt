package com.vairiot.app.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey
import java.util.UUID

/**
 * Lifecycle of a row in any offline queue (scans, assets, photos). A row is
 * only ever deleted once the server has accepted it, or when the user
 * explicitly discards a DEAD row. Failures never delete.
 */
object QueueState {
    /** Not tried yet. */
    const val PENDING = "pending"
    /** Tried and hit a transient problem (offline, timeout, 5xx). Retried automatically. */
    const val FAILED = "failed"
    /** The server rejected it outright. Kept for the user to retry or discard. */
    const val DEAD = "dead"
}

/** One row of a `SELECT state, COUNT(*) ... GROUP BY state` query. */
data class StateCount(val state: String, val count: Int)

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
    /** Generated once when the row is queued and sent unchanged on every attempt. */
    val clientRequestId: String = UUID.randomUUID().toString(),
)
