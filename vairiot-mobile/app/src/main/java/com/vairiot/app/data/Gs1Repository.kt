package com.vairiot.app.data

import android.content.Context
import com.google.gson.Gson
import com.vairiot.app.data.api.Gs1EncodingResponse
import com.vairiot.app.data.api.IdentificationResponse
import com.vairiot.app.data.api.VairiotApiService
import com.vairiot.app.util.Gs1
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Tenant GS1 identification (mode, slug, tenant mark, Digital Link host,
 * active company prefix). Fetched from the server when online and persisted
 * so labels can still be rendered and printed offline.
 */
@Singleton
class Gs1Repository @Inject constructor(
    private val api: VairiotApiService,
    @ApplicationContext private val context: Context,
) {
    companion object {
        private const val PREFS_NAME = "gs1_prefs"
        private const val KEY_IDENT = "identification_json"
    }

    private val gson = Gson()

    /** Server first; falls back to the last persisted copy when offline. */
    suspend fun getIdentification(): IdentificationResponse? {
        return try {
            val ident = api.getIdentification()
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
                .putString(KEY_IDENT, gson.toJson(ident))
                .apply()
            ident
        } catch (_: Exception) {
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .getString(KEY_IDENT, null)
                ?.let { try { gson.fromJson(it, IdentificationResponse::class.java) } catch (_: Exception) { null } }
        }
    }

    /**
     * Compute the asset's GS1 encoding locally — the same derivation the
     * server performs in encodeIdentifier, minus EPC concerns. Works offline.
     */
    fun encodeLocally(
        iar: String,
        assetGiai: String?,
        ident: IdentificationResponse,
    ): Gs1EncodingResponse? {
        if (!Gs1.isValidIar(iar)) return null
        val prefix = ident.activePrefix?.prefix
        val giai = assetGiai ?: prefix?.let { Gs1.buildGiai(it, iar) }
        val mode = if (ident.mode == "GS1" && giai != null) "GS1" else "INTERNAL"
        val host = ident.digitalLinkHost?.takeIf { it.isNotBlank() } ?: Gs1.DEFAULT_OPERATIONAL_HOST
        return Gs1EncodingResponse(
            mode = mode,
            giai = giai,
            hri = Gs1.formatHri(iar, ident.tenantMark ?: ""),
            elementString = Gs1.gs1128ElementString(mode, giai, iar),
            digitalLink = Gs1.assetDigitalLink(mode, giai, iar, ident.slug, host),
        )
    }
}
