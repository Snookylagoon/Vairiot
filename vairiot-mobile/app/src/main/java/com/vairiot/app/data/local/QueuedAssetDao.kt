package com.vairiot.app.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface QueuedAssetDao {

    @Insert
    suspend fun insert(asset: QueuedAsset): Long

    /** Rows the sync worker should try: never-tried and transiently-failed. */
    @Query("SELECT * FROM queued_assets WHERE state IN ('pending', 'failed') ORDER BY id ASC LIMIT :limit")
    suspend fun takeBatch(limit: Int = 50): List<QueuedAsset>

    /** Success only — the server has the asset. */
    @Query("DELETE FROM queued_assets WHERE id = :id")
    suspend fun deleteById(id: Long)

    /** Transient failure: retried automatically, does not count as an attempt. */
    @Query("UPDATE queued_assets SET state = 'failed', lastError = :error WHERE id = :id")
    suspend fun markFailed(id: Long, error: String)

    /** The server rejected it — park it for the user instead of deleting. */
    @Query("UPDATE queued_assets SET state = 'dead', attempts = attempts + 1, lastError = :error WHERE id = :id")
    suspend fun markDead(id: Long, error: String)

    @Query("SELECT state, COUNT(*) AS count FROM queued_assets GROUP BY state")
    fun countsByState(): Flow<List<StateCount>>

    @Query("SELECT * FROM queued_assets WHERE state = 'dead' ORDER BY id ASC")
    fun deadItems(): Flow<List<QueuedAsset>>

    @Query("UPDATE queued_assets SET state = 'pending', lastError = NULL WHERE id = :id AND state = 'dead'")
    suspend fun retryDead(id: Long)

    @Query("UPDATE queued_assets SET state = 'pending', lastError = NULL WHERE state = 'dead'")
    suspend fun retryAllDead()

    /** User-confirmed discard. Guarded on state so it can never remove a live row. */
    @Query("DELETE FROM queued_assets WHERE id = :id AND state = 'dead'")
    suspend fun discardDead(id: Long)

    @Query("DELETE FROM queued_assets WHERE state = 'dead'")
    suspend fun discardAllDead()
}
