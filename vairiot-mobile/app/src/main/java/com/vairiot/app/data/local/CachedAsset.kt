package com.vairiot.app.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "cached_assets")
data class CachedAsset(
    @PrimaryKey val id: String,
    val assetNumber:  String,
    val name:         String,
    val description:  String?,
    val status:       String,
    val condition:    String,
    val serialNumber: String?,
    val barcode:      String?,
    val rfidTag:      String?,
    val categoryName: String?,
    val siteName:     String?,
    val locationName: String?,
    val cachedAtMs:   Long = System.currentTimeMillis(),
)
