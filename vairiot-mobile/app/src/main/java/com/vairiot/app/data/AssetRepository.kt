package com.vairiot.app.data

import com.vairiot.app.data.api.AssetResponse
import com.vairiot.app.data.api.CategoryRefResponse
import com.vairiot.app.data.api.LocationRefResponse
import com.vairiot.app.data.api.SiteRefResponse
import com.vairiot.app.data.api.VairiotApiService
import com.vairiot.app.data.local.CachedAsset
import com.vairiot.app.data.local.CachedAssetDao
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AssetRepository @Inject constructor(
    private val api: VairiotApiService,
    private val dao: CachedAssetDao,
) {
    /** Local-first stream. Caller filters by [query] (may be blank). */
    fun observeAssets(query: String): Flow<List<AssetResponse>> =
        dao.searchFlow(query.trim())
            .map { rows -> rows.map { it.toApiResponse() } }

    /**
     * Pull every page from the API and replace the local cache. Returns the
     * total reported by the server, or null if any page failed (cache stays
     * intact — a partial sync would leave the user staring at half a register).
     */
    suspend fun refresh(
        query: String? = null,
        status: String? = null,
        condition: String? = null,
        sortBy: String? = null,
        sortOrder: String? = null,
    ): Int? {
        val search = query?.takeIf { it.isNotBlank() }
        val statusParam = status?.takeIf { it.isNotBlank() }
        val conditionParam = condition?.takeIf { it.isNotBlank() }
        return try {
            val firstPage = api.listAssets(
                search = search, status = statusParam, condition = conditionParam,
                sortBy = sortBy, sortOrder = sortOrder, page = 1, pageSize = PAGE_SIZE,
            )
            val fullSync = search == null && statusParam == null && conditionParam == null
            if (fullSync) {
                dao.replaceAll(firstPage.assets.map { it.toCached() })
            } else {
                dao.upsertAll(firstPage.assets.map { it.toCached() })
            }
            var page = 2
            while (page <= firstPage.totalPages) {
                val next = api.listAssets(
                    search = search, status = statusParam, condition = conditionParam,
                    sortBy = sortBy, sortOrder = sortOrder, page = page, pageSize = PAGE_SIZE,
                )
                dao.upsertAll(next.assets.map { it.toCached() })
                page++
            }
            firstPage.total
        } catch (e: Exception) {
            null
        }
    }

    /**
     * Look up a single asset by scanned tag/barcode/asset-number.
     * Tries the server first; on failure (offline/unreachable) falls back to
     * the local cache. [TagLookup.fromCache] tells the UI which source answered.
     */
    suspend fun lookupByTag(tag: String): TagLookup {
        return try {
            val asset = api.getAssetByTag(tag)
            // Keep the cache warm with whatever we just fetched.
            dao.upsertAll(listOf(asset.toCached()))
            TagLookup.Found(asset, fromCache = false)
        } catch (e: Exception) {
            val cached = dao.findByTag(tag)
            if (cached != null) {
                TagLookup.Found(cached.toApiResponse(), fromCache = true)
            } else {
                TagLookup.NotFound
            }
        }
    }

    private companion object { const val PAGE_SIZE = 200 }
}

sealed class TagLookup {
    data class Found(val asset: AssetResponse, val fromCache: Boolean) : TagLookup()
    object NotFound : TagLookup()
}

private fun CachedAsset.toApiResponse(): AssetResponse = AssetResponse(
    id           = id,
    assetNumber  = assetNumber,
    name         = name,
    description  = description,
    status       = status,
    condition    = condition,
    serialNumber = serialNumber,
    barcode      = barcode,
    rfidTag      = rfidTag,
    category     = categoryName?.let { CategoryRefResponse(id = "", name = it) },
    site         = siteName?.let { SiteRefResponse(id = "", name = it) },
    location     = locationName?.let { LocationRefResponse(id = "", name = it) },
)

private fun AssetResponse.toCached(): CachedAsset = CachedAsset(
    id           = id,
    assetNumber  = assetNumber,
    name         = name,
    description  = description,
    status       = status,
    condition    = condition,
    serialNumber = serialNumber,
    barcode      = barcode,
    rfidTag      = rfidTag,
    categoryName = category?.name,
    siteName     = site?.name,
    locationName = location?.name,
)
