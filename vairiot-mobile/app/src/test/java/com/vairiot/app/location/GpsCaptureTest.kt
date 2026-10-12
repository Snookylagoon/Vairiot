package com.vairiot.app.location

import com.google.gson.Gson
import com.google.gson.JsonObject
import com.vairiot.app.data.api.AssetCreateRequest
import com.vairiot.app.data.api.AssetResponse
import com.vairiot.app.data.api.AssetUpdateRequest
import com.vairiot.app.data.local.QueuedAsset
import com.vairiot.app.sync.toRequest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class GpsCaptureTest {

    private val at = 1_791_795_600_000L // 2026-10-12T09:00:00Z
    private val fix = GeoFix.of(41.71512345, 44.82712345, 6.04, at)

    private fun json(request: AssetUpdateRequest): JsonObject =
        Gson().fromJson(Gson().toJson(request), JsonObject::class.java)

    private fun asset(lat: Double? = null, lng: Double? = null) = AssetResponse(
        id = "a1", assetNumber = "AST-000001", name = "Pump", description = null, status = "active",
        condition = "good", serialNumber = null, barcode = null, rfidTag = null,
        category = null, site = null, location = null,
        latitude = lat, longitude = lng, geoAccuracyMeters = lat?.let { 4.0 }, geoSource = "manual",
    )

    // ── GeoFix / FixSelector ────────────────────────────────────────────────

    @Test fun `fix is rounded to server precision`() {
        assertEquals(41.715123, fix.latitude, 0.0)
        assertEquals(44.827123, fix.longitude, 0.0)
        assertEquals(6.0, fix.accuracyMeters, 0.0)
        assertEquals("2026-10-12T09:00:00Z", fix.capturedAtIso)
    }

    @Test fun `selector keeps the most accurate fresh reading and stops at the target`() {
        val selector = FixSelector(targetAccuracyMeters = 15.0, notBeforeMs = at)
        assertFalse(selector.offer(1.0, 1.0, 5.0, at - 60_000)) // cached, before capture
        assertNull(selector.best)
        assertFalse(selector.offer(1.0, 1.0, null, at))         // no accuracy
        assertFalse(selector.offer(2.0, 2.0, 80.0, at + 1_000)) // network-grade
        assertFalse(selector.offer(3.0, 3.0, 120.0, at + 2_000)) // worse, ignored
        assertEquals(2.0, selector.best!!.latitude, 0.0)
        assertTrue(selector.offer(4.0, 4.0, 9.0, at + 3_000))
        assertEquals(4.0, selector.best!!.latitude, 0.0)
    }

    // ── Requests ────────────────────────────────────────────────────────────

    @Test fun `create carries a captured fix as a device position`() {
        val request = GpsCaptureState().captured(fix).applyTo(AssetCreateRequest(name = "Pump"))
        assertEquals(41.715123, request.latitude!!, 0.0)
        assertEquals(6.0, request.geoAccuracyMeters!!, 0.0)
        assertEquals("device", request.geoSource)
        assertEquals("2026-10-12T09:00:00Z", request.geoCapturedAt)
        assertNull(GpsCaptureState().applyTo(AssetCreateRequest(name = "Pump")).latitude)
    }

    @Test fun `edit does not resend the server's position`() {
        val gps = GpsCaptureState(position = AssetPosition.of(asset(41.7, 44.8)))
        val body = json(gps.applyTo(AssetUpdateRequest(name = "Pump")))
        assertEquals("Pump", body["name"].asString)
        assertFalse(body.has("latitude"))
        assertFalse(body.has("clearGeoPosition"))
    }

    @Test fun `edit sends a recaptured position`() {
        val body = json(GpsCaptureState().captured(fix).applyTo(AssetUpdateRequest(name = "Pump")))
        assertEquals(41.715123, body["latitude"].asDouble, 0.0)
        assertEquals(44.827123, body["longitude"].asDouble, 0.0)
        assertEquals("device", body["geoSource"].asString)
    }

    @Test fun `removing a position sends explicit nulls and nothing else that is unset`() {
        val gps = GpsCaptureState(position = AssetPosition.of(asset(41.7, 44.8))).removed()
        val body = json(gps.applyTo(AssetUpdateRequest(rfidTag = "E200")))
        assertTrue(body["latitude"].isJsonNull)
        assertTrue(body["longitude"].isJsonNull)
        assertEquals(setOf("rfidTag", "latitude", "longitude"), body.keySet())
    }

    @Test fun `denied permission keeps the position and flags settings`() {
        val gps = GpsCaptureState(position = AssetPosition.of(asset(41.7, 44.8))).capturing()
            .failed(PositionCaptureException(PositionCaptureException.Reason.DENIED))
        assertTrue(gps.accessDenied)
        assertFalse(gps.isCapturing)
        assertFalse(gps.changed)
        assertEquals(41.7, gps.position!!.latitude, 0.0)
    }

    // ── Offline queue and display ───────────────────────────────────────────

    @Test fun `queued create replays its fix`() {
        val queued = QueuedAsset(
            name = "Pump", latitude = fix.latitude, longitude = fix.longitude,
            geoAccuracyMeters = fix.accuracyMeters, geoCapturedAtMs = at,
        ).toRequest()
        assertEquals(41.715123, queued.latitude!!, 0.0)
        assertEquals("device", queued.geoSource)
        assertEquals("2026-10-12T09:00:00Z", queued.geoCapturedAt)

        val plain = QueuedAsset(name = "Chair").toRequest()
        assertNull(plain.latitude)
        assertNull(plain.geoSource)
    }

    @Test fun `position formats for display and maps`() {
        val p = AssetPosition.of(asset(41.7, 44.8))!!
        assertEquals("41.700000, 44.800000", p.coordinateText)
        assertEquals("±4 m · Entered manually", p.detailText)
        assertEquals("geo:41.7,44.8?q=41.7,44.8(Pump 3)", p.geoUri("Pump (3)"))
        assertNull(AssetPosition.of(asset()))
    }
}
