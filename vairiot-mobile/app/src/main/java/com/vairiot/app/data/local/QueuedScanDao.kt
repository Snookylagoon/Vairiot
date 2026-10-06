package com.vairiot.app.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface QueuedScanDao {
    @Insert
    suspend fun insert(scan: QueuedScan): Long

    /** Rows the sync worker should try: never-tried and transiently-failed. */
    @Query("SELECT * FROM queued_scans WHERE state IN ('pending', 'failed') ORDER BY id ASC LIMIT :limit")
    suspend fun takeBatch(limit: Int = 50): List<QueuedScan>

    /** Success only — the server has the scan. */
    @Query("DELETE FROM queued_scans WHERE id = :id")
    suspend fun deleteById(id: Long)

    /** Transient failure: retried automatically, does not count as an attempt. */
    @Query("UPDATE queued_scans SET state = 'failed', lastError = :error WHERE id = :id")
    suspend fun markFailed(id: Long, error: String)

    /** The server rejected it — park it for the user instead of deleting. */
    @Query("UPDATE queued_scans SET state = 'dead', attempts = attempts + 1, lastError = :error WHERE id = :id")
    suspend fun markDead(id: Long, error: String)

    /** Scans for this campaign not yet accepted by the server (pending or retrying). */
    @Query("SELECT COUNT(*) FROM queued_scans WHERE campaignId = :campaignId AND state IN ('pending', 'failed')")
    fun pendingCountByCampaign(campaignId: String): Flow<Int>

    @Query("SELECT * FROM queued_scans WHERE campaignId = :campaignId AND state IN ('pending', 'failed') ORDER BY id ASC")
    fun pendingByCampaign(campaignId: String): Flow<List<QueuedScan>>

    @Query("SELECT state, COUNT(*) AS count FROM queued_scans GROUP BY state")
    fun countsByState(): Flow<List<StateCount>>

    @Query("SELECT * FROM queued_scans WHERE state = 'dead' ORDER BY id ASC")
    fun deadItems(): Flow<List<QueuedScan>>

    @Query("UPDATE queued_scans SET state = 'pending', lastError = NULL WHERE id = :id AND state = 'dead'")
    suspend fun retryDead(id: Long)

    @Query("UPDATE queued_scans SET state = 'pending', lastError = NULL WHERE state = 'dead'")
    suspend fun retryAllDead()

    /** User-confirmed discard. Guarded on state so it can never remove a live row. */
    @Query("DELETE FROM queued_scans WHERE id = :id AND state = 'dead'")
    suspend fun discardDead(id: Long)

    @Query("DELETE FROM queued_scans WHERE state = 'dead'")
    suspend fun discardAllDead()
}
