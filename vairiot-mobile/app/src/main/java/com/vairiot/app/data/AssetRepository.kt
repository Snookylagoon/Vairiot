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
     * Pull a fresh page from the API and replace the local cache. Returns the
     * total reported by the server, or null if the call failed (cache stays
     * intact).
     */
    suspend fun refresh(query: String? = null): Int? {
        return try {
            val resp = api.listAssets(search = query?.takeIf { it.isNotBlank() }, page = 1, pageSize = 200)
            // Only replace the cache on a "full" sync (no search), so a typed
            // query doesn't blow away previously-cached rows the user might
            // need offline.
            if (query.isNullOrBlank()) {
                dao.replaceAll(resp.assets.map { it.toCached() })
            } else {
                dao.upsertAll(resp.assets.map { it.toCached() })
            }
            resp.total
        } catch (e: Exception) {
            null
        }
    }
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
