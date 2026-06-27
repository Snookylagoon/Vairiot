package com.vairiot.app.ui.screens

import androidx.lifecycle.ViewModel
import com.vairiot.app.label.PrinterInfo
import com.vairiot.app.label.PrinterService
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import javax.inject.Inject

data class PrinterSetupUiState(
    val bluetoothAvailable: Boolean = true,
    val bluetoothEnabled: Boolean = true,
    val hasPermissions: Boolean = true,
    val pairedDevices: List<PrinterInfo> = emptyList(),
    val savedPrinter: PrinterInfo? = null,
)

@HiltViewModel
class PrinterSetupViewModel @Inject constructor(
    private val printerService: PrinterService,
) : ViewModel() {

    private val _state = MutableStateFlow(PrinterSetupUiState())
    val state: StateFlow<PrinterSetupUiState> = _state

    init { refresh() }

    fun refresh() {
        _state.value = PrinterSetupUiState(
            bluetoothAvailable = printerService.isBluetoothAvailable(),
            bluetoothEnabled = printerService.isBluetoothEnabled(),
            hasPermissions = printerService.hasPermissions(),
            pairedDevices = printerService.getPairedPrinters(),
            savedPrinter = printerService.getSavedPrinter(),
        )
    }

    fun selectPrinter(printer: PrinterInfo) {
        printerService.savePrinter(printer)
        _state.value = _state.value.copy(savedPrinter = printer)
    }

    fun clearPrinter() {
        printerService.clearSavedPrinter()
        _state.value = _state.value.copy(savedPrinter = null)
    }
}
