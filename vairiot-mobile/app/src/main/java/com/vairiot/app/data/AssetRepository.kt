package com.vairiot.app.data

import com.vairiot.app.data.api.AssetResponse
import com.vairiot.app.data.api.CategoryRefResponse
import com.vairiot.app.data.api.LocationRefResponse
import com.vairiot.app.data.api.SiteRefResponse
import com.vairiot.app.data.api.VairiotApiService
import com.vairiot.app.data.local.CachedAsset
import com.vairiot.app.data.local.CachedAssetDao
import com.vairiot.app.util.Gs1
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import retrofit2.HttpException
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
            val cached = findCachedByTag(tag)
            if (cached != null) {
                TagLookup.Found(cached.toApiResponse(), fromCache = true)
            } else {
                TagLookup.NotFound
            }
        }
    }

    /**
     * Resolve a hardware RFID read. GS1-commissioned tags (GIAI-96 / TID96)
     * resolve via the server's EPC endpoint, which also classifies tags that
     * belong to another tenant's ACTIVE prefix (FOREIGN_TAG, spec §6.6).
     * A 404 falls back to the legacy rfidTag match; offline falls back to a
     * local GIAI-96 decode against the cached GS1 columns.
     */
    suspend fun lookupByEpc(epcHex: String): EpcLookup {
        val epc = epcHex.trim().uppercase()
        try {
            val response = api.getAssetByEpc(epc)
            return when (response.kind) {
                "ASSET" -> {
                    val asset = response.asset
                        ?: return EpcLookup.NotFound
                    dao.upsertAll(listOf(asset.toCached()))
                    EpcLookup.Found(asset, fromCache = false)
                }
                "UNBOUND_TAG" -> EpcLookup.UnboundTag
                "FOREIGN_TAG" -> EpcLookup.ForeignTag(response.companyPrefix)
                else -> EpcLookup.NotFound
            }
        } catch (e: HttpException) {
            if (e.code() != 404) return lookupByEpcOffline(epc)
            // Not commissioned — legacy tags live in the rfidTag column.
            return when (val legacy = lookupByTag(epc)) {
                is TagLookup.Found -> EpcLookup.Found(legacy.asset, legacy.fromCache)
                is TagLookup.NotFound -> EpcLookup.NotFound
            }
        } catch (e: Exception) {
            return lookupByEpcOffline(epc)
        }
    }

    private suspend fun lookupByEpcOffline(epc: String): EpcLookup {
        Gs1.decodeGiai96(epc)?.let { decoded ->
            dao.findByGiai(decoded.giai)?.let { return EpcLookup.Found(it.toApiResponse(), fromCache = true) }
            if (Gs1.isValidIar(decoded.individualAssetReference)) {
                dao.findByIar(decoded.individualAssetReference)
                    ?.let { return EpcLookup.Found(it.toApiResponse(), fromCache = true) }
            }
        }
        dao.findByTag(epc)?.let { return EpcLookup.Found(it.toApiResponse(), fromCache = true) }
        return EpcLookup.NotFound
    }

    /**
     * Offline resolution mirrors the server's getAssetByTag: GS1 Digital Link
     * URIs, raw IARs and grouped HRIs resolve against the GS1 columns before
     * falling back to the legacy rfidTag/barcode/assetNumber match.
     */
    private suspend fun findCachedByTag(tag: String): CachedAsset? {
        Gs1.parseAssetScan(tag)?.let { scan ->
            scan.giai?.let { dao.findByGiai(it)?.let { hit -> return hit } }
            scan.iar?.let { dao.findByIar(it)?.let { hit -> return hit } }
        }
        Gs1.parseHri(tag)?.let { iar -> dao.findByIar(iar)?.let { hit -> return hit } }
        return dao.findByTag(tag)
    }

    private companion object { const val PAGE_SIZE = 200 }
}

sealed class TagLookup {
    data class Found(val asset: AssetResponse, val fromCache: Boolean) : TagLookup()
    object NotFound : TagLookup()
}

sealed class EpcLookup {
    data class Found(val asset: AssetResponse, val fromCache: Boolean) : EpcLookup()
    /** Commissioned tag with no active asset binding. */
    object UnboundTag : EpcLookup()
    /** GIAI-96 tag owned by another tenant's ACTIVE GS1 prefix. */
    data class ForeignTag(val companyPrefix: String?) : EpcLookup()
    object NotFound : EpcLookup()
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
    individualAssetReference = individualAssetReference,
    giai         = giai,
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
    individualAssetReference = individualAssetReference,
    giai         = giai,
    categoryName = category?.name,
    siteName     = site?.name,
    locationName = location?.name,
)
