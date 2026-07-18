package com.vairiot.app

import android.app.Application
import androidx.hilt.work.HiltWorkerFactory
import androidx.work.Configuration
import com.vairiot.app.data.local.TokenStore
import com.vairiot.app.sync.AssetSyncScheduler
import com.vairiot.app.sync.ScanSyncScheduler
import com.vairiot.app.update.UpdateCheckScheduler
import dagger.hilt.android.HiltAndroidApp
import kotlinx.coroutines.runBlocking
import javax.inject.Inject

@HiltAndroidApp
class VairiotApp : Application(), Configuration.Provider {

    @Inject lateinit var workerFactory: HiltWorkerFactory
    @Inject lateinit var scanSyncScheduler: ScanSyncScheduler
    @Inject lateinit var assetSyncScheduler: AssetSyncScheduler
    @Inject lateinit var updateCheckScheduler: UpdateCheckScheduler
    @Inject lateinit var tokenStore: TokenStore

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setWorkerFactory(workerFactory)
            .build()

    override fun onCreate() {
        super.onCreate()
        // Force re-login on every cold start. Background/foreground transitions
        // do NOT re-invoke Application.onCreate, so resuming the app keeps the
        // user signed in — only a real process death (icon tap after swipe-away
        // / OS kill / device reboot) wipes the session.
        runBlocking { tokenStore.clearSession() }
        scanSyncScheduler.ensurePeriodic()
        assetSyncScheduler.ensurePeriodic()
        // Check for an APK update on every cold start, then every 6h while connected.
        updateCheckScheduler.ensurePeriodic()
        updateCheckScheduler.triggerNow()
    }
}
