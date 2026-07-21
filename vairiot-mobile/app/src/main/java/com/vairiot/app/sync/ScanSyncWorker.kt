package com.vairiot.app.sync

import android.content.Context
import android.util.Log
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.vairiot.app.data.api.RecordScanRequest
import com.vairiot.app.data.api.VairiotApiService
import com.vairiot.app.data.local.QueuedScanDao
import com.vairiot.app.data.local.TokenStore
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import java.time.Instant

private const val MAX_ATTEMPTS = 5
private const val TAG = "ScanSyncWorker"

@HiltWorker
class ScanSyncWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted params: WorkerParameters,
    private val dao: QueuedScanDao,
    private val api: VairiotApiService,
    private val tokenStore: TokenStore,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        // Not signed in (e.g. after reboot before first unlock/login): leave the
        // queue untouched rather than burning attempts on guaranteed 401s.
        if (tokenStore.getRefreshToken() == null) {
            Log.i(TAG, "Skipping sync — no session")
            return Result.success()
        }

        var hadFailure = false
        var synced = 0
        var parked = 0
        // One attempt per item per run — failed items stay pending for the next
        // WorkManager-scheduled run instead of burning all their attempts now.
        val seen = HashSet<Long>()
        drain@ while (true) {
            val batch = dao.takeBatch(50).filter { it.id !in seen }
            if (batch.isEmpty()) break
            for (scan in batch) {
                seen.add(scan.id)
                try {
                    api.recordAuditScan(
                        scan.campaignId,
                        RecordScanRequest(
                            tagValue = scan.tagValue,
                            deviceId = scan.deviceId,
                            locationId = scan.locationId,
                            condition = scan.condition,
                            clientRequestId = scan.clientRequestId,
                            capturedAt = Instant.ofEpochMilli(scan.createdAtMs).toString(),
                        ),
                    )
                    dao.deleteById(scan.id)
                    synced++
                } catch (e: Exception) {
                    val error = e.message ?: e.javaClass.simpleName
                    when (classifySyncFailure(e)) {
                        SyncFailureKind.NETWORK -> {
                            // Offline again — stop, retry later, no attempt burned.
                            hadFailure = true
                            break@drain
                        }
                        SyncFailureKind.AUTH -> {
                            Log.i(TAG, "Sync stopped — not authorised")
                            hadFailure = true
                            break@drain
                        }
                        SyncFailureKind.TRANSIENT, SyncFailureKind.PERMANENT -> {
                            if (scan.attempts + 1 >= MAX_ATTEMPTS) {
                                Log.w(TAG, "Parking scan after $MAX_ATTEMPTS attempts: " +
                                    "campaign=${scan.campaignId} tag=${scan.tagValue} error=$error")
                                dao.markDead(scan.id, error)
                                parked++
                            } else {
                                dao.markFailure(scan.id, error)
                                hadFailure = true
                            }
                        }
                    }
                }
            }
        }
        if (synced > 0 || parked > 0) {
            Log.i(TAG, "Sync complete: $synced synced, $parked parked as failed")
        }
        return if (hadFailure) Result.retry() else Result.success()
    }
}
