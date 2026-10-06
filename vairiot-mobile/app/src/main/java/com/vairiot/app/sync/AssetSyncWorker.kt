package com.vairiot.app.sync

import android.content.Context
import android.util.Log
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.vairiot.app.data.api.VairiotApiService
import com.vairiot.app.data.local.QueuedAssetDao
import com.vairiot.app.data.local.QueuedPhotoDao
import com.vairiot.app.data.local.TokenStore
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject

private const val TAG = "AssetSyncWorker"

/** Drains the offline asset-creation queue. Mirrors [ScanSyncWorker]. */
@HiltWorker
class AssetSyncWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted params: WorkerParameters,
    private val dao: QueuedAssetDao,
    private val photoDao: QueuedPhotoDao,
    private val api: VairiotApiService,
    private val tokenStore: TokenStore,
    private val photoSyncScheduler: PhotoSyncScheduler,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        if (tokenStore.getRefreshToken() == null) {
            Log.i(TAG, "Skipping sync — no session")
            return Result.success()
        }
        val report = drainQueue(AssetSyncQueue(dao, photoDao, api.assetSender()))
        // Newly created assets may have photos waiting on their server id.
        if (report.synced > 0) photoSyncScheduler.triggerNow()
        return report.toWorkResult(TAG)
    }
}
