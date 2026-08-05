package com.vairiot.app.label

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.MultiFormatWriter
import com.vairiot.app.data.api.AssetResponse
import com.vairiot.app.data.api.CompanyResponse
import com.vairiot.app.data.api.Gs1EncodingResponse
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

enum class BarcodeType(val label: String, val group: String, val zxingFormat: BarcodeFormat) {
    QR_CODE("QR Code", "2D", BarcodeFormat.QR_CODE),
    DATA_MATRIX("Data Matrix", "2D", BarcodeFormat.DATA_MATRIX),
    PDF417("PDF417", "2D", BarcodeFormat.PDF_417),
    AZTEC("Aztec", "2D", BarcodeFormat.AZTEC),
    CODE_128("Code 128", "1D", BarcodeFormat.CODE_128),
    CODE_39("Code 39", "1D", BarcodeFormat.CODE_39),
    CODE_93("Code 93", "1D", BarcodeFormat.CODE_93),
    EAN_13("EAN-13", "1D", BarcodeFormat.EAN_13),
    UPC_A("UPC-A", "1D", BarcodeFormat.UPC_A),
    ITF("ITF-14", "1D", BarcodeFormat.ITF),
}

data class LabelSize(val label: String, val widthMm: Float, val heightMm: Float)

val AVERY_PRESETS = listOf(
    LabelSize("Avery 5167 — 44.5 × 12.7 mm", 44.5f, 12.7f),
    LabelSize("Avery 6570 — 31.75 × 19.05 mm", 31.75f, 19.05f),
    LabelSize("Avery 5160 — 66.7 × 25.4 mm", 66.7f, 25.4f),
    LabelSize("Avery L7651 (EU) — 38.1 × 21.2 mm", 38.1f, 21.2f),
    LabelSize("Avery L7159 (EU) — 63.5 × 38.1 mm", 63.5f, 38.1f),
    LabelSize("Avery 5163 — 101.6 × 50.8 mm", 101.6f, 50.8f),
    LabelSize("Avery L7163 (EU) — 99.1 × 38.1 mm", 99.1f, 38.1f),
)

// Web designer sizePreset codes → the presets above.
private val PRESETS_BY_CODE = mapOf(
    "avery-5167" to AVERY_PRESETS[0],
    "avery-6570" to AVERY_PRESETS[1],
    "avery-5160" to AVERY_PRESETS[2],
    "avery-l7651" to AVERY_PRESETS[3],
    "avery-l7159" to AVERY_PRESETS[4],
    "avery-5163" to AVERY_PRESETS[5],
    "avery-l7163" to AVERY_PRESETS[6],
)

/** Resolves a template's size config; 'custom' uses explicit millimetres. */
fun labelSizeFor(presetCode: String?, customWmm: Float?, customHmm: Float?): LabelSize {
    if (presetCode == "custom") {
        val w = customWmm?.takeIf { it > 0f }
        val h = customHmm?.takeIf { it > 0f }
        if (w != null && h != null) return LabelSize("Custom — $w × $h mm", w, h)
    }
    return PRESETS_BY_CODE[presetCode?.lowercase()] ?: AVERY_PRESETS[3]
}

data class ContentFields(
    val name: Boolean = true,
    val assetNumber: Boolean = true,
    val serialNumber: Boolean = true,
    /** GS1 identifier line (HRI); falls back to the legacy barcode value. */
    val barcode: Boolean = true,
    val site: Boolean = true,
    val category: Boolean = false,
    val companyName: Boolean = false,
    val companyAddress: Boolean = false,
    val companyEmail: Boolean = false,
)

fun formatCompanyAddress(c: CompanyResponse?): String {
    if (c == null) return ""
    return listOfNotNull(c.addressLine1, c.addressLine2, c.city, c.stateProvince, c.postalCode, c.country)
        .filter { it.isNotBlank() }
        .joinToString(", ")
}

object LabelRenderer {

    private const val SCALE = 3
    private const val MM_TO_PX = 3.7795275591f

    /** Rotation applied at print time (template printRotation), not in preview. */
    fun rotate(bitmap: Bitmap, degrees: Int): Bitmap {
        val d = ((degrees % 360) + 360) % 360
        if (d == 0) return bitmap
        val matrix = android.graphics.Matrix().apply { postRotate(d.toFloat()) }
        return Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
    }

    fun barcodePayload(asset: AssetResponse, type: BarcodeType, gs1: Gs1EncodingResponse? = null): String {
        // GS1-identified assets encode a plain GS1 Digital Link URL in 2D
        // codes — readable by any phone camera — and a GS1-128 element string
        // in Code 128. Mirrors the web label designer's barcodePayload().
        if (gs1 != null) {
            if (type.group == "2D") return gs1.digitalLink
            if (type == BarcodeType.CODE_128) return gs1.elementString
        }
        if (type.group == "2D") {
            return """{"id":"${asset.id}","n":"${asset.assetNumber}","name":"${asset.name}"}"""
        }
        val raw = asset.barcode ?: asset.serialNumber ?: asset.assetNumber
        return when (type) {
            BarcodeType.EAN_13 -> raw.replace(Regex("\\D"), "").padStart(12, '0').take(12)
            BarcodeType.UPC_A -> raw.replace(Regex("\\D"), "").padStart(11, '0').take(11)
            BarcodeType.ITF -> raw.replace(Regex("\\D"), "").padStart(14, '0').take(14)
            BarcodeType.CODE_39 -> raw.uppercase().replace(Regex("[^A-Z0-9\\-. \$/+%]"), "")
            else -> raw
        }
    }

    fun generateBarcode(payload: String, type: BarcodeType, size: Int): Bitmap {
        val hints = mapOf(
            EncodeHintType.MARGIN to 1,
            EncodeHintType.CHARACTER_SET to "UTF-8",
        )
        val matrix = MultiFormatWriter().encode(payload, type.zxingFormat, size, size, hints)
        val width = matrix.width
        val height = matrix.height
        val bmp = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        for (x in 0 until width) {
            for (y in 0 until height) {
                bmp.setPixel(x, y, if (matrix.get(x, y)) Color.BLACK else Color.WHITE)
            }
        }
        return bmp
    }

    // Smallest reliably scannable 2D symbol on a printed label (mm) — web MIN_BARCODE_MM.
    private const val MIN_BARCODE_MM = 12f

    /** Fractional top-left position from the web layout editor (0–1 of label size). */
    data class LayoutPos(val x: Float, val y: Float)

    /** Per-field style override from the web designer; unset falls back to auto. */
    data class TextStyle(val bold: Boolean? = null, val italic: Boolean? = null, val font: Float? = null)

    private data class Element(
        val key: String,
        val kind: String,          // 'barcode' | 'text'
        val text: String = "",
        val font: Float = 0f,
        val bold: Boolean = false,
        val italic: Boolean = false,
        val color: Int = Color.BLACK,
        var x: Float, var y: Float, val w: Float, val h: Float,
    )

    /**
     * Kotlin port of the web designer's computeLabelElements() (labelLayout.ts).
     * All geometry is at 1× label px (96 dpi) and drawn at SCALE, so a saved
     * template renders identically here and in the web preview/print. The
     * company-logo element is not rendered on mobile (no logo asset on device);
     * everything else — element order, auto layout, freeform `layout` overrides,
     * per-field `styles`, fixed `barcodeMm` — matches the web.
     */
    fun render(
        asset: AssetResponse,
        barcodeType: BarcodeType,
        labelSize: LabelSize,
        fields: ContentFields,
        company: CompanyResponse? = null,
        gs1: Gs1EncodingResponse? = null,
        layout: Map<String, LayoutPos>? = null,
        styles: Map<String, TextStyle> = emptyMap(),
        barcodeMm: Float? = null,
        monochrome: Boolean = false,
    ): Bitmap {
        val widthPx = labelSize.widthMm * MM_TO_PX
        val heightPx = labelSize.heightMm * MM_TO_PX
        val w = (widthPx * SCALE).roundToInt()
        val h = (heightPx * SCALE).roundToInt()

        val wide2D = barcodeType.group == "2D"
        val padding = max(3, (min(widthPx, heightPx) * 0.04f).roundToInt()).toFloat()
        val innerW = widthPx - padding * 2
        val innerH = heightPx - padding * 2
        val gap = max(2, (innerW * 0.015f).roundToInt()).toFloat()

        // Lines in the web designer's order, keyed by the web's ElementKey so
        // saved layout/style maps apply to the right element.
        data class Line(val key: String, val text: String, val kind: String)
        val lines = mutableListOf<Line>()
        if (fields.name) lines.add(Line("name", asset.name, "title"))
        if (fields.assetNumber) lines.add(Line("assetNumber", asset.assetNumber, "number"))
        // GS1 identifier line — the HRI carries the tenant mark so identifiers
        // stay distinguishable across tenants (replaces the legacy BC: line).
        if (fields.barcode) {
            if (gs1 != null) lines.add(Line("iar", gs1.hri, "number"))
            else if (!asset.barcode.isNullOrBlank()) lines.add(Line("barcodeValue", "BC: ${asset.barcode}", "muted"))
        }
        if (fields.serialNumber && !asset.serialNumber.isNullOrBlank()) lines.add(Line("serialNumber", "SN: ${asset.serialNumber}", "muted"))
        if (fields.site && asset.site != null) lines.add(Line("site", asset.site.name, "muted"))
        if (fields.category && asset.category != null) lines.add(Line("category", asset.category.name, "muted"))
        if (fields.companyName && company != null) {
            val cName = company.tradingName?.takeIf { it.isNotBlank() } ?: company.legalName
            if (!cName.isNullOrBlank()) lines.add(Line("companyName", cName, "brand"))
        }
        if (fields.companyAddress) {
            val addr = formatCompanyAddress(company)
            if (addr.isNotBlank()) lines.add(Line("companyAddress", addr, "muted"))
        }
        if (fields.companyEmail && !company?.primaryContactEmail.isNullOrBlank()) {
            lines.add(Line("companyEmail", company!!.primaryContactEmail!!, "muted"))
        }

        // Barcode geometry — a fixed template size (≥12 mm) wins over the heuristic.
        val longestTitle = lines.filter { it.kind == "title" }.maxOfOrNull { it.text.length } ?: 0
        val longestOther = lines.filter { it.kind != "title" }.maxOfOrNull { it.text.length } ?: 0
        val minFont = 5f
        val minTextW = max(longestTitle * 0.62f * minFont, longestOther * 0.58f * (minFont * 0.82f))
        val bcIdeal = min(innerH, innerW - minTextW - gap)
        val bcMin = (innerH * 0.3f).roundToInt().toFloat()
        val bcSize2D = if (barcodeMm != null) {
            min(max(barcodeMm, MIN_BARCODE_MM) * MM_TO_PX, min(innerW, innerH)).roundToInt().toFloat()
        } else {
            max(bcMin, min(innerH, bcIdeal)).roundToInt().toFloat()
        }
        val bc1DH = min((innerH * 0.35f).roundToInt(), 50).toFloat()
        val textAreaW = if (wide2D) innerW - bcSize2D - gap else innerW

        // Font sizing. With a custom template layout, fonts derive from the label
        // geometry alone so every asset's label matches the template; automatic
        // layout keeps the classic per-asset auto-fit.
        val titleFont: Float
        val otherFont: Float
        if (layout != null) {
            titleFont = max(5f, min(14f, (innerH * 0.13f).roundToInt().toFloat()))
            otherFont = max(4f, (titleFont * 0.82f).roundToInt().toFloat())
        } else {
            val maxFontByTitleW = if (longestTitle > 0) textAreaW / (longestTitle * 0.62f) else 99f
            val maxFontByOtherW = if (longestOther > 0) textAreaW / (longestOther * 0.58f) else 99f
            val maxFontByW = min(maxFontByTitleW, maxFontByOtherW / 0.82f)
            val totalWeight = lines.sumOf { if (it.kind == "title") 1.0 else 0.82 }.toFloat()
            val textAreaH = if (wide2D) innerH else innerH - bc1DH - 2f
            val maxFontByH = if (totalWeight > 0) textAreaH / (totalWeight * 1.15f) else 12f
            val fontSize = max(3f, min(maxFontByH, min(maxFontByW, 14f)))
            titleFont = fontSize
            otherFont = max(3f, (fontSize * 0.82f).roundToInt().toFloat())
        }

        val elements = mutableListOf<Element>()

        if (wide2D) {
            elements.add(Element(key = "barcode", kind = "barcode",
                x = padding, y = padding + max(0f, (innerH - bcSize2D) / 2f),
                w = bcSize2D, h = bcSize2D))
        } else {
            elements.add(Element(key = "barcode", kind = "barcode",
                x = padding, y = heightPx - padding - bc1DH,
                w = innerW, h = bc1DH))
        }

        // Effective per-line style: explicit overrides win over the auto style.
        val styledLines = lines.map { l ->
            val s = styles[l.key]
            Triple(l, s?.font ?: (if (l.kind == "title") titleFont else otherFont),
                Pair(s?.bold ?: (l.kind == "title"), s?.italic ?: false))
        }

        // Text stack, vertically centred in its area.
        val textX = if (wide2D) padding + bcSize2D + gap else padding
        val stackH = styledLines.map { it.second * 1.15f }.sum()
        val availH = if (wide2D) innerH else innerH - bc1DH - 2f
        var stackY = padding + max(0f, (availH - stackH) / 2f)

        for ((l, font, style) in styledLines) {
            val estW = min(textAreaW, l.text.length * (if (l.kind == "title") 0.62f else 0.58f) * font)
            elements.add(Element(
                key = l.key, kind = "text", text = l.text,
                font = font, bold = style.first, italic = style.second,
                color = if (monochrome) Color.BLACK else Color.parseColor(when (l.kind) {
                    "title" -> "#2B3132"
                    "number" -> "#615AA0"
                    "brand" -> "#2B3132"
                    else -> "#6b7280"
                }),
                x = textX, y = stackY, w = max(4f, estW), h = font * 1.15f,
            ))
            stackY += font * 1.15f
        }

        // Freeform overrides: fractional top-left positions, clamped on-label.
        if (layout != null) {
            for (el in elements) {
                val pos = layout[el.key] ?: continue
                el.x = min(max(0f, pos.x * widthPx), max(0f, widthPx - el.w))
                el.y = min(max(0f, pos.y * heightPx), max(0f, heightPx - el.h))
            }
        }

        val bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawColor(Color.WHITE)

        val payload = barcodePayload(asset, barcodeType, gs1)
        val bcEl = elements.first { it.kind == "barcode" }
        val barcodeBmp = try {
            generateBarcode(payload, barcodeType, (max(bcEl.w, bcEl.h) * SCALE).roundToInt())
        } catch (_: Exception) {
            generateBarcode(asset.assetNumber, BarcodeType.QR_CODE, (max(bcEl.w, bcEl.h) * SCALE).roundToInt())
        }

        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        for (el in elements) {
            when (el.kind) {
                "barcode" -> canvas.drawBitmap(barcodeBmp, null,
                    android.graphics.Rect(
                        (el.x * SCALE).roundToInt(), (el.y * SCALE).roundToInt(),
                        ((el.x + el.w) * SCALE).roundToInt(), ((el.y + el.h) * SCALE).roundToInt()), null)
                "text" -> {
                    if (el.text.isEmpty()) continue
                    val fs = el.font * SCALE
                    paint.textSize = fs
                    paint.typeface = Typeface.create(Typeface.SANS_SERIF, when {
                        el.bold && el.italic -> Typeface.BOLD_ITALIC
                        el.bold -> Typeface.BOLD
                        el.italic -> Typeface.ITALIC
                        else -> Typeface.NORMAL
                    })
                    paint.color = el.color
                    // Same top-left anchor as the web canvas renderer (baseline = top + font size).
                    canvas.drawText(el.text, el.x * SCALE, el.y * SCALE + fs, paint)
                }
            }
        }

        barcodeBmp.recycle()
        return bitmap
    }
}
