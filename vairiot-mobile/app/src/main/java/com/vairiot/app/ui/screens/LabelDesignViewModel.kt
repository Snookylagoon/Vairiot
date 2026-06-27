package com.vairiot.app.ui.screens

import android.graphics.Bitmap
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vairiot.app.data.api.AssetResponse
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
    val error: String? = null,

    val barcodeType: BarcodeType = BarcodeType.QR_CODE,
    val labelSizeIndex: Int = 3, // Avery L7651 default
    val fields: ContentFields = ContentFields(),

    val previewBitmap: Bitmap? = null,

    val isPrinting: Boolean = false,
    val printResult: String? = null,
    val savedPrinter: PrinterInfo? = null,
)

@HiltViewModel
class LabelDesignViewModel @Inject constructor(
    private val api: VairiotApiService,
    private val printerService: PrinterService,
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
                _state.value = _state.value.copy(isLoading = false, asset = asset)
                regeneratePreview()
            } catch (e: Exception) {
                _state.value = _state.value.copy(isLoading = false, error = e.message)
            }
        }
    }

    fun setBarcodeType(type: BarcodeType) {
        _state.value = _state.value.copy(barcodeType = type)
        regeneratePreview()
    }

    fun setLabelSizeIndex(index: Int) {
        _state.value = _state.value.copy(labelSizeIndex = index)
        regeneratePreview()
    }

    fun toggleField(update: (ContentFields) -> ContentFields) {
        _state.value = _state.value.copy(fields = update(_state.value.fields))
        regeneratePreview()
    }

    private fun regeneratePreview() {
        val s = _state.value
        val asset = s.asset ?: return
        val labelSize = AVERY_PRESETS.getOrNull(s.labelSizeIndex) ?: AVERY_PRESETS[3]
        viewModelScope.launch {
            try {
                val bmp = LabelRenderer.render(asset, s.barcodeType, labelSize, s.fields)
                _state.value = _state.value.copy(previewBitmap = bmp)
            } catch (e: Exception) {
                _state.value = _state.value.copy(error = "Preview failed: ${e.message}")
            }
        }
    }

    fun printLabel() {
        val s = _state.value
        val bmp = s.previewBitmap ?: return
        val printer = s.savedPrinter ?: return
        viewModelScope.launch {
            _state.value = _state.value.copy(isPrinting = true, printResult = null)
            val result = printerService.printBitmap(printer.address, bmp)
            _state.value = _state.value.copy(
                isPrinting = false,
                printResult = if (result.isSuccess) "Label printed" else "Print failed: ${result.exceptionOrNull()?.message}",
            )
        }
    }

    fun refreshSavedPrinter() {
        _state.value = _state.value.copy(savedPrinter = printerService.getSavedPrinter())
    }

    fun clearPrintResult() {
        _state.value = _state.value.copy(printResult = null)
    }
}
