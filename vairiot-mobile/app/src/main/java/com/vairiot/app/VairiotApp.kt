package com.vairiot.app

import android.app.Application
import androidx.hilt.work.HiltWorkerFactory
import androidx.work.Configuration
import com.vairiot.app.data.local.TokenStore
import com.vairiot.app.sync.AssetSyncScheduler
import com.vairiot.app.sync.PhotoSyncScheduler
import com.vairiot.app.sync.ScanSyncScheduler
import com.vairiot.app.update.UpdateCheckScheduler
import dagger.hilt.android.HiltAndroidApp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltAndroidApp
class VairiotApp : Application(), Configuration.Provider {

    @Inject lateinit var workerFactory: HiltWorkerFactory
    @Inject lateinit var scanSyncScheduler: ScanSyncScheduler
    @Inject lateinit var assetSyncScheduler: AssetSyncScheduler
    @Inject lateinit var photoSyncScheduler: PhotoSyncScheduler
    @Inject lateinit var tokenStore: TokenStore

    private val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    @Inject lateinit var updateCheckScheduler: UpdateCheckScheduler

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setWorkerFactory(workerFactory)
            .build()

    override fun onCreate() {
        super.onCreate()
        // The session is kept across cold starts (matching iOS): wiping it here
        // meant post-reboot sync workers hit guaranteed 401s and queued offline
        // work could never drain until someone logged back in. Tokens are only
        // cleared when the server genuinely rejects a refresh (NetworkModule).
        scanSyncScheduler.ensurePeriodic()
        assetSyncScheduler.ensurePeriodic()
        photoSyncScheduler.ensurePeriodic()
        // Workers pause on a 401 instead of retrying, so drain every queue as
        // soon as a session exists: on launch if already signed in, and again
        // on each sign-in. Photos of offline-created assets wait until their
        // asset syncs (AssetSyncWorker re-triggers the photo queue).
        appScope.launch {
            tokenStore.signedIn.filter { it }.collect {
                assetSyncScheduler.triggerNow()
                scanSyncScheduler.triggerNow()
                photoSyncScheduler.triggerNow()
            }
        }
        // Check for an APK update on every cold start, then every 6h while connected.
        updateCheckScheduler.ensurePeriodic()
        updateCheckScheduler.triggerNow()
    }
}
