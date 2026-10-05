package com.vairiot.app.sync

import com.vairiot.app.data.api.AuditScanEventResponse
import com.vairiot.app.data.local.QueuedScan
import com.vairiot.app.data.local.QueuedScanDao

/**
 * Records one audit scan, online if possible, queued if not.
 *
 * The scan is written to the queue *before* the request goes out (crash-safe),
 * and the online request carries that row's clientRequestId. So if the server
 * stores the scan but the response is lost, the queued replay reuses the same
 * key and the server returns the original event instead of counting it twice.
 */
class AuditScanRecorder(
    private val dao: QueuedScanDao,
    private val sender: ScanSender,
    private val onQueued: () -> Unit,
) {
    sealed interface Outcome {
        data class Recorded(val event: AuditScanEventResponse) : Outcome
        /** The server already had this exact scan (duplicate key). */
        object AlreadyRecorded : Outcome
        /** Saved on the device; the sync worker will send it. */
        object Queued : Outcome
        /** The server refused it. Kept as DEAD for the user to retry or discard. */
        data class Rejected(val message: String) : Outcome
    }

    suspend fun record(
        campaignId: String,
        tagValue: String,
        locationId: String?,
        condition: String?,
        deviceId: String? = null,
    ): Outcome {
        val draft = QueuedScan(
            campaignId = campaignId,
            tagValue = tagValue,
            deviceId = deviceId,
            locationId = locationId,
            condition = condition,
        )
        val queued = draft.copy(id = dao.insert(draft))
        return try {
            val event = sender.send(campaignId, queued.toRequest())
            dao.deleteById(queued.id)
            Outcome.Recorded(event)
        } catch (e: Exception) {
            val failure = classifySyncFailure(e)
            when (failure.kind) {
                SyncFailureKind.DUPLICATE -> {
                    dao.deleteById(queued.id)
                    Outcome.AlreadyRecorded
                }
                SyncFailureKind.NETWORK, SyncFailureKind.TRANSIENT -> {
                    dao.markFailed(queued.id, failure.message)
                    onQueued()
                    Outcome.Queued
                }
                SyncFailureKind.AUTH -> {
                    // Left PENDING; it drains after the user signs in again.
                    onQueued()
                    Outcome.Queued
                }
                SyncFailureKind.PERMANENT -> {
                    dao.markDead(queued.id, failure.message)
                    Outcome.Rejected(failure.message)
                }
            }
        }
    }
}
