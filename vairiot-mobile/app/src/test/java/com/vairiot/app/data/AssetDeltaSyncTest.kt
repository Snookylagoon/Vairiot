package com.vairiot.app.data

import com.vairiot.app.data.api.AssetListResponse
import com.vairiot.app.data.api.AssetResponse
import com.vairiot.app.data.local.CachedAsset
import com.vairiot.app.data.local.CachedAssetDao
import com.vairiot.app.util.formatSyncAge
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.io.IOException

class AssetDeltaSyncTest {

    // ─── Fakes ────────────────────────────────────────────────────────────

    private class FakeDao : CachedAssetDao {
        val rows = linkedMapOf<String, CachedAsset>()
        var replaceCalls = 0
        override fun searchFlow(query: String): Flow<List<CachedAsset>> = flowOf(rows.values.toList())
        override suspend fun findByTag(tag: String) = rows.values.firstOrNull { it.rfidTag == tag }
        override suspend fun findByIar(iar: String) = rows.values.firstOrNull { it.individualAssetReference == iar }
        override suspend fun findByGiai(giai: String) = rows.values.firstOrNull { it.giai == giai }
        override suspend fun upsertAll(assets: List<CachedAsset>) { assets.forEach { rows[it.id] = it } }
        override suspend fun deleteAll() { rows.clear() }
        override suspend fun deleteByIds(ids: List<String>) { ids.forEach { rows.remove(it) } }
        override suspend fun count() = rows.size
        override suspend fun replaceAll(assets: List<CachedAsset>) { replaceCalls++; super.replaceAll(assets) }
    }

    private class MemoryCursorStore(var cursor: AssetSyncCursor? = null) : AssetSyncCursorStore {
        var markedAt: Long? = null
        override suspend fun load() = cursor
        override suspend fun save(cursor: AssetSyncCursor) { this.cursor = cursor }
        override suspend fun markSynced(atMs: Long) { markedAt = atMs }
    }

    /** One recorded call to GET /assets. */
    private data class Call(val since: String?, val until: String?, val page: Int)

    private fun asset(id: String, name: String = id) = AssetResponse(
        id = id, assetNumber = "AST-$id", name = name, description = null, status = "active",
        condition = "good", serialNumber = null, barcode = null, rfidTag = null,
        category = null, site = null, location = null,
    )

    private fun cached(a: AssetResponse) = CachedAsset(
        id = a.id, assetNumber = a.assetNumber, name = a.name, description = null, status = a.status,
        condition = a.condition, serialNumber = null, barcode = null, rfidTag = null,
        categoryName = null, siteName = null, locationName = null,
    )

    private fun page(
        assets: List<AssetResponse>, page: Int = 1, totalPages: Int = 1,
        deletedIds: List<String>? = emptyList(), serverTime: String? = "2026-10-05T10:00:00Z",
    ) = AssetListResponse(assets, total = assets.size, page = page, pageSize = 200, totalPages = totalPages,
        deletedIds = deletedIds, serverTime = serverTime)

    private val dao = FakeDao()
    private val calls = mutableListOf<Call>()
    private var nowMs = 1_000_000_000_000L

    private fun sync(store: MemoryCursorStore, vararg responses: Any) = runBlocking {
        val script = ArrayDeque(responses.toList())
        AssetDeltaSync(
            dao = dao,
            cursorStore = store,
            fetchPage = { since, until, p ->
                calls += Call(since, until, p)
                when (val next = script.removeFirst()) {
                    is Exception -> throw next
                    else -> next as AssetListResponse
                }
            },
            toCached = ::cached,
            now = { nowMs },
        ).sync("tenant-1")
    }

    private fun cursor(fullAgoMs: Long = 60_000) = AssetSyncCursor(
        tenantId = "tenant-1", serverTime = "2026-10-05T09:00:00Z",
        lastSyncedAtMs = nowMs - 60_000, lastFullSyncAtMs = nowMs - fullAgoMs,
    )

    // ─── Tests ────────────────────────────────────────────────────────────

    @Test
    fun `first sync is a full sync from the epoch that replaces the cache`() {
        dao.rows["stale"] = cached(asset("stale"))
        val store = MemoryCursorStore()

        val count = sync(store, page(listOf(asset("a"), asset("b"))))

        assertEquals(AssetDeltaSync.EPOCH, calls.single().since)
        assertEquals(setOf("a", "b"), dao.rows.keys)
        assertEquals(2, count)
        assertEquals("2026-10-05T10:00:00Z", store.cursor?.serverTime)
        assertEquals(nowMs, store.cursor?.lastFullSyncAtMs)
    }

    @Test
    fun `later syncs fetch only changes since the cursor, with a 2-minute overlap`() {
        listOf("a", "b", "c").forEach { dao.rows[it] = cached(asset(it)) }
        val store = MemoryCursorStore(cursor())

        sync(store, page(listOf(asset("b", "B renamed")), deletedIds = listOf("c")))

        assertEquals("2026-10-05T08:58:00Z", calls.single().since)
        assertEquals(0, dao.replaceCalls)
        assertEquals(setOf("a", "b"), dao.rows.keys)
        assertEquals("B renamed", dao.rows["b"]?.name)
        assertEquals("delta keeps the last full-sync time", cursor().lastFullSyncAtMs, store.cursor?.lastFullSyncAtMs)
        assertEquals(nowMs, store.cursor?.lastSyncedAtMs)
    }

    @Test
    fun `later pages are pinned to page 1's serverTime`() {
        val store = MemoryCursorStore(cursor())
        sync(store, page(listOf(asset("a")), totalPages = 2), page(listOf(asset("b")), page = 2, totalPages = 2))
        assertNull(calls[0].until)
        assertEquals("2026-10-05T10:00:00Z", calls[1].until)
        assertEquals(setOf("a", "b"), dao.rows.keys)
    }

    @Test
    fun `a full sync runs again after 24 hours`() {
        val store = MemoryCursorStore(cursor(fullAgoMs = AssetDeltaSync.FULL_SYNC_EVERY_MS))
        sync(store, page(listOf(asset("a"))))
        assertEquals(AssetDeltaSync.EPOCH, calls.single().since)
        assertEquals(1, dao.replaceCalls)
    }

    @Test
    fun `a different tenant starts over with a full sync`() {
        dao.rows["other-tenant-asset"] = cached(asset("other-tenant-asset"))
        val store = MemoryCursorStore(cursor().copy(tenantId = "tenant-2"))
        sync(store, page(listOf(asset("a"))))
        assertEquals(AssetDeltaSync.EPOCH, calls.single().since)
        assertEquals(setOf("a"), dao.rows.keys)
    }

    @Test
    fun `a failure on any page leaves the cache and cursor untouched`() {
        dao.rows["a"] = cached(asset("a"))
        val before = cursor()
        val store = MemoryCursorStore(before)
        try {
            sync(store, page(listOf(asset("b")), totalPages = 2), IOException("offline"))
            fail("expected the IOException to propagate")
        } catch (_: IOException) {
        }
        assertEquals(setOf("a"), dao.rows.keys)
        assertEquals(before, store.cursor)
    }

    @Test
    fun `a server without delta support falls back to a plain full download`() {
        dao.rows["stale"] = cached(asset("stale"))
        val store = MemoryCursorStore(cursor())
        val count = sync(
            store,
            page(listOf(asset("a")), totalPages = 2, deletedIds = null, serverTime = null),
            page(listOf(asset("b")), page = 2, totalPages = 2, deletedIds = null, serverTime = null),
        )
        assertEquals(setOf("a", "b"), dao.rows.keys)
        assertEquals("page 2 is a plain list request", Call(null, null, 2), calls[1])
        assertEquals(2, count)
        assertEquals("no cursor from an old server", cursor().serverTime, store.cursor?.serverTime)
        assertEquals(nowMs, store.markedAt)
    }

    @Test
    fun `sync age wording`() {
        val now = 10_000_000L
        assertNull(formatSyncAge(null, now))
        assertEquals("Last synced just now", formatSyncAge(now - 20_000, now))
        assertEquals("Last synced 1 minute ago", formatSyncAge(now - 61_000, now))
        assertEquals("Last synced 12 minutes ago", formatSyncAge(now - 12 * 60_000, now))
        assertEquals("Last synced 1 hour ago", formatSyncAge(now - 90 * 60_000, now))
        assertEquals("Last synced 5 hours ago", formatSyncAge(now - 5 * 3_600_000, now))
        assertEquals("Last synced 3 days ago", formatSyncAge(now - 3 * 86_400_000L, now))
        assertTrue(formatSyncAge(now + 5_000, now)!!.contains("just now"))
    }
}
