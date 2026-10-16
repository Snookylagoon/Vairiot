package com.vairiot.app.location

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Stage 1.5: scans attach a recent fix and never wait for GPS. */
class ScanPositionTrackerTest {

    private class ScriptedProvider(vararg results: Any) : PositionProvider {
        private val queue = results.toMutableList()
        override suspend fun currentFix(): GeoFix = when (val next = queue.removeAt(0)) {
            is GeoFix -> next
            is Exception -> throw next
            else -> error("unexpected $next")
        }
    }

    private var now = 1_000_000L
    private fun fixAt(ms: Long) = GeoFix.of(41.7151, 44.8271, 6.0, ms)

    @Test
    fun `no fix until GPS has answered`() {
        val tracker = ScanPositionTracker(ScriptedProvider(), clock = { now })
        assertNull(tracker.latest())
    }

    @Test
    fun `a recent fix is attached and an old one is not`() = runBlocking {
        val tracker = ScanPositionTracker(ScriptedProvider(fixAt(now)), clock = { now }, maxAgeMs = 60_000)
        tracker.refreshOnce()
        assertEquals(41.7151, tracker.latest()!!.latitude, 0.0)
        now += 60_001
        assertNull(tracker.latest())
    }

    @Test
    fun `a failed refresh keeps the last good fix`() = runBlocking {
        val provider = ScriptedProvider(
            fixAt(now),
            PositionCaptureException(PositionCaptureException.Reason.DENIED),
        )
        val tracker = ScanPositionTracker(provider, clock = { now })
        tracker.refreshOnce()
        tracker.refreshOnce()
        assertEquals(44.8271, tracker.latest()!!.longitude, 0.0)
    }
}
