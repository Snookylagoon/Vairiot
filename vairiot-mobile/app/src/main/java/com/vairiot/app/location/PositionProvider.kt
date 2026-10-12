package com.vairiot.app.location

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.os.Looper
import androidx.core.content.ContextCompat
import androidx.core.location.LocationListenerCompat
import androidx.core.location.LocationManagerCompat
import androidx.core.location.LocationRequestCompat
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.withTimeoutOrNull
import javax.inject.Inject

interface PositionProvider {
    /** One GPS fix, or [PositionCaptureException]. */
    suspend fun currentFix(): GeoFix
}

fun hasLocationPermission(context: Context): Boolean =
    listOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION).any {
        ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED
    }

/**
 * Takes one fix with the platform [LocationManager] — no Google Play Services,
 * which the RFID handhelds may not ship. Listens to GPS and network providers
 * until a reading is accurate to [targetAccuracyMeters] or [timeoutMs] passes,
 * and returns the best reading seen.
 */
class DevicePositionProvider @Inject constructor(
    @ApplicationContext private val context: Context,
) : PositionProvider {

    private val targetAccuracyMeters = 15.0
    private val timeoutMs = 20_000L

    @SuppressLint("MissingPermission") // checked by hasLocationPermission
    override suspend fun currentFix(): GeoFix {
        if (!hasLocationPermission(context)) throw PositionCaptureException(PositionCaptureException.Reason.DENIED)

        val manager = context.getSystemService(LocationManager::class.java)
        val providers = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)
            .filter { manager.allProviders.contains(it) && manager.isProviderEnabled(it) }
        if (providers.isEmpty()) throw PositionCaptureException(PositionCaptureException.Reason.DISABLED)

        val selector = FixSelector(targetAccuracyMeters, notBeforeMs = System.currentTimeMillis() - 2_000)
        val request = LocationRequestCompat.Builder(0L)
            .setQuality(LocationRequestCompat.QUALITY_HIGH_ACCURACY)
            .build()

        val goodEnough = CompletableDeferred<Unit>()
        // Callbacks arrive on the main looper, the same thread as the selector's reader.
        val listener = object : LocationListenerCompat {
            override fun onLocationChanged(location: Location) {
                val accuracy = if (location.hasAccuracy()) location.accuracy.toDouble() else null
                if (selector.offer(location.latitude, location.longitude, accuracy, location.time)) {
                    goodEnough.complete(Unit)
                }
            }
        }
        providers.forEach {
            LocationManagerCompat.requestLocationUpdates(manager, it, request, listener, Looper.getMainLooper())
        }
        try {
            withTimeoutOrNull(timeoutMs) { goodEnough.await() }
        } finally {
            LocationManagerCompat.removeUpdates(manager, listener)
        }

        return selector.best ?: throw PositionCaptureException(PositionCaptureException.Reason.UNAVAILABLE)
    }
}
