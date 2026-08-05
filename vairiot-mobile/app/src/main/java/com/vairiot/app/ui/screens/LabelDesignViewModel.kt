package com.vairiot.app.ui.screens

import android.graphics.Bitmap
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vairiot.app.data.Gs1Repository
import com.vairiot.app.data.LabelTemplateRepository
import com.vairiot.app.data.api.AssetResponse
import com.vairiot.app.data.api.CompanyResponse
import com.vairiot.app.data.api.Gs1EncodingResponse
import com.vairiot.app.data.api.LabelPrintRequest
import com.vairiot.app.data.api.LabelTemplateConfigDto
import com.vairiot.app.data.api.LabelTemplateDto
import com.vairiot.app.data.api.LabelTemplateFieldsDto
import com.vairiot.app.data.api.VairiotApiService
import com.vairiot.app.label.*
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class LabelDesignUiState(
    val isLoading: Boolean = true,
    val asset: AssetResponse? = null,
    val company: CompanyResponse? = null,
    val gs1: Gs1EncodingResponse? = null,
    val error: String? = null,

    val templates: List<LabelTemplateDto> = emptyList(),
    val selectedTemplateId: String? = null,
    val isRefreshingTemplates: Boolean = false,

    val previewBitmap: Bitmap? = null,

    val isPrinting: Boolean = false,
    val printResult: String? = null,
    val savedPrinter: PrinterInfo? = null,
    /** Paired printer matching the template's printer.name — used instead of savedPrinter. */
    val matchedPrinter: PrinterInfo? = null,
    /** Shown when the template names a printer no paired device matches. */
    val printerHint: String? = null,
) {
    val selectedTemplate: LabelTemplateDto? get() = templates.firstOrNull { it.id == selectedTemplateId }
    val effectivePrinter: PrinterInfo? get() = matchedPrinter ?: savedPrinter
}

@HiltViewModel
class LabelDesignViewModel @Inject constructor(
    private val api: VairiotApiService,
    private val printerService: PrinterService,
    private val gs1Repository: Gs1Repository,
    private val templateRepository: LabelTemplateRepository,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val assetId: String = savedStateHandle["assetId"] ?: ""

    private val _state = MutableStateFlow(LabelDesignUiState())
    val state: StateFlow<LabelDesignUiState> = _state

    init {
        _state.value = _state.value.copy(savedPrinter = printerService.getSavedPrinter())
        load()
    }

    private fun load() {
        if (assetId.isBlank()) return
        viewModelScope.launch {
            try {
                val asset = api.getAsset(assetId)
                val company = try { api.getCompany() } catch (_: Exception) { null }
                val gs1 = asset.individualAssetReference?.let { iar ->
                    gs1Repository.getIdentification()?.let { ident ->
                        gs1Repository.encodeLocally(iar, asset.giai, ident)
                    }
                }
                val templates = templateRepository.getTemplates()
                _state.value = _state.value.copy(
                    isLoading = false, asset = asset, company = company, gs1 = gs1,
                    templates = templates,
                )
                templates.firstOrNull()?.let { selectTemplate(it.id) }
            } catch (e: Exception) {
                _state.value = _state.value.copy(isLoading = false, error = e.message)
            }
        }
    }

    fun selectTemplate(id: String) {
        val template = _state.value.templates.firstOrNull { it.id == id } ?: return
        val (matched, hint) = matchPrinter(template.config?.printer?.name)
        _state.value = _state.value.copy(
            selectedTemplateId = id,
            matchedPrinter = matched,
            printerHint = hint,
        )
        regeneratePreview()
    }

    fun refreshTemplates() {
        viewModelScope.launch {
            _state.value = _state.value.copy(isRefreshingTemplates = true)
            try {
                val templates = templateRepository.refreshTemplates()
                val keepId = _state.value.selectedTemplateId?.takeIf { id -> templates.any { it.id == id } }
                _state.value = _state.value.copy(
                    isRefreshingTemplates = false, templates = templates, error = null,
                )
                when {
                    keepId != null -> selectTemplate(keepId) // re-apply in case the config changed
                    templates.isNotEmpty() -> selectTemplate(templates.first().id)
                    else -> _state.value = _state.value.copy(
                        selectedTemplateId = null, previewBitmap = null,
                        matchedPrinter = null, printerHint = null,
                    )
                }
            } catch (_: Exception) {
                _state.value = _state.value.copy(
                    isRefreshingTemplates = false,
                    error = "Could not refresh templates — check your connection.",
                )
            }
        }
    }

    /** Contains-match both ways so "HH83 BT" matches a paired "Nordic ID HH83 BT Printer". */
    private fun matchPrinter(templatePrinterName: String?): Pair<PrinterInfo?, String?> {
        val wanted = templatePrinterName?.trim()?.takeIf { it.isNotEmpty() } ?: return null to null
        val match = printerService.getPairedPrinters().firstOrNull {
            val paired = it.name.trim()
            paired.contains(wanted, ignoreCase = true) || wanted.contains(paired, ignoreCase = true)
        }
        return if (match != null) match to null
        else null to "Template is tuned for ‘$wanted’ — no matching paired printer found."
    }

    private fun barcodeTypeFor(code: String?): BarcodeType = when (code?.lowercase()) {
        "qrcode" -> BarcodeType.QR_CODE
        "datamatrix" -> BarcodeType.DATA_MATRIX
        "pdf417" -> BarcodeType.PDF417
        "azteccode" -> BarcodeType.AZTEC
        "code128" -> BarcodeType.CODE_128
        "code39" -> BarcodeType.CODE_39
        "code93" -> BarcodeType.CODE_93
        "ean13" -> BarcodeType.EAN_13
        "upca" -> BarcodeType.UPC_A
        "itf14" -> BarcodeType.ITF
        else -> BarcodeType.QR_CODE
    }

    private fun fieldsFor(f: LabelTemplateFieldsDto?): ContentFields = ContentFields(
        name = f?.name ?: true,
        assetNumber = f?.assetNumber ?: true,
        serialNumber = f?.serialNumber ?: true,
        barcode = f?.barcode ?: true,
        site = f?.site ?: true,
        category = f?.category ?: false,
        companyName = f?.companyName ?: false,
        companyAddress = f?.companyAddress ?: false,
        companyEmail = f?.companyEmail ?: false,
    )

    private fun rotationFor(c: LabelTemplateConfigDto?): Int {
        val deg = c?.printRotation ?: if (c?.printRotate == true) 90 else 0
        return if (deg == 90 || deg == 180 || deg == 270) deg else 0
    }

    private fun regeneratePreview() {
        val s = _state.value
        val asset = s.asset ?: return
        val template = s.selectedTemplate
        if (template == null) {
            _state.value = s.copy(previewBitmap = null)
            return
        }
        val config = template.config
        val barcodeType = barcodeTypeFor(config?.barcodeType)
        val labelSize = labelSizeFor(config?.sizePreset, config?.customW?.toFloat(), config?.customH?.toFloat())
        val fields = fieldsFor(config?.fields)
        // Freeform layout + style overrides saved by the web designer.
        val layout = config?.layout
            ?.mapNotNull { (k, v) ->
                val x = v.x?.toFloat(); val y = v.y?.toFloat()
                if (x != null && y != null) k to LabelRenderer.LayoutPos(x, y) else null
            }
            ?.toMap()
            ?.takeIf { it.isNotEmpty() }
        val styles = config?.styles
            ?.mapValues { (_, v) -> LabelRenderer.TextStyle(v.bold, v.italic, v.font?.toFloat()) }
            ?: emptyMap()
        viewModelScope.launch {
            try {
                val bmp = LabelRenderer.render(
                    asset, barcodeType, labelSize, fields, s.company, s.gs1,
                    layout = layout, styles = styles,
                    barcodeMm = config?.barcodeMm?.toFloat(),
                    monochrome = config?.monochrome == true,
                )
                _state.value = _state.value.copy(previewBitmap = bmp)
            } catch (e: Exception) {
                _state.value = _state.value.copy(error = "Preview failed: ${e.message}")
            }
        }
    }

    fun printLabel() {
        val s = _state.value
        val bmp = s.previewBitmap ?: return
        val printer = s.effectivePrinter ?: return
        val config = s.selectedTemplate?.config
        val rotation = rotationFor(config)
        val copies = (config?.printer?.copies ?: 1).coerceIn(1, 20)
        viewModelScope.launch {
            _state.value = _state.value.copy(isPrinting = true, printResult = null)
            val toPrint = LabelRenderer.rotate(bmp, rotation)
            val result = printerService.printBitmap(printer.address, toPrint, copies)
            if (toPrint !== bmp) toPrint.recycle()
            _state.value = _state.value.copy(
                isPrinting = false,
                printResult = if (result.isSuccess) "Label printed" else "Print failed: ${result.exceptionOrNull()?.message}",
            )
            if (result.isSuccess) recordPrint(s)
        }
    }

    /** Best-effort print audit trail — never blocks or fails the print itself. */
    private suspend fun recordPrint(s: LabelDesignUiState) {
        val asset = s.asset ?: return
        if (asset.individualAssetReference == null) return
        val symbology = when (barcodeTypeFor(s.selectedTemplate?.config?.barcodeType)) {
            BarcodeType.QR_CODE -> "QR"
            BarcodeType.DATA_MATRIX -> "DATAMATRIX"
            BarcodeType.CODE_128 -> "GS1_128"
            else -> null
        } ?: return
        try {
            api.recordLabelPrint(LabelPrintRequest(
                assetIds = listOf(asset.id),
                templateCode = s.selectedTemplate?.name ?: "mobile-android",
                symbology = symbology,
                printerId = s.effectivePrinter?.address,
            ))
        } catch (_: Exception) { /* offline or older server — the label is already printed */ }
    }

    fun refreshSavedPrinter() {
        _state.value = _state.value.copy(savedPrinter = printerService.getSavedPrinter())
        // Re-evaluate the template's printer match — pairing may have changed.
        _state.value.selectedTemplate?.let { t ->
            val (matched, hint) = matchPrinter(t.config?.printer?.name)
            _state.value = _state.value.copy(matchedPrinter = matched, printerHint = hint)
        }
    }

    fun clearPrintResult() {
        _state.value = _state.value.copy(printResult = null)
    }
}
