package com.vairiot.app.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface SessionTagDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(tag: SessionTagEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(tags: List<SessionTagEntity>)

    @Query("SELECT * FROM session_tags WHERE sessionId = :sessionId AND epc = :epc LIMIT 1")
    suspend fun getByEpc(sessionId: String, epc: String): SessionTagEntity?

    @Query("SELECT * FROM session_tags WHERE sessionId = :sessionId")
    suspend fun listAllOnce(sessionId: String): List<SessionTagEntity>

    @Query("SELECT * FROM session_tags WHERE sessionId = :sessionId ORDER BY firstSeenMs ASC")
    fun observeAll(sessionId: String): Flow<List<SessionTagEntity>>

    @Query("SELECT COUNT(*) FROM session_tags WHERE sessionId = :sessionId AND status = :status")
    suspend fun countByStatus(sessionId: String, status: String): Int

    @Query("""
        UPDATE session_tags
        SET status = :status,
            assetId = :assetId,
            ignoredByUserId = :ignoredByUserId,
            ignoredAtMs = :ignoredAtMs
        WHERE sessionId = :sessionId AND epc = :epc
    """)
    suspend fun updateStatus(
        sessionId: String,
        epc: String,
        status: String,
        assetId: String?,
        ignoredByUserId: String?,
        ignoredAtMs: Long?,
    )
}
