package com.vairiot.app.data.local

import androidx.room.Database
import androidx.room.RoomDatabase

@Database(
    entities = [
        QueuedScan::class,
        QueuedAsset::class,
        CachedAsset::class,
        ScanSessionEntity::class,
        SessionTagEntity::class,
    ],
    version = 4,
    exportSchema = false,
)
abstract class VairiotDatabase : RoomDatabase() {
    abstract fun queuedScanDao():   QueuedScanDao
    abstract fun queuedAssetDao():  QueuedAssetDao
    abstract fun cachedAssetDao():  CachedAssetDao
    abstract fun scanSessionDao():  ScanSessionDao
    abstract fun sessionTagDao():   SessionTagDao
}
