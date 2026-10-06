package com.vairiot.app.sync

import com.vairiot.app.data.local.QueueState
import com.vairiot.app.data.local.QueuedScan
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The S0.2 attempt and state rules, run through the real scan queue adapter. */
class QueueDrainerTest {

    private val dao = FakeQueuedScanDao()

    private fun seed(n: Int) = runBlocking {
        repeat(n) { i -> dao.insert(QueuedScan(campaignId = "camp-1", tagValue = "TAG-$i")) }
    }

    private fun drain(api: FakeScanApi) = runBlocking { drainQueue(ScanSyncQueue(dao, api)) }

    @Test
    fun `accepted rows are removed and nothing else changes`() {
        seed(3)
        val report = drain(FakeScanApi())
        assertEquals(DrainOutcome.DONE, report.outcome)
        assertEquals(3, report.synced)
        assertTrue(dao.all.isEmpty())
    }

    @Test
    fun `network error marks the row failed, stops the drain, and burns no attempt`() {
        seed(3)
        val api = FakeScanApi(offline())
        val report = drain(api)

        assertEquals(DrainOutcome.RETRY, report.outcome)
        assertEquals("stops after the first network error", 1, api.requests.size)
        assertEquals(3, dao.all.size)
        val first = dao.get(1)
        assertEquals(QueueState.FAILED, first.state)
        assertEquals(0, first.attempts)
        assertEquals(QueueState.PENDING, dao.get(2).state)
    }

    @Test
    fun `timeout is treated like no network`() {
        seed(1)
        val report = drain(FakeScanApi(timeout()))
        assertEquals(DrainOutcome.RETRY, report.outcome)
        assertEquals(QueueState.FAILED, dao.get(1).state)
        assertEquals(0, dao.get(1).attempts)
    }

    @Test
    fun `5xx marks the row failed without an attempt and moves on to the next row`() {
        seed(2)
        val api = FakeScanApi(http(503, "Service unavailable"), Unit)
        val report = drain(api)

        assertEquals(DrainOutcome.RETRY, report.outcome)
        assertEquals(1, report.synced)
        assertEquals(QueueState.FAILED, dao.get(1).state)
        assertEquals(0, dao.get(1).attempts)
        assertEquals("HTTP 503: Service unavailable", dao.get(1).lastError)
        assertEquals(1, dao.all.size)
    }

    @Test
    fun `transient failures never turn into dead rows however often they repeat`() {
        seed(1)
        repeat(20) { drain(FakeScanApi(http(500))) }
        val row = dao.get(1)
        assertEquals(QueueState.FAILED, row.state)
        assertEquals(0, row.attempts)
    }

    @Test
    fun `4xx moves the row to dead with the server's message`() {
        seed(1)
        val report = drain(
            FakeScanApi(http(400, "Blind campaigns require a locationId with each scan", "VALIDATION_ERROR")),
        )
        assertEquals(DrainOutcome.DONE, report.outcome)
        assertEquals(1, report.dead)
        val row = dao.get(1)
        assertEquals(QueueState.DEAD, row.state)
        assertEquals("HTTP 400: Blind campaigns require a locationId with each scan", row.lastError)
    }

    @Test
    fun `403 and non-duplicate 409 are rejections, kept as dead`() {
        seed(2)
        drain(
            FakeScanApi(
                http(403, "Insufficient permissions"),
                http(409, "Campaign is not in progress", "CAMPAIGN_NOT_ACTIVE"),
            ),
        )
        assertEquals(listOf(QueueState.DEAD, QueueState.DEAD), dao.all.map { it.state })
    }

    @Test
    fun `409 duplicate counts as synced`() {
        seed(1)
        val report = drain(FakeScanApi(http(409, "Already recorded", "DUPLICATE_REQUEST")))
        assertEquals(1, report.synced)
        assertTrue(dao.all.isEmpty())
    }

    @Test
    fun `401 pauses without touching the row`() {
        seed(2)
        val api = FakeScanApi(http(401, "Invalid or expired token"))
        val report = drain(api)

        assertEquals(DrainOutcome.PAUSED_AUTH, report.outcome)
        assertEquals(1, api.requests.size)
        dao.all.forEach {
            assertEquals(QueueState.PENDING, it.state)
            assertEquals(0, it.attempts)
            assertNull(it.lastError)
        }
    }

    @Test
    fun `no failure of any kind deletes a row`() {
        val failures = listOf(offline(), timeout(), http(401), http(403), http(404), http(409), http(422), http(500))
        for (failure in failures) {
            val queue = FakeQueuedScanDao()
            runBlocking {
                queue.insert(QueuedScan(campaignId = "camp-1", tagValue = "TAG"))
                drainQueue(ScanSyncQueue(queue, FakeScanApi(failure)))
            }
            assertEquals("after $failure", 1, queue.all.size)
        }
    }

    @Test
    fun `dead rows are not retried until the user asks`() = runBlocking {
        seed(1)
        drain(FakeScanApi(http(400)))
        val api = FakeScanApi()
        drain(api)
        assertTrue("dead row must be skipped", api.requests.isEmpty())

        dao.retryDead(1)
        drain(api)
        assertEquals(1, api.requests.size)
        assertTrue(dao.all.isEmpty())
    }

    @Test
    fun `each row is tried once per run`() {
        seed(3)
        val api = FakeScanApi(http(500), http(500), http(500))
        drain(api)
        assertEquals(3, api.requests.size)
    }

    @Test
    fun `discard only removes dead rows`() = runBlocking {
        seed(2)
        drain(FakeScanApi(http(400), offline()))
        dao.discardDead(1)
        dao.discardDead(2) // FAILED, not DEAD: must survive
        assertEquals(listOf(2L), dao.all.map { it.id })
    }
}
