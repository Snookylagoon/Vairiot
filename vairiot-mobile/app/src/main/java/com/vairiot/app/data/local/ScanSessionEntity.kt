package com.vairiot.app.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "scan_sessions")
data class ScanSessionEntity(
    @PrimaryKey val id: String,
    val siteId:         String? = null,
    val siteName:       String? = null,
    val categoryId:     String? = null,
    val categoryName:   String? = null,
    val createdAtMs:    Long,
    val completedAtMs:  Long? = null,
    val uploadedAtMs:   Long? = null,
)
