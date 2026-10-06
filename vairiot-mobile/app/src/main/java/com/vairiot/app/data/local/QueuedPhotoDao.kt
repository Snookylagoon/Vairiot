package com.vairiot.app.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface QueuedPhotoDao {

    @Insert
    suspend fun insert(photo: QueuedPhoto): Long

    /**
     * Rows the sync worker should try. Photos whose asset is itself still queued
     * offline (no [QueuedPhoto.assetId] yet) wait until that asset syncs.
     */
    @Query("SELECT * FROM queued_photos WHERE state IN ('pending', 'failed') AND assetId IS NOT NULL ORDER BY id ASC LIMIT :limit")
    suspend fun takeBatch(limit: Int = 20): List<QueuedPhoto>

    @Query("SELECT * FROM queued_photos WHERE id = :id")
    suspend fun getById(id: Long): QueuedPhoto?

    /** Success only — the server has the photo. The caller deletes the files. */
    @Query("DELETE FROM queued_photos WHERE id = :id")
    suspend fun deleteById(id: Long)

    /** Transient failure: retried automatically, does not count as an attempt. */
    @Query("UPDATE queued_photos SET state = 'failed', lastError = :error WHERE id = :id")
    suspend fun markFailed(id: Long, error: String)

    /** The server rejected it — park it for the user instead of deleting. */
    @Query("UPDATE queued_photos SET state = 'dead', attempts = attempts + 1, lastError = :error WHERE id = :id")
    suspend fun markDead(id: Long, error: String)

    /** Called when a queued asset is created server-side, so its photos can follow. */
    @Query("UPDATE queued_photos SET assetId = :assetId WHERE assetClientRequestId = :assetClientRequestId AND assetId IS NULL")
    suspend fun attachToAsset(assetClientRequestId: String, assetId: String)

    @Query("SELECT COUNT(*) FROM queued_photos WHERE assetId = :assetId AND state IN ('pending', 'failed')")
    fun pendingCountForAsset(assetId: String): Flow<Int>

    @Query("SELECT state, COUNT(*) AS count FROM queued_photos GROUP BY state")
    fun countsByState(): Flow<List<StateCount>>

    @Query("SELECT * FROM queued_photos WHERE state = 'dead' ORDER BY id ASC")
    fun deadItems(): Flow<List<QueuedPhoto>>

    @Query("SELECT * FROM queued_photos WHERE state = 'dead' ORDER BY id ASC")
    suspend fun deadItemsOnce(): List<QueuedPhoto>

    @Query("UPDATE queued_photos SET state = 'pending', lastError = NULL WHERE id = :id AND state = 'dead'")
    suspend fun retryDead(id: Long)

    @Query("UPDATE queued_photos SET state = 'pending', lastError = NULL WHERE state = 'dead'")
    suspend fun retryAllDead()

    /** User-confirmed discard. Guarded on state so it can never remove a live row. */
    @Query("DELETE FROM queued_photos WHERE id = :id AND state = 'dead'")
    suspend fun discardDead(id: Long)
}
