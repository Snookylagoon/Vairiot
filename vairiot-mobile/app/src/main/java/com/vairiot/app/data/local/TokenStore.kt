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
    private val ACCESS_TOKEN  = stringPreferencesKey("access_token")
    private val REFRESH_TOKEN = stringPreferencesKey("refresh_token")
    private val TENANT_ID     = stringPreferencesKey("tenant_id")

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

    suspend fun clear() {
        context.dataStore.edit { it.clear() }
    }
}
