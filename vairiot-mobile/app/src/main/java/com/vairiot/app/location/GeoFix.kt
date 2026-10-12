package com.vairiot.app.location

import java.time.Instant
import kotlin.math.roundToLong

/** A GPS fix for an asset, in WGS 84 decimal degrees. */
data class GeoFix(
    val latitude: Double,
    val longitude: Double,
    /** Horizontal accuracy radius in metres (68% confidence). */
    val accuracyMeters: Double,
    val capturedAtMs: Long,
) {
    val capturedAtIso: String get() = Instant.ofEpochMilli(capturedAtMs).toString()

    companion object {
        /** Rounds to the precision the server stores: 6 dp ≈ 0.1 m, accuracy to 0.1 m. */
        fun of(latitude: Double, longitude: Double, accuracyMeters: Double, capturedAtMs: Long) = GeoFix(
            latitude = (latitude * 1_000_000).roundToLong() / 1_000_000.0,
            longitude = (longitude * 1_000_000).roundToLong() / 1_000_000.0,
            accuracyMeters = (accuracyMeters * 10).roundToLong() / 10.0,
            capturedAtMs = capturedAtMs,
        )
    }
}

class PositionCaptureException(val reason: Reason) : Exception(reason.message) {
    enum class Reason(val message: String) {
        DENIED("Location permission is off for Vairiot. Allow it in Settings › Apps › Vairiot › Permissions."),
        DISABLED("Location is turned off on this device. Turn it on in Settings › Location."),
        UNAVAILABLE("Couldn't get a GPS fix. Move nearer a window or outdoors and try again."),
    }
}

/**
 * Keeps the most accurate reading taken since a capture started. Pure, so the
 * selection rules are unit-testable without a device.
 */
class FixSelector(
    private val targetAccuracyMeters: Double,
    /** Readings older than this are cached fixes from before the capture. */
    private val notBeforeMs: Long,
) {
    var best: GeoFix? = null
        private set

    /** Offers a reading; true once the best one is accurate enough to stop. */
    fun offer(latitude: Double, longitude: Double, accuracyMeters: Double?, timeMs: Long): Boolean {
        if (accuracyMeters != null && accuracyMeters >= 0 && timeMs >= notBeforeMs) {
            val current = best
            if (current == null || accuracyMeters < current.accuracyMeters) {
                best = GeoFix.of(latitude, longitude, accuracyMeters, timeMs)
            }
        }
        return best?.let { it.accuracyMeters <= targetAccuracyMeters } ?: false
    }
}
