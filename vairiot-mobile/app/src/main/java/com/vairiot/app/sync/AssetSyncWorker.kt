package com.vairiot.app.sync

import android.content.Context
import android.util.Log
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.vairiot.app.data.api.AssetCreateRequest
import com.vairiot.app.data.api.VairiotApiService
import com.vairiot.app.data.local.QueuedAssetDao
import com.vairiot.app.data.local.TokenStore
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject

private const val MAX_ATTEMPTS = 5
private const val TAG = "AssetSyncWorker"

/** Drains the offline asset-creation queue. Mirrors [ScanSyncWorker]. */
@HiltWorker
class AssetSyncWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted params: WorkerParameters,
    private val dao: QueuedAssetDao,
    private val api: VairiotApiService,
    private val tokenStore: TokenStore,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        if (tokenStore.getRefreshToken() == null) {
            Log.i(TAG, "Skipping sync — no session")
            return Result.success()
        }

        var hadFailure = false
        var parked = 0
        // One attempt per item per run — see ScanSyncWorker.
        val seen = HashSet<Long>()
        drain@ while (true) {
            val batch = dao.takeBatch(50).filter { it.id !in seen }
            if (batch.isEmpty()) break
            for (queued in batch) {
                seen.add(queued.id)
                try {
                    api.createAsset(
                        AssetCreateRequest(
                            name         = queued.name,
                            rfidTag      = queued.rfidTag,
                            barcode      = queued.barcode,
                            description  = queued.description,
                            serialNumber = queued.serialNumber,
                            condition    = queued.condition,
                            status       = queued.status,
                            categoryId   = queued.categoryId,
                            siteId       = queued.siteId,
                            locationId   = queued.locationId,
                            clientRequestId = queued.clientRequestId,
                        ),
                    )
                    dao.deleteById(queued.id)
                } catch (e: Exception) {
                    val error = e.message ?: e.javaClass.simpleName
                    when (classifySyncFailure(e)) {
                        SyncFailureKind.NETWORK, SyncFailureKind.AUTH -> {
                            hadFailure = true
                            break@drain
                        }
                        SyncFailureKind.TRANSIENT, SyncFailureKind.PERMANENT -> {
                            if (queued.attempts + 1 >= MAX_ATTEMPTS) {
                                Log.w(TAG, "Parking queued asset after $MAX_ATTEMPTS attempts: " +
                                    "name=${queued.name} error=$error")
                                dao.markDead(queued.id, error)
                                parked++
                            } else {
                                dao.markFailure(queued.id, error)
                                hadFailure = true
                            }
                        }
                    }
                }
            }
        }
        if (parked > 0) Log.i(TAG, "$parked queued asset(s) parked as failed")
        return if (hadFailure) Result.retry() else Result.success()
    }
}
