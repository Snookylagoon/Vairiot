package com.vairiot.app.sync

import android.content.Context
import android.util.Log
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.vairiot.app.data.api.RecordScanRequest
import com.vairiot.app.data.api.VairiotApiService
import com.vairiot.app.data.local.QueuedScanDao
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject

private const val MAX_ATTEMPTS = 5
private const val TAG = "ScanSyncWorker"

@HiltWorker
class ScanSyncWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted params: WorkerParameters,
    private val dao: QueuedScanDao,
    private val api: VairiotApiService,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        var hadFailure = false
        var synced = 0
        var dropped = 0
        while (true) {
            val batch = dao.takeBatch(50)
            if (batch.isEmpty()) break
            for (scan in batch) {
                try {
                    api.recordAuditScan(
                        scan.campaignId,
                        RecordScanRequest(tagValue = scan.tagValue, deviceId = scan.deviceId),
                    )
                    dao.deleteById(scan.id)
                    synced++
                } catch (e: Exception) {
                    if (scan.attempts + 1 >= MAX_ATTEMPTS) {
                        Log.w(TAG, "Dropping scan after $MAX_ATTEMPTS attempts: " +
                            "campaign=${scan.campaignId} tag=${scan.tagValue} error=${e.message}")
                        dao.deleteById(scan.id)
                        dropped++
                    } else {
                        dao.markFailure(scan.id, e.message ?: e.javaClass.simpleName)
                        hadFailure = true
                    }
                }
            }
        }
        if (synced > 0 || dropped > 0) {
            Log.i(TAG, "Sync complete: $synced synced, $dropped dropped")
        }
        return if (hadFailure) Result.retry() else Result.success()
    }
}
