package com.vairiot.app.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface ScanSessionDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(session: ScanSessionEntity)

    @Query("UPDATE scan_sessions SET completedAtMs = :completedAtMs WHERE id = :id")
    suspend fun markCompleted(id: String, completedAtMs: Long)

    @Query("UPDATE scan_sessions SET uploadedAtMs = :uploadedAtMs WHERE id = :id")
    suspend fun markUploaded(id: String, uploadedAtMs: Long)

    @Query("SELECT * FROM scan_sessions WHERE id = :id")
    suspend fun getById(id: String): ScanSessionEntity?

    @Query("SELECT * FROM scan_sessions WHERE id = :id")
    fun observeById(id: String): Flow<ScanSessionEntity?>

    /** Most recent session that hasn't been marked complete — used for resume. */
    @Query("SELECT id FROM scan_sessions WHERE completedAtMs IS NULL ORDER BY createdAtMs DESC LIMIT 1")
    suspend fun latestActiveId(): String?
}
