package com.vairiot.app.scanner

import com.vairiot.app.data.local.SessionTagEntity
import com.vairiot.app.domain.model.SessionTagStatus
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RfidSessionClassifierTest {

    private val classifier = RfidSessionClassifier(minReadCount = 3, minVisibleMs = 500)

    private fun tag(
        readCount: Int,
        firstSeenMs: Long = 0L,
        lastSeenMs: Long = firstSeenMs,
        status: SessionTagStatus = SessionTagStatus.PENDING,
        epc: String = "EPC-1",
    ) = SessionTagEntity(
        sessionId    = "s1",
        epc          = epc,
        readCount    = readCount,
        firstSeenMs  = firstSeenMs,
        lastSeenMs   = lastSeenMs,
        status       = status.name,
    )

    // ─── Confidence gate ────────────────────────────────────────────────────

    @Test fun `two reads within 500ms is not confident`() {
        val t = tag(readCount = 2, firstSeenMs = 0, lastSeenMs = 400)
        assertFalse(classifier.isConfident(t))
    }

    @Test fun `three reads is confident regardless of duration`() {
        val t = tag(readCount = 3, firstSeenMs = 0, lastSeenMs = 100)
        assertTrue(classifier.isConfident(t))
    }

    @Test fun `visible for 500ms is confident even with two reads`() {
        val t = tag(readCount = 2, firstSeenMs = 0, lastSeenMs = 500)
        assertTrue(classifier.isConfident(t))
    }

    @Test fun `single read at t=0 and one at t=600ms crosses time threshold`() {
        val t = tag(readCount = 2, firstSeenMs = 0, lastSeenMs = 600)
        assertTrue(classifier.isConfident(t))
    }

    // ─── Classification ─────────────────────────────────────────────────────

    @Test fun `pending tag stays PENDING`() {
        val t = tag(readCount = 1, firstSeenMs = 0, lastSeenMs = 100)
        assertEquals(SessionTagStatus.PENDING, classifier.classify(t, expectedEpcs = emptySet()))
    }

    @Test fun `confident EPC in expected set becomes KNOWN`() {
        val t = tag(readCount = 3, epc = "AAA")
        assertEquals(SessionTagStatus.KNOWN, classifier.classify(t, expectedEpcs = setOf("AAA", "BBB")))
    }

    @Test fun `confident EPC not in expected set becomes NEW`() {
        val t = tag(readCount = 3, epc = "ZZZ")
        assertEquals(SessionTagStatus.NEW, classifier.classify(t, expectedEpcs = setOf("AAA")))
    }

    @Test fun `ignored is sticky and wins over known`() {
        val t = tag(readCount = 3, epc = "AAA", status = SessionTagStatus.IGNORED)
        assertEquals(SessionTagStatus.IGNORED, classifier.classify(t, expectedEpcs = setOf("AAA")))
    }

    @Test fun `unknown status name defaults to PENDING classification input`() {
        val t = tag(readCount = 3, epc = "AAA").copy(status = "BOGUS")
        assertEquals(SessionTagStatus.KNOWN, classifier.classify(t, expectedEpcs = setOf("AAA")))
    }
}
