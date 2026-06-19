package com.vairiot.app.data.local

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "vairiot_tokens")

@Singleton
class TokenStore @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private val ACCESS_TOKEN   = stringPreferencesKey("access_token")
    private val REFRESH_TOKEN  = stringPreferencesKey("refresh_token")
    private val TENANT_ID      = stringPreferencesKey("tenant_id")
    private val LICENCE_NUMBER = stringPreferencesKey("licence_number")
    private val LICENCE_TIER   = stringPreferencesKey("licence_tier")
    private val LICENCE_STATUS = stringPreferencesKey("licence_status")
    private val LICENCE_START  = stringPreferencesKey("licence_start")

    suspend fun saveTokens(accessToken: String, refreshToken: String, tenantId: String) {
        context.dataStore.edit { prefs ->
            prefs[ACCESS_TOKEN]  = accessToken
            prefs[REFRESH_TOKEN] = refreshToken
            prefs[TENANT_ID]     = tenantId
        }
    }

    suspend fun getAccessToken(): String? =
        context.dataStore.data.map { it[ACCESS_TOKEN] }.first()

    suspend fun getRefreshToken(): String? =
        context.dataStore.data.map { it[REFRESH_TOKEN] }.first()

    suspend fun getTenantId(): String? =
        context.dataStore.data.map { it[TENANT_ID] }.first()

    suspend fun updateAccessToken(accessToken: String) {
        context.dataStore.edit { prefs -> prefs[ACCESS_TOKEN] = accessToken }
    }

    suspend fun saveLicence(number: String, tierDisplayName: String, status: String, startDate: String?) {
        context.dataStore.edit { prefs ->
            prefs[LICENCE_NUMBER] = number
            prefs[LICENCE_TIER]   = tierDisplayName
            prefs[LICENCE_STATUS] = status
            if (startDate != null) prefs[LICENCE_START] = startDate else prefs.remove(LICENCE_START)
        }
    }

    data class CachedLicence(val number: String?, val tier: String?, val status: String?, val startDate: String?)

    suspend fun getCachedLicence(): CachedLicence {
        val prefs = context.dataStore.data.first()
        return CachedLicence(prefs[LICENCE_NUMBER], prefs[LICENCE_TIER], prefs[LICENCE_STATUS], prefs[LICENCE_START])
    }

    suspend fun clear() {
        context.dataStore.edit { it.clear() }
    }
}
