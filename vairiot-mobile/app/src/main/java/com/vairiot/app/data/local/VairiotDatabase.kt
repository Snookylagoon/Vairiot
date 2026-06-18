package com.vairiot.app.data.local

import androidx.room.Database
import androidx.room.RoomDatabase

@Database(
    entities = [QueuedScan::class, CachedAsset::class],
    version = 2,
    exportSchema = false,
)
abstract class VairiotDatabase : RoomDatabase() {
    abstract fun queuedScanDao(): QueuedScanDao
    abstract fun cachedAssetDao(): CachedAssetDao
}
