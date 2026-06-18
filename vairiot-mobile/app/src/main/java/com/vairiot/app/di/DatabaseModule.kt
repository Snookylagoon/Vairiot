package com.vairiot.app.di

import android.content.Context
import androidx.room.Room
import com.vairiot.app.data.local.QueuedScanDao
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

    @Provides
    @Singleton
    fun provideDatabase(@ApplicationContext context: Context): VairiotDatabase =
        Room.databaseBuilder(context, VairiotDatabase::class.java, "vairiot.db")
            .fallbackToDestructiveMigration()
            .build()

    @Provides
    fun provideQueuedScanDao(db: VairiotDatabase): QueuedScanDao = db.queuedScanDao()
}
