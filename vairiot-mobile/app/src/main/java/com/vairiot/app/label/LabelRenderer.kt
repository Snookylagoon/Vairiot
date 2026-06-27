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

data class ContentFields(
    val name: Boolean = true,
    val assetNumber: Boolean = true,
    val serialNumber: Boolean = true,
    val barcode: Boolean = false,
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

    fun barcodePayload(asset: AssetResponse, type: BarcodeType): String {
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

    fun render(
        asset: AssetResponse,
        barcodeType: BarcodeType,
        labelSize: LabelSize,
        fields: ContentFields,
        company: CompanyResponse? = null,
    ): Bitmap {
        val widthPx = (labelSize.widthMm * MM_TO_PX).roundToInt()
        val heightPx = (labelSize.heightMm * MM_TO_PX).roundToInt()
        val w = widthPx * SCALE
        val h = heightPx * SCALE

        val bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawColor(Color.WHITE)

        val wide2D = barcodeType.group == "2D"
        val padding = max(3, (min(widthPx, heightPx) * 0.04f).roundToInt()) * SCALE
        val gap = max(2, (widthPx * 0.015f).roundToInt()) * SCALE
        val innerW = w - padding * 2
        val innerH = h - padding * 2

        data class Line(val text: String, val kind: String)
        val lines = mutableListOf<Line>()
        if (fields.name) lines.add(Line(asset.name, "title"))
        if (fields.assetNumber) lines.add(Line(asset.assetNumber, "number"))
        if (fields.serialNumber && !asset.serialNumber.isNullOrBlank()) lines.add(Line("SN: ${asset.serialNumber}", "muted"))
        if (fields.barcode && !asset.barcode.isNullOrBlank()) lines.add(Line("BC: ${asset.barcode}", "muted"))
        if (fields.site && asset.site != null) lines.add(Line(asset.site.name, "muted"))
        if (fields.category && asset.category != null) lines.add(Line(asset.category.name, "muted"))
        if (fields.companyName && company != null) {
            val cName = company.tradingName?.takeIf { it.isNotBlank() } ?: company.legalName
            if (!cName.isNullOrBlank()) lines.add(Line(cName, "brand"))
        }
        if (fields.companyAddress) {
            val addr = formatCompanyAddress(company)
            if (addr.isNotBlank()) lines.add(Line(addr, "muted"))
        }
        if (fields.companyEmail && !company?.primaryContactEmail.isNullOrBlank()) {
            lines.add(Line(company!!.primaryContactEmail!!, "muted"))
        }

        val longestTitle = lines.filter { it.kind == "title" }.maxOfOrNull { it.text.length } ?: 0
        val longestOther = lines.filter { it.kind != "title" }.maxOfOrNull { it.text.length } ?: 0
        val minFont = 5f * SCALE
        val minTextW = max(longestTitle * 0.62f * minFont, longestOther * 0.58f * (minFont * 0.82f))
        val bcIdeal = min(innerH.toFloat(), innerW - minTextW - gap)
        val bcMin = (innerH * 0.3f).roundToInt()
        val bcSize = max(bcMin, min(innerH, bcIdeal.roundToInt()))
        val textAreaW = if (wide2D) innerW - bcSize - gap else innerW

        val maxFontByTitleW = if (longestTitle > 0) textAreaW / (longestTitle * 0.62f) else 99f
        val maxFontByOtherW = if (longestOther > 0) textAreaW / (longestOther * 0.58f) else 99f
        val maxFontByW = min(maxFontByTitleW, maxFontByOtherW / 0.82f)
        val totalWeight = lines.sumOf { if (it.kind == "title") 1.0 else 0.82 }.toFloat()
        val maxFontByH = if (totalWeight > 0) innerH / (totalWeight * 1.15f) else 12f * SCALE
        val fontSize = max(3f * SCALE, min(maxFontByH, min(maxFontByW, 14f * SCALE)))
        val otherFont = max(3f * SCALE, (fontSize * 0.82f).roundToInt().toFloat())

        val payload = barcodePayload(asset, barcodeType)
        val barcodeBmp = try {
            generateBarcode(payload, barcodeType, bcSize)
        } catch (_: Exception) {
            generateBarcode(asset.assetNumber, BarcodeType.QR_CODE, bcSize)
        }

        if (wide2D) {
            val bcY = padding + max(0, (innerH - bcSize) / 2)
            canvas.drawBitmap(barcodeBmp, null,
                android.graphics.Rect(padding, bcY, padding + bcSize, bcY + bcSize), null)
        }

        val textX = (if (wide2D) padding + bcSize + gap else padding).toFloat()
        val totalTextH = lines.sumOf { ((if (it.kind == "title") fontSize else otherFont) * 1.15f).toDouble() }.toFloat()
        var y = padding + max(0f, (innerH - totalTextH) / 2f)

        val paint = Paint(Paint.ANTI_ALIAS_FLAG)

        for (l in lines) {
            val fs = if (l.kind == "title") fontSize else otherFont
            paint.textSize = fs
            paint.typeface = if (l.kind == "title") Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD) else Typeface.SANS_SERIF
            paint.color = when (l.kind) {
                "title" -> Color.parseColor("#2B3132")
                "number" -> Color.parseColor("#615AA0")
                "brand" -> Color.parseColor("#2B3132")
                else -> Color.parseColor("#6b7280")
            }
            y += fs
            canvas.drawText(l.text, textX, y, paint)
            y += fs * 0.15f
        }

        if (!wide2D) {
            val bc1DH = min((innerH * 0.35f).roundToInt(), 50 * SCALE)
            canvas.drawBitmap(barcodeBmp, null,
                android.graphics.Rect(padding, h - padding - bc1DH, w - padding, h - padding), null)
        }

        barcodeBmp.recycle()
        return bitmap
    }
}
