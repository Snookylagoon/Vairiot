package com.vairiot.app.di

import android.content.Context
import androidx.room.Room
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import com.vairiot.app.data.local.CachedAssetDao
import com.vairiot.app.data.local.QueuedAssetDao
import com.vairiot.app.data.local.QueuedPhotoDao
import com.vairiot.app.data.local.QueuedScanDao
import com.vairiot.app.data.local.ScanSessionDao
import com.vairiot.app.data.local.SessionTagDao
import com.vairiot.app.data.local.VairiotDatabase
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {

    // v5: dead-letter state + idempotency keys on the offline queues. A real
    // migration — the destructive fallback would wipe queued offline work.
    private val MIGRATION_4_5 = object : Migration(4, 5) {
        override fun migrate(db: SupportSQLiteDatabase) {
            for (table in listOf("queued_scans", "queued_assets")) {
                db.execSQL("ALTER TABLE $table ADD COLUMN state TEXT NOT NULL DEFAULT 'pending'")
                db.execSQL("ALTER TABLE $table ADD COLUMN clientRequestId TEXT NOT NULL DEFAULT ''")
                db.execSQL("UPDATE $table SET clientRequestId = lower(hex(randomblob(16))) WHERE clientRequestId = ''")
            }
        }
    }

    // v6: GS1 identity columns on the asset cache so scans of GS1 labels
    // resolve offline. Preserves the cache; a destructive fallback would
    // force a full re-sync on first launch.
    private val MIGRATION_5_6 = object : Migration(5, 6) {
        override fun migrate(db: SupportSQLiteDatabase) {
            db.execSQL("ALTER TABLE cached_assets ADD COLUMN individualAssetReference TEXT")
            db.execSQL("ALTER TABLE cached_assets ADD COLUMN giai TEXT")
        }
    }

    // v7: offline photo queue. Queue states gain 'failed' (transient failure,
    // retried automatically) — state is free TEXT, so no column change.
    // Column list must match QueuedPhoto exactly; Room validates it on open.
    private val MIGRATION_6_7 = object : Migration(6, 7) {
        override fun migrate(db: SupportSQLiteDatabase) {
            db.execSQL(
                """CREATE TABLE IF NOT EXISTS queued_photos (
                    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                    filePath TEXT NOT NULL,
                    thumbPath TEXT,
                    assetId TEXT,
                    assetClientRequestId TEXT,
                    createdAtMs INTEGER NOT NULL,
                    attempts INTEGER NOT NULL,
                    lastError TEXT,
                    state TEXT NOT NULL,
                    clientRequestId TEXT NOT NULL
                )""",
            )
        }
    }

    @Provides
    @Singleton
    fun provideDatabase(@ApplicationContext context: Context): VairiotDatabase =
        Room.databaseBuilder(context, VairiotDatabase::class.java, "vairiot.db")
            .addMigrations(MIGRATION_4_5, MIGRATION_5_6, MIGRATION_6_7)
            // No blanket destructive fallback: a version bump without a
            // migration must crash in testing, not silently wipe every offline
            // queue on a field device. Only pre-v4 builds (before the queues
            // had idempotency keys) are still allowed to rebuild from scratch.
            .fallbackToDestructiveMigrationFrom(true, 1, 2, 3)
            .build()

    @Provides
    fun provideQueuedScanDao(db: VairiotDatabase): QueuedScanDao = db.queuedScanDao()

    @Provides
    fun provideQueuedAssetDao(db: VairiotDatabase): QueuedAssetDao = db.queuedAssetDao()

    @Provides
    fun provideQueuedPhotoDao(db: VairiotDatabase): QueuedPhotoDao = db.queuedPhotoDao()

    @Provides
    fun provideCachedAssetDao(db: VairiotDatabase): CachedAssetDao = db.cachedAssetDao()

    @Provides
    fun provideScanSessionDao(db: VairiotDatabase): ScanSessionDao = db.scanSessionDao()

    @Provides
    fun provideSessionTagDao(db: VairiotDatabase): SessionTagDao = db.sessionTagDao()
}
