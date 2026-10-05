package com.vairiot.app.sync

import com.vairiot.app.data.local.QueueState
import com.vairiot.app.scanner.MockScannerService
import com.vairiot.app.scanner.ScanResult
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

/**
 * Field flow end to end: a tag arrives from the (mock) scanner, the recorder
 * tries online, and anything not accepted is replayed by the sync queue with
 * the same fields and the same idempotency key.
 */
class AuditScanRecorderTest {

    private val dao = FakeQueuedScanDao()
    private var syncTriggered = 0

    /** One read from MockScannerService, the scanner used on devices without hardware. */
    private fun scanTag(): ScanResult = runBlocking {
        val scanner = MockScannerService()
        withTimeout(5_000) {
            val next = async(start = CoroutineStart.UNDISPATCHED) { scanner.scanResults.first() }
            scanner.startScan()
            next.await()
        }
    }

    private fun recorder(api: FakeScanApi) = AuditScanRecorder(dao, api) { syncTriggered++ }

    private fun recordBlindScan(api: FakeScanApi, tag: String) = runBlocking {
        recorder(api).record(
            campaignId = "camp-blind",
            tagValue = tag,
            locationId = "loc-zone-a",
            condition = "fair",
        )
    }

    @Test
    fun `online scan is sent with an idempotency key and leaves nothing queued`() {
        val tag = scanTag().value
        assertEquals(MockScannerService.MOCK_TAG, tag)
        val api = FakeScanApi()

        val outcome = recordBlindScan(api, tag)

        assertTrue(outcome is AuditScanRecorder.Outcome.Recorded)
        assertTrue(dao.all.isEmpty())
        val sent = api.requests.single().second
        assertEquals(tag, sent.tagValue)
        assertEquals("loc-zone-a", sent.locationId)
        assertEquals("fair", sent.condition)
        assertNotNull(sent.clientRequestId)
        assertEquals(0, syncTriggered)
    }

    @Test
    fun `offline blind scan keeps zone, condition, capture time and key for the replay`() {
        val tag = scanTag().value
        val online = FakeScanApi(offline())

        val outcome = recordBlindScan(online, tag)

        assertEquals(AuditScanRecorder.Outcome.Queued, outcome)
        assertEquals(1, syncTriggered)
        val row = dao.all.single()
        assertEquals(QueueState.FAILED, row.state)
        assertEquals("loc-zone-a", row.locationId)
        assertEquals("fair", row.condition)

        // Back online: the worker replays it.
        val replayApi = FakeScanApi()
        val report = runBlocking { drainQueue(ScanSyncQueue(dao, replayApi)) }

        assertEquals(1, report.synced)
        assertTrue(dao.all.isEmpty())
        val firstTry = online.requests.single().second
        val replay = replayApi.requests.single().second
        assertEquals("same key on the online try and the replay", firstTry.clientRequestId, replay.clientRequestId)
        assertEquals("loc-zone-a", replay.locationId)
        assertEquals("fair", replay.condition)
        assertEquals(Instant.ofEpochMilli(row.createdAtMs).toString(), replay.capturedAt)
        assertEquals(firstTry.capturedAt, replay.capturedAt)
    }

    @Test
    fun `a timeout after the server stored the scan replays with the same key`() {
        // The server records the scan but the response never arrives. The replay
        // must carry the same key so the server returns the original event.
        val online = FakeScanApi(timeout())
        recordBlindScan(online, scanTag().value)
        val replayApi = FakeScanApi()
        runBlocking { drainQueue(ScanSyncQueue(dao, replayApi)) }
        assertEquals(online.requests.single().second.clientRequestId, replayApi.requests.single().second.clientRequestId)
    }

    @Test
    fun `server rejection is kept as dead with the reason, not reported as queued`() {
        val api = FakeScanApi(http(409, "Campaign is not in progress", "CAMPAIGN_NOT_ACTIVE"))

        val outcome = recordBlindScan(api, scanTag().value)

        assertTrue(outcome is AuditScanRecorder.Outcome.Rejected)
        val row = dao.all.single()
        assertEquals(QueueState.DEAD, row.state)
        assertEquals("HTTP 409: Campaign is not in progress", row.lastError)
        assertEquals(0, syncTriggered)
    }

    @Test
    fun `signed-out scan stays pending for after sign-in`() {
        val outcome = recordBlindScan(FakeScanApi(http(401)), scanTag().value)
        assertEquals(AuditScanRecorder.Outcome.Queued, outcome)
        assertEquals(QueueState.PENDING, dao.all.single().state)
    }

    @Test
    fun `every scan gets its own key`() {
        val api = FakeScanApi()
        recordBlindScan(api, "TAG-1")
        recordBlindScan(api, "TAG-2")
        val keys = api.requests.map { it.second.clientRequestId }
        assertEquals(2, keys.toSet().size)
    }
}
