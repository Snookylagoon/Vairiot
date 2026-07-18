package com.vairiot.app.sync

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.vairiot.app.data.api.AssetCreateRequest
import com.vairiot.app.data.api.VairiotApiService
import com.vairiot.app.data.local.QueuedAssetDao
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject

private const val MAX_ATTEMPTS = 5

/** Drains the offline asset-creation queue. Mirrors [ScanSyncWorker]. */
@HiltWorker
class AssetSyncWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted params: WorkerParameters,
    private val dao: QueuedAssetDao,
    private val api: VairiotApiService,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        var hadFailure = false

        while (true) {
            val batch = dao.takeBatch(50)
            if (batch.isEmpty()) break
            for (queued in batch) {
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
                        ),
                    )
                    dao.deleteById(queued.id)
                } catch (e: Exception) {
                    if (queued.attempts + 1 >= MAX_ATTEMPTS) {
                        dao.deleteById(queued.id) // drop poison record
                    } else {
                        dao.markFailure(queued.id, e.message ?: e.javaClass.simpleName)
                        hadFailure = true
                    }
                }
            }
        }

        return if (hadFailure) Result.retry() else Result.success()
    }
}
