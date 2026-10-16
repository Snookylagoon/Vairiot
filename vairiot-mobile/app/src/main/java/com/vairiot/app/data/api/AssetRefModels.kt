package com.vairiot.app.data.api

// References an asset response carries (moved out of ApiModels.kt, which is on
// the line-limit baseline, at stage 2.4).

data class CategoryRefResponse(val id: String, val name: String)
data class SiteRefResponse(val id: String, val name: String)
data class LocationRefResponse(val id: String, val name: String)

/** The asset's IPSAS class (stage 2.4). The apps show it; Finance sets it on the web. */
data class AssetClassRefResponse(val id: String, val code: String, val name: String)

private val RECOGNITION_LABELS = mapOf(
    "RECOGNISED" to "recognised",
    "EXPENSED" to "expensed, below threshold",
    "PENDING_REVIEW" to "waiting for Finance",
)

/**
 * The "Asset class" row of the asset screen: "SGN · Road signs (recognised)",
 * "None yet (waiting for Finance)", or null when the tenant keeps no IPSAS ledger.
 */
fun assetClassLabel(assetClass: AssetClassRefResponse?, recognitionStatus: String?): String? {
    if (assetClass == null && recognitionStatus == null) return null
    val name = assetClass?.let { "${it.code} · ${it.name}" } ?: "None yet"
    val status = recognitionStatus?.let { RECOGNITION_LABELS[it] ?: it.lowercase() }
    return if (status == null) name else "$name ($status)"
}
