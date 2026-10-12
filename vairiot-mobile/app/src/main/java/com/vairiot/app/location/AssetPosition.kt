package com.vairiot.app.location

import com.vairiot.app.data.api.AssetResponse
import java.util.Locale
import kotlin.math.roundToInt

/**
 * An asset's GIS position as shown in the app: a fresh device fix, or the
 * position the server already holds.
 */
data class AssetPosition(
    val latitude: Double,
    val longitude: Double,
    val accuracyMeters: Double? = null,
    val source: String? = null,
) {
    /** "41.715100, 44.827100" */
    val coordinateText: String get() = String.format(Locale.US, "%.6f, %.6f", latitude, longitude)

    /** "±6 m · Device GPS" */
    val detailText: String?
        get() = listOfNotNull(
            accuracyMeters?.let { "±${it.roundToInt()} m" },
            source?.let(::sourceLabel),
        ).joinToString(" · ").ifEmpty { null }

    /** `geo:` URI with a labelled pin, for whichever maps app is installed. */
    fun geoUri(label: String): String =
        "geo:$latitude,$longitude?q=$latitude,$longitude(${label.replace(Regex("[()]"), "")})"

    /** Browser fallback for devices with no maps app. */
    val webUrl: String get() = "https://www.openstreetmap.org/?mlat=$latitude&mlon=$longitude#map=18/$latitude/$longitude"

    companion object {
        fun of(asset: AssetResponse): AssetPosition? {
            val lat = asset.latitude ?: return null
            val lng = asset.longitude ?: return null
            return AssetPosition(lat, lng, asset.geoAccuracyMeters, asset.geoSource)
        }

        fun of(fix: GeoFix) = AssetPosition(fix.latitude, fix.longitude, fix.accuracyMeters, "device")

        fun sourceLabel(source: String): String = when (source) {
            "device" -> "Device GPS"
            "manual" -> "Entered manually"
            "import" -> "Imported"
            else -> source
        }
    }
}
