package com.vairiot.app.location

import com.vairiot.app.data.api.AssetCreateRequest
import com.vairiot.app.data.api.AssetUpdateRequest

/** GPS position section of a form: what's shown, and whether the user changed it. */
data class GpsCaptureState(
    val position: AssetPosition? = null,
    /** The fix taken in this form. Null when the position came from the server, or was removed. */
    val fix: GeoFix? = null,
    /** True once the user captured or removed a position; only then is it sent. */
    val changed: Boolean = false,
    val isCapturing: Boolean = false,
    val error: String? = null,
    val accessDenied: Boolean = false,
) {
    fun capturing() = copy(isCapturing = true, error = null, accessDenied = false)

    fun captured(fix: GeoFix) =
        copy(position = AssetPosition.of(fix), fix = fix, changed = true, isCapturing = false)

    fun failed(error: Throwable) = copy(
        isCapturing = false,
        error = error.message ?: "Couldn't get a GPS fix",
        accessDenied = (error as? PositionCaptureException)?.reason == PositionCaptureException.Reason.DENIED,
    )

    fun removed() = copy(position = null, fix = null, changed = true, error = null, accessDenied = false)

    /** Adds the fix (if any) to a create. */
    fun applyTo(request: AssetCreateRequest): AssetCreateRequest = fix?.let {
        request.copy(
            latitude = it.latitude, longitude = it.longitude, geoAccuracyMeters = it.accuracyMeters,
            geoSource = "device", geoCapturedAt = it.capturedAtIso,
        )
    } ?: request

    /** Adds a captured or removed position to an edit; an untouched one isn't sent. */
    fun applyTo(request: AssetUpdateRequest): AssetUpdateRequest = when {
        !changed -> request
        fix != null -> request.copy(
            latitude = fix.latitude, longitude = fix.longitude, geoAccuracyMeters = fix.accuracyMeters,
            geoSource = "device", geoCapturedAt = fix.capturedAtIso,
        )
        else -> request.copy(clearGeoPosition = true)
    }
}
