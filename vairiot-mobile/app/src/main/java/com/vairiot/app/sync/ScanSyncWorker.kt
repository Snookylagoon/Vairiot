package com.vairiot.app.sync

import android.content.Context
import android.util.Log
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.vairiot.app.data.api.VairiotApiService
import com.vairiot.app.data.local.QueuedScanDao
import com.vairiot.app.data.local.TokenStore
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject

private const val TAG = "ScanSyncWorker"

/** Drains the offline audit-scan queue. The rules live in [drainQueue]. */
@HiltWorker
class ScanSyncWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted params: WorkerParameters,
    private val dao: QueuedScanDao,
    private val api: VairiotApiService,
    private val tokenStore: TokenStore,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        // Not signed in (e.g. after reboot before first login): leave the queue
        // untouched rather than sending requests that can only 401.
        if (tokenStore.getRefreshToken() == null) {
            Log.i(TAG, "Skipping sync — no session")
            return Result.success()
        }
        val report = drainQueue(ScanSyncQueue(dao, api.scanSender()))
        return report.toWorkResult(TAG)
    }
}
