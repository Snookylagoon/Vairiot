package com.vairiot.app.data.local

import android.content.Context
import android.os.Build
import android.provider.Settings
import com.vairiot.app.data.api.DeviceCheckIn
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Stable per-device identity used to register the handset against a licence
 * on every login. ANDROID_ID survives app reinstalls but resets on factory
 * reset, which matches what we want for "fix a device to a licence".
 */
@Singleton
class DeviceInfoProvider @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    fun fingerprint(): String {
        val id = Settings.Secure.getString(
            context.contentResolver,
            Settings.Secure.ANDROID_ID,
        )
        return id ?: "unknown-${Build.SERIAL}"
    }

    fun deviceName(): String = "${Build.MANUFACTURER} ${Build.MODEL}".trim()

    fun checkIn(): DeviceCheckIn = DeviceCheckIn(
        fingerprint = fingerprint(),
        deviceName  = deviceName(),
        deviceType  = "mobile",
    )
}
