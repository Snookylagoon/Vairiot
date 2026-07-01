package com.vairiot.app.data.local

import androidx.room.Database
import androidx.room.RoomDatabase

@Database(
    entities = [
        QueuedScan::class,
        CachedAsset::class,
        ScanSessionEntity::class,
        SessionTagEntity::class,
    ],
    version = 3,
    exportSchema = false,
)
abstract class VairiotDatabase : RoomDatabase() {
    abstract fun queuedScanDao():   QueuedScanDao
    abstract fun cachedAssetDao():  CachedAssetDao
    abstract fun scanSessionDao():  ScanSessionDao
    abstract fun sessionTagDao():   SessionTagDao
}
