package com.vairiot.app.util

import java.math.BigInteger
import java.net.URI

/**
 * GS1 identifier helpers — a faithful port of `vairiot-shared/src/gs1`
 * (identifier.ts + digitalLink.ts). Keep the two in sync: the server
 * allocates every Individual Asset Reference; the app only validates,
 * formats and resolves scans locally.
 */
object Gs1 {

    const val MARKER_SERVER = '1'
    const val MARKER_STANDALONE = '2'
    const val IAR_LENGTH = 12
    const val DEFAULT_OPERATIONAL_HOST = "id.vairiot.com"

    /** GS1 modulo-10 check digit. Weights 3,1,3,1… from the rightmost body digit. */
    fun checkDigit(body: String): Int {
        require(body.isNotEmpty() && body.all { it.isDigit() }) { "check digit input must be numeric" }
        var total = 0
        var w = 3
        for (i in body.length - 1 downTo 0) {
            total += (body[i] - '0') * w
            w = if (w == 3) 1 else 3
        }
        return (10 - (total % 10)) % 10
    }

    fun isValidIar(iar: String): Boolean =
        iar.length == IAR_LENGTH &&
            iar.all { it.isDigit() } &&
            (iar[0] == MARKER_SERVER || iar[0] == MARKER_STANDALONE) &&
            (iar[IAR_LENGTH - 1] - '0') == checkDigit(iar.substring(0, IAR_LENGTH - 1))

    /** Label form, grouped 1-5-5-1. [tenantMark] is presentation only. */
    fun formatHri(iar: String, tenantMark: String = ""): String {
        val grouped = "${iar[0]} ${iar.substring(1, 6)} ${iar.substring(6, 11)} ${iar[11]}"
        return (if (tenantMark.isNotBlank()) "$tenantMark $grouped" else grouped).trim()
    }

    /** Accepts the grouped HRI or the raw IAR; returns the raw IAR or null. */
    fun parseHri(input: String): String? {
        val digits = input.filter { it.isDigit() }
        return if (isValidIar(digits)) digits else null
    }

    fun buildGiai(companyPrefix: String, iar: String): String? {
        if (!isValidIar(iar)) return null
        if (!Regex("^\\d{6,12}$").matches(companyPrefix)) return null
        val giai = companyPrefix + iar
        return if (giai.length <= 30) giai else null
    }

    /**
     * GS1 Digital Link for an asset. GS1-mode tenants get the canonical
     * /8004/ GIAI path; internal-mode tenants get the tenant-scoped path.
     */
    fun assetDigitalLink(
        mode: String,
        giai: String?,
        iar: String,
        tenantSlug: String,
        host: String = DEFAULT_OPERATIONAL_HOST,
    ): String =
        if (mode == "GS1" && !giai.isNullOrBlank()) "https://$host/8004/$giai"
        else "https://$host/t/$tenantSlug/asset/$iar"

    /** GS1-128 element string: AI (8004) for GIAI, AI (91) for internal IARs. */
    fun gs1128ElementString(mode: String, giai: String?, iar: String): String =
        if (mode == "GS1" && !giai.isNullOrBlank()) "(8004)$giai" else "(91)$iar"

    /* ── GIAI-96 EPC decoding (port of vairiot-shared/src/gs1/epc.ts) ────── */

    private const val GIAI96_HEADER = 0x34

    private data class Partition(val cpBits: Int, val cpDigits: Int, val refBits: Int)

    private val GIAI96_PARTITIONS = mapOf(
        0 to Partition(40, 12, 42),
        1 to Partition(37, 11, 45),
        2 to Partition(34, 10, 48),
        3 to Partition(30, 9, 52),
        4 to Partition(27, 8, 55),
        5 to Partition(24, 7, 58),
        6 to Partition(20, 6, 62),
    )

    data class Giai96(
        val filterValue: Int,
        val partition: Int,
        val companyPrefix: String,
        val individualAssetReference: String,
    ) {
        val giai: String get() = companyPrefix + individualAssetReference
    }

    /** INTERNAL-mode EPC: the tag's own 96-bit serialised TID (E2 header). */
    fun isInternalEpc(hex: String): Boolean = Regex("^E2[0-9A-F]{22}$", RegexOption.IGNORE_CASE).matches(hex)

    /** Decode a GIAI-96 EPC to its company prefix and IAR, or null if not one. */
    fun decodeGiai96(hex: String): Giai96? {
        if (!Regex("^[0-9A-Fa-f]{24}$").matches(hex)) return null
        val bits = BigInteger(hex, 16).toString(2).padStart(96, '0')
        if (bits.substring(0, 8).toInt(2) != GIAI96_HEADER) return null
        val filterValue = bits.substring(8, 11).toInt(2)
        val partition = bits.substring(11, 14).toInt(2)
        val p = GIAI96_PARTITIONS[partition] ?: return null
        val cp = BigInteger(bits.substring(14, 14 + p.cpBits), 2).toString().padStart(p.cpDigits, '0')
        val iar = BigInteger(bits.substring(14 + p.cpBits, 14 + p.cpBits + p.refBits), 2).toString()
        return Giai96(filterValue, partition, cp, iar)
    }

    data class ScanResult(val giai: String? = null, val iar: String? = null, val tenantSlug: String? = null)

    private val GIAI_PATH = Regex("^/8004/([0-9A-Za-z!\"%&'()*+,\\-./:;<=>?_]{1,30})$")
    private val INTERNAL_PATH = Regex("^/t/([a-z0-9-]{2,64})/asset/(\\d{12})$")

    /** Local, offline scan resolution. Never calls the network. */
    fun parseAssetScan(raw: String): ScanResult? {
        val text = raw.trim()
        if (Regex("^\\d{12}$").matches(text) && isValidIar(text)) return ScanResult(iar = text)
        val path = try {
            val uri = URI(text)
            if (uri.scheme == null || uri.host == null) return null
            uri.rawPath ?: return null
        } catch (_: Exception) {
            return null
        }
        GIAI_PATH.find(path)?.let { return ScanResult(giai = it.groupValues[1]) }
        INTERNAL_PATH.find(path)?.let {
            val iar = it.groupValues[2]
            if (isValidIar(iar)) return ScanResult(iar = iar, tenantSlug = it.groupValues[1])
        }
        return null
    }
}
