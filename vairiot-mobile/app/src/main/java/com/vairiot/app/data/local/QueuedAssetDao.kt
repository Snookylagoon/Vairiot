package com.vairiot.app.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface QueuedAssetDao {

    @Insert
    suspend fun insert(asset: QueuedAsset): Long

    @Query("SELECT * FROM queued_assets WHERE state = 'pending' ORDER BY id ASC LIMIT :limit")
    suspend fun takeBatch(limit: Int = 50): List<QueuedAsset>

    @Query("DELETE FROM queued_assets WHERE id = :id")
    suspend fun deleteById(id: Long)

    @Query("UPDATE queued_assets SET attempts = attempts + 1, lastError = :error WHERE id = :id")
    suspend fun markFailure(id: Long, error: String)

    /** Exhausted retries — park it for the user instead of deleting. */
    @Query("UPDATE queued_assets SET state = 'dead', attempts = attempts + 1, lastError = :error WHERE id = :id")
    suspend fun markDead(id: Long, error: String)

    @Query("SELECT COUNT(*) FROM queued_assets WHERE state = 'pending'")
    fun pendingCount(): Flow<Int>

    @Query("SELECT COUNT(*) FROM queued_assets WHERE state = 'pending'")
    suspend fun totalPending(): Int

    @Query("SELECT * FROM queued_assets WHERE state = 'dead' ORDER BY id ASC")
    fun deadItems(): Flow<List<QueuedAsset>>

    @Query("SELECT COUNT(*) FROM queued_assets WHERE state = 'dead'")
    fun deadCount(): Flow<Int>

    @Query("UPDATE queued_assets SET state = 'pending', attempts = 0, lastError = NULL WHERE state = 'dead'")
    suspend fun retryAllDead()

    @Query("DELETE FROM queued_assets WHERE state = 'dead'")
    suspend fun discardAllDead()
}
