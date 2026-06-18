package com.vairiot.app.data.local

import androidx.room.Database
import androidx.room.RoomDatabase

@Database(entities = [QueuedScan::class], version = 1, exportSchema = false)
abstract class VairiotDatabase : RoomDatabase() {
    abstract fun queuedScanDao(): QueuedScanDao
}
