package com.vairiot.app.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface QueuedAssetDao {

    @Insert
    suspend fun insert(asset: QueuedAsset): Long

    @Query("SELECT * FROM queued_assets ORDER BY id ASC LIMIT :limit")
    suspend fun takeBatch(limit: Int = 50): List<QueuedAsset>

    @Query("DELETE FROM queued_assets WHERE id = :id")
    suspend fun deleteById(id: Long)

    @Query("UPDATE queued_assets SET attempts = attempts + 1, lastError = :error WHERE id = :id")
    suspend fun markFailure(id: Long, error: String)

    @Query("SELECT COUNT(*) FROM queued_assets")
    fun pendingCount(): Flow<Int>

    @Query("SELECT COUNT(*) FROM queued_assets")
    suspend fun totalPending(): Int
}
