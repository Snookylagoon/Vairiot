package com.vairiot.app.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.vairiot.app.data.api.VairiotApiService
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

private val Context.featureFlagStore: DataStore<Preferences> by preferencesDataStore(name = "vairiot_feature_flags")

/**
 * The tenant's module switches (Tenant.featureFlags, decision D7), cached so a
 * screen opened offline still knows whether to show e.g. GIS capture. Off until
 * the server has said otherwise at least once.
 */
@Singleton
class FeatureFlags @Inject constructor(
    @ApplicationContext private val context: Context,
    private val api: VairiotApiService,
) {
    private val ENABLED = stringSetPreferencesKey("enabled")

    fun isEnabled(flag: String): Flow<Boolean> =
        context.featureFlagStore.data.map { flag in (it[ENABLED] ?: emptySet()) }

    /** Fetches the flags from the server; keeps the cached copy when offline. */
    suspend fun refresh() {
        val flags = try { api.getMe().featureFlags } catch (_: Exception) { return } ?: emptyMap()
        context.featureFlagStore.edit { it[ENABLED] = flags.filterValues { on -> on }.keys }
    }

    companion object {
        const val GIS = "gis"
    }
}
