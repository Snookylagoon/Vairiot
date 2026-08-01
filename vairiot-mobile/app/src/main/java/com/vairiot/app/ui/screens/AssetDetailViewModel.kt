package com.vairiot.app.ui.screens

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.gson.Gson
import com.vairiot.app.data.Gs1Repository
import com.vairiot.app.data.api.AssetResponse
import com.vairiot.app.data.api.AssetUpdateRequest
import com.vairiot.app.data.api.CommissionTagRequest
import com.vairiot.app.data.api.Gs1EncodingResponse
import com.vairiot.app.data.api.VairiotApiService
import com.vairiot.app.data.api.VerifyTagRequest
import com.vairiot.app.data.local.DeviceInfoProvider
import com.vairiot.app.scanner.ScanType
import com.vairiot.app.scanner.ScannerService
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import retrofit2.HttpException
import javax.inject.Inject

sealed class AssetDetailUiState {
    object Loading : AssetDetailUiState()
    data class Loaded(val asset: AssetResponse, val gs1: Gs1EncodingResponse? = null) : AssetDetailUiState()
    data class Error(val message: String) : AssetDetailUiState()
}

/** Dialog-driven state machine for the "Write RFID tag" commissioning flow. */
sealed class RfidWriteState {
    object Idle : RfidWriteState()
    /** Waiting for a single tag read near the antenna. */
    object Scanning : RfidWriteState()
    /** GS1 not active — asks to link the tag's factory-programmed EPC as-is. */
    data class ConfirmInternal(val epcHex: String) : RfidWriteState()
    data class Working(val message: String) : RfidWriteState()
    data class Done(val message: String) : RfidWriteState()
    data class Failed(val message: String) : RfidWriteState()
}

@HiltViewModel
class AssetDetailViewModel @Inject constructor(
    private val api: VairiotApiService,
    private val gs1Repository: Gs1Repository,
    private val scanner: ScannerService,
    private val deviceInfo: DeviceInfoProvider,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val assetId: String = savedStateHandle["assetId"] ?: ""

    private val _state = MutableStateFlow<AssetDetailUiState>(AssetDetailUiState.Loading)
    val state: StateFlow<AssetDetailUiState> = _state

    private val _writeState = MutableStateFlow<RfidWriteState>(RfidWriteState.Idle)
    val writeState: StateFlow<RfidWriteState> = _writeState

    val supportsTagWrite: Boolean get() = scanner.supportsTagWrite

    init { load() }

    fun load() {
        if (assetId.isBlank()) {
            _state.value = AssetDetailUiState.Error("Missing asset id"); return
        }
        viewModelScope.launch {
            _state.value = AssetDetailUiState.Loading
            try {
                val asset = api.getAsset(assetId)
                _state.value = AssetDetailUiState.Loaded(asset)
                // GS1 identity is derived, never blocking: assets that predate
                // identifier allocation simply have no card.
                val gs1 = asset.individualAssetReference?.let { iar ->
                    gs1Repository.getIdentification()?.let { ident ->
                        gs1Repository.encodeLocally(iar, asset.giai, ident)
                    }
                }
                if (gs1 != null) _state.value = AssetDetailUiState.Loaded(asset, gs1)
            } catch (e: Exception) {
                _state.value = AssetDetailUiState.Error(e.message ?: "Could not load asset")
            }
        }
    }

    /* ── Write RFID tag ─────────────────────────────────────────────────────
     *
     * GS1 mode active (licensed prefix): commission → write GIAI-96 EPC →
     * verify read-back → permalock when the server allows it (spec §8.3).
     * Until GS1 is activated: bind the tag's factory-programmed EPC to the
     * asset as-is — nothing is written to the tag.
     */

    fun startRfidWrite() {
        if (!supportsTagWrite) return
        viewModelScope.launch {
            _writeState.value = RfidWriteState.Scanning
            val previousPower = scanner.getPowerDbm()
            // PROBE profile: low TX power so only the tag at the antenna answers.
            scanner.setPowerDbm(PROBE_POWER_DBM)
            scanner.startScan(ScanType.RFID_UHF)
            val scan = withTimeoutOrNull(SCAN_TIMEOUT_MS) {
                scanner.scanResults.first { it.type == ScanType.RFID_UHF }
            }
            scanner.stopScan()
            previousPower?.let { scanner.setPowerDbm(it) }

            // The user may have cancelled while we waited.
            if (_writeState.value !is RfidWriteState.Scanning) return@launch
            if (scan == null) {
                _writeState.value = RfidWriteState.Failed(
                    "No tag detected. Hold the tag against the reader and try again."
                )
                return@launch
            }
            val epc = scan.value.trim().uppercase()

            val ident = gs1Repository.getIdentification()
            val gs1Active = ident?.mode == "GS1" && ident.activePrefix != null
            if (gs1Active) runGs1Commission(epc)
            else _writeState.value = RfidWriteState.ConfirmInternal(epc)
        }
    }

    /** INTERNAL mode: link the manufacturer's EPC without writing the tag. */
    fun confirmInternalBind(epcHex: String) {
        viewModelScope.launch {
            _writeState.value = RfidWriteState.Working("Linking tag to asset…")
            try {
                api.updateAsset(assetId, AssetUpdateRequest(rfidTag = epcHex))
                _writeState.value = RfidWriteState.Done(
                    "Tag linked using its manufacturer EPC. When GS1 is activated, " +
                        "run Write RFID tag again to encode and lock the GS1 EPC."
                )
                load()
            } catch (e: Exception) {
                _writeState.value = RfidWriteState.Failed(apiError(e, "Could not link the tag"))
            }
        }
    }

    private suspend fun runGs1Commission(epcHex: String) {
        _writeState.value = RfidWriteState.Working("Reading tag TID…")
        val tid = scanner.readTagTid(epcHex).getOrElse {
            _writeState.value = RfidWriteState.Failed(
                "Could not read the tag's TID — hold the tag still against the reader and retry."
            )
            return
        }

        _writeState.value = RfidWriteState.Working("Commissioning tag…")
        val commission = try {
            api.commissionTag(CommissionTagRequest(
                assetId = assetId, tidHex = tid, deviceId = deviceInfo.fingerprint(),
            ))
        } catch (e: Exception) {
            _writeState.value = RfidWriteState.Failed(apiError(e, "Commissioning was rejected"))
            return
        }

        _writeState.value = RfidWriteState.Working("Writing GS1 EPC…")
        var attempts = 0
        var written = false
        while (attempts < WRITE_ATTEMPTS && !written) {
            attempts++
            written = scanner.writeTagEpc(epcHex, commission.epcHex).isSuccess
        }
        if (!written) {
            _writeState.value = RfidWriteState.Failed(
                "EPC write failed after $attempts attempts. The tag is unchanged — try again closer to the reader."
            )
            return
        }

        _writeState.value = RfidWriteState.Working("Verifying write…")
        // A TID read singulated by the NEW EPC proves the write took.
        var readTid: String? = null
        for (i in 1..VERIFY_ATTEMPTS) {
            readTid = scanner.readTagTid(commission.epcHex).getOrNull()
            if (readTid != null) break
        }
        if (readTid == null) {
            _writeState.value = RfidWriteState.Failed(
                "EPC written but the read-back failed. Rescan the asset to verify before relying on this tag."
            )
            return
        }
        try {
            api.verifyTag(commission.tagId, VerifyTagRequest(
                assetId = assetId, readEpcHex = commission.epcHex, readTidHex = readTid,
                writeAttempts = attempts, deviceId = deviceInfo.fingerprint(),
            ))
        } catch (e: Exception) {
            _writeState.value = RfidWriteState.Failed(apiError(e, "Server verification failed"))
            return
        }

        // Permalock is gated server-side (verified + settling period + mode).
        val lockNote = try {
            api.permalockTag(commission.tagId)
            if (scanner.permalockTagEpc(commission.epcHex).isSuccess) "and locked"
            else "— server approved the lock but the reader could not apply it; retry later"
        } catch (e: Exception) {
            "— lock deferred (${apiError(e, "not yet allowed")})"
        }

        _writeState.value = RfidWriteState.Done("GS1 EPC written and verified $lockNote.")
        load()
    }

    fun dismissWrite() {
        if (_writeState.value is RfidWriteState.Scanning) scanner.stopScan()
        _writeState.value = RfidWriteState.Idle
    }

    /** Pull the API's {"error": …} message out of an HTTP failure if present. */
    private fun apiError(e: Exception, fallback: String): String {
        if (e is HttpException) {
            val body = try { e.response()?.errorBody()?.string() } catch (_: Exception) { null }
            val msg = try {
                body?.let { Gson().fromJson(it, Map::class.java)?.get("error") as? String }
            } catch (_: Exception) { null }
            if (!msg.isNullOrBlank()) return msg
        }
        return e.message?.takeIf { it.isNotBlank() }?.let { "$fallback: $it" } ?: fallback
    }

    private companion object {
        const val SCAN_TIMEOUT_MS = 15_000L
        const val PROBE_POWER_DBM = 10
        const val WRITE_ATTEMPTS = 3
        const val VERIFY_ATTEMPTS = 3
    }
}
