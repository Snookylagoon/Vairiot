package com.vairiot.app.data.local

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.vairiot.app.data.AssetSyncCursor
import com.vairiot.app.data.AssetSyncCursorStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

private val Context.syncStateStore: DataStore<Preferences> by preferencesDataStore(name = "vairiot_asset_sync")

/** Persists the asset-cache sync cursor (see [com.vairiot.app.data.AssetDeltaSync]). */
@Singleton
class AssetSyncStateStore @Inject constructor(
    @ApplicationContext private val context: Context,
) : AssetSyncCursorStore {
    private val TENANT     = stringPreferencesKey("tenant_id")
    private val SERVER     = stringPreferencesKey("server_time")
    private val SYNCED_AT  = longPreferencesKey("last_synced_at")
    private val FULL_AT    = longPreferencesKey("last_full_sync_at")

    /** Device time of the last completed asset sync, for "Last synced X ago". */
    val lastSyncedAtMs: Flow<Long?> = context.syncStateStore.data.map { it[SYNCED_AT] }

    override suspend fun load(): AssetSyncCursor? {
        val p = context.syncStateStore.data.first()
        return AssetSyncCursor(
            tenantId = p[TENANT] ?: return null,
            serverTime = p[SERVER] ?: return null,
            lastSyncedAtMs = p[SYNCED_AT] ?: return null,
            lastFullSyncAtMs = p[FULL_AT] ?: return null,
        )
    }

    override suspend fun save(cursor: AssetSyncCursor) {
        context.syncStateStore.edit {
            it[TENANT] = cursor.tenantId
            it[SERVER] = cursor.serverTime
            it[SYNCED_AT] = cursor.lastSyncedAtMs
            it[FULL_AT] = cursor.lastFullSyncAtMs
        }
    }

    override suspend fun markSynced(atMs: Long) {
        context.syncStateStore.edit { it[SYNCED_AT] = atMs }
    }
}
