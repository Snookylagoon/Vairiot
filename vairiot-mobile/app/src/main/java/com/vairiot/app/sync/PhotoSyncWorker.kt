package com.vairiot.app.sync

import android.content.Context
import android.util.Log
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.vairiot.app.data.api.VairiotApiService
import com.vairiot.app.data.local.QueuedPhotoDao
import com.vairiot.app.data.local.TokenStore
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject

private const val TAG = "PhotoSyncWorker"

/** Drains the offline photo queue. Mirrors [ScanSyncWorker]. */
@HiltWorker
class PhotoSyncWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted params: WorkerParameters,
    private val dao: QueuedPhotoDao,
    private val api: VairiotApiService,
    private val tokenStore: TokenStore,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        if (tokenStore.getRefreshToken() == null) {
            Log.i(TAG, "Skipping sync — no session")
            return Result.success()
        }
        // Photos are large; smaller batches keep one run short on a weak signal.
        val report = drainQueue(PhotoSyncQueue(dao, api.photoUploader()), batchSize = 10)
        return report.toWorkResult(TAG)
    }
}
