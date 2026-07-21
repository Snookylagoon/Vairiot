package com.vairiot.app.di

import android.content.Context
import androidx.room.Room
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import com.vairiot.app.data.local.CachedAssetDao
import com.vairiot.app.data.local.QueuedAssetDao
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

    @Provides
    @Singleton
    fun provideDatabase(@ApplicationContext context: Context): VairiotDatabase =
        Room.databaseBuilder(context, VairiotDatabase::class.java, "vairiot.db")
            .addMigrations(MIGRATION_4_5)
            .fallbackToDestructiveMigration()
            .build()

    @Provides
    fun provideQueuedScanDao(db: VairiotDatabase): QueuedScanDao = db.queuedScanDao()

    @Provides
    fun provideQueuedAssetDao(db: VairiotDatabase): QueuedAssetDao = db.queuedAssetDao()

    @Provides
    fun provideCachedAssetDao(db: VairiotDatabase): CachedAssetDao = db.cachedAssetDao()

    @Provides
    fun provideScanSessionDao(db: VairiotDatabase): ScanSessionDao = db.scanSessionDao()

    @Provides
    fun provideSessionTagDao(db: VairiotDatabase): SessionTagDao = db.sessionTagDao()
}
