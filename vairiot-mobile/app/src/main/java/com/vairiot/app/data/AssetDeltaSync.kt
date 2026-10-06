package com.vairiot.app.data

import com.vairiot.app.data.api.AssetListResponse
import com.vairiot.app.data.local.CachedAssetDao
import java.time.Instant

/** Where the asset cache stands against the server. Persisted per device. */
data class AssetSyncCursor(
    /** Tenant the cache was filled for. A different tenant means start over. */
    val tenantId: String,
    /** Page 1's `serverTime` from the last completed sync (ISO-8601). */
    val serverTime: String,
    /** Device time of the last completed sync, for "Last synced X ago". */
    val lastSyncedAtMs: Long,
    /** Device time of the last full (non-delta) sync. */
    val lastFullSyncAtMs: Long,
)

interface AssetSyncCursorStore {
    suspend fun load(): AssetSyncCursor?
    suspend fun save(cursor: AssetSyncCursor)
    /** A sync completed without a cursor (older server): only the time is known. */
    suspend fun markSynced(atMs: Long)
}

/**
 * Keeps the local asset cache in step with the server using
 * `GET /assets?changedSince=` instead of re-downloading the register.
 *
 * - First sync, a tenant switch, or 24h since the last full sync: a full sync
 *   (changedSince = epoch). The delta can't see edits that don't touch the
 *   asset row itself, such as a renamed category, so a daily full sync keeps
 *   those from going stale.
 * - Otherwise: a delta from the last `serverTime` minus a 2-minute overlap
 *   (rows written by transactions still in flight at that instant), upserting
 *   changes and removing `deletedIds`.
 *
 * All pages are fetched before the cache is touched, and the cursor is saved
 * last, so a dropped connection leaves the previous cache and cursor intact.
 */
class AssetDeltaSync(
    private val dao: CachedAssetDao,
    private val cursorStore: AssetSyncCursorStore,
    private val fetchPage: suspend (changedSince: String?, changedUntil: String?, page: Int) -> AssetListResponse,
    private val toCached: (com.vairiot.app.data.api.AssetResponse) -> com.vairiot.app.data.local.CachedAsset,
    private val now: () -> Long = System::currentTimeMillis,
) {
    /** Runs a sync for [tenantId]. Returns the number of cached assets; throws on failure. */
    suspend fun sync(tenantId: String): Int {
        val cursor = cursorStore.load()?.takeIf { it.tenantId == tenantId }
        val full = cursor == null || now() - cursor.lastFullSyncAtMs >= FULL_SYNC_EVERY_MS
        val since = if (full) EPOCH else Instant.parse(cursor!!.serverTime).minusMillis(OVERLAP_MS).toString()

        val first = fetchPage(since, null, 1)
        val serverTime = first.serverTime
            ?: return legacyFullSync(first) // server without delta support

        val changed = first.assets.toMutableList()
        for (page in 2..first.totalPages) {
            changed += fetchPage(since, serverTime, page).assets
        }

        if (full) {
            // Every live asset changed after the epoch: this *is* the register.
            dao.replaceAll(changed.map(toCached))
        } else {
            dao.upsertAll(changed.map(toCached))
            first.deletedIds?.takeIf { it.isNotEmpty() }?.let { dao.deleteByIds(it) }
        }

        val at = now()
        cursorStore.save(
            AssetSyncCursor(
                tenantId = tenantId,
                serverTime = serverTime,
                lastSyncedAtMs = at,
                lastFullSyncAtMs = if (full) at else cursor!!.lastFullSyncAtMs,
            ),
        )
        return dao.count()
    }

    /** The server ignored changedSince and sent a plain list: download it all. */
    private suspend fun legacyFullSync(first: AssetListResponse): Int {
        val all = first.assets.toMutableList()
        for (page in 2..first.totalPages) {
            all += fetchPage(null, null, page).assets
        }
        dao.replaceAll(all.map(toCached))
        cursorStore.markSynced(now())
        return dao.count()
    }

    companion object {
        const val EPOCH = "1970-01-01T00:00:00Z"
        const val OVERLAP_MS = 2 * 60 * 1000L
        const val FULL_SYNC_EVERY_MS = 24 * 60 * 60 * 1000L
    }
}
