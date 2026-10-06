package com.vairiot.app.sync

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SyncFailureTest {

    private fun kindOf(e: Exception) = classifySyncFailure(e).kind

    @Test
    fun `no connectivity and timeouts are network errors`() {
        assertEquals(SyncFailureKind.NETWORK, kindOf(offline()))
        assertEquals(SyncFailureKind.NETWORK, kindOf(timeout()))
    }

    @Test
    fun `server errors and throttling are transient`() {
        for (status in listOf(500, 502, 503, 504, 408, 429)) {
            assertEquals("HTTP $status", SyncFailureKind.TRANSIENT, kindOf(http(status)))
        }
    }

    @Test
    fun `401 pauses for sign-in`() {
        assertEquals(SyncFailureKind.AUTH, kindOf(http(401, "Invalid or expired token")))
    }

    @Test
    fun `other 4xx are permanent rejections, including 403`() {
        for (status in listOf(400, 403, 404, 413, 415, 422)) {
            assertEquals("HTTP $status", SyncFailureKind.PERMANENT, kindOf(http(status)))
        }
    }

    @Test
    fun `409 is only success when it says the record already exists`() {
        assertEquals(
            SyncFailureKind.DUPLICATE,
            kindOf(http(409, "Already recorded", code = "DUPLICATE_REQUEST")),
        )
        // The server's real 409s on these routes are rejections. Treating them as
        // success would delete a scan the server never stored.
        assertEquals(
            SyncFailureKind.PERMANENT,
            kindOf(http(409, "Campaign is not in progress", code = "CAMPAIGN_NOT_ACTIVE")),
        )
        assertEquals(
            SyncFailureKind.PERMANENT,
            kindOf(http(409, "This zone has already been submitted and is locked", code = "ZONE_LOCKED")),
        )
    }

    @Test
    fun `the server's message is kept for the user`() {
        val failure = classifySyncFailure(
            http(400, "Blind campaigns require a locationId with each scan", code = "VALIDATION_ERROR"),
        )
        assertEquals("HTTP 400: Blind campaigns require a locationId with each scan", failure.message)
    }

    @Test
    fun `a non-JSON error body is still reported`() {
        val e = retrofit2.HttpException(
            retrofit2.Response.error<Any>(
                502,
                okhttp3.ResponseBody.Companion.run { "<html>Bad Gateway</html>".toResponseBody(null) },
            ),
        )
        val failure = classifySyncFailure(e)
        assertEquals(SyncFailureKind.TRANSIENT, failure.kind)
        assertTrue(failure.message, failure.message.startsWith("HTTP 502"))
    }

    @Test
    fun `a row that can never be sent is permanent`() {
        assertEquals(SyncFailureKind.PERMANENT, kindOf(UnsendableException("Photo file is missing")))
    }

    @Test
    fun `unexpected client errors are retried, not dropped`() {
        assertEquals(SyncFailureKind.TRANSIENT, kindOf(IllegalStateException("Malformed JSON")))
    }
}
