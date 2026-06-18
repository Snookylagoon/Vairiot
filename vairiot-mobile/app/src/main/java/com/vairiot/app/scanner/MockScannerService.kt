package com.vairiot.app.scanner

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.launch
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class MockScannerService @Inject constructor() : ScannerService {

    private val _scanResults = MutableSharedFlow<ScanResult>(extraBufferCapacity = 8)
    override val scanResults: SharedFlow<ScanResult> = _scanResults

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    override fun startScan() {
        scope.launch {
            delay(500)
            _scanResults.tryEmit(ScanResult(MOCK_TAG, ScanType.BARCODE))
        }
    }

    override fun stopScan() = Unit

    companion object {
        const val MOCK_TAG = "VAI-MOCK-0001"
    }
}
