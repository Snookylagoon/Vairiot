package com.vairiot.app.ui.screens

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vairiot.app.data.api.TwoFactorSetupGenerateRequest
import com.vairiot.app.data.api.TwoFactorSetupResponse
import com.vairiot.app.data.api.TwoFactorSetupVerifyRequest
import com.vairiot.app.data.api.VairiotApiService
import com.vairiot.app.data.local.DeviceInfoProvider
import com.vairiot.app.data.local.TokenStore
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import retrofit2.HttpException
import java.io.IOException
import javax.inject.Inject

data class TwoFactorSetupUiState(
    val isLoading:  Boolean = false,
    val setup:      TwoFactorSetupResponse? = null,
    val verifying:  Boolean = false,
    val error:      String? = null,
    val isComplete: Boolean = false,
)

@HiltViewModel
class TwoFactorSetupViewModel @Inject constructor(
    private val api:        VairiotApiService,
    private val tokenStore: TokenStore,
    private val deviceInfo: DeviceInfoProvider,
) : ViewModel() {

    private val _ui = MutableStateFlow(TwoFactorSetupUiState())
    val uiState: StateFlow<TwoFactorSetupUiState> = _ui

    fun generate(setupToken: String) {
        if (_ui.value.setup != null || _ui.value.isLoading) return
        viewModelScope.launch {
            _ui.value = _ui.value.copy(isLoading = true, error = null)
            try {
                val setup = api.generateTwoFactorSetup(TwoFactorSetupGenerateRequest(setupToken))
                _ui.value = _ui.value.copy(isLoading = false, setup = setup)
            } catch (e: HttpException) {
                Log.w(TAG, "generate HTTP ${e.code()}", e)
                _ui.value = _ui.value.copy(
                    isLoading = false,
                    error = if (e.code() == 401) "Setup session expired — please sign in again."
                            else "Could not start 2FA setup (HTTP ${e.code()}).",
                )
            } catch (e: IOException) {
                Log.w(TAG, "generate network error", e)
                _ui.value = _ui.value.copy(isLoading = false, error = "Network error — try again.")
            }
        }
    }

    fun verify(setupToken: String, code: String, tenantId: String) {
        viewModelScope.launch {
            _ui.value = _ui.value.copy(verifying = true, error = null)
            try {
                val response = api.verifyTwoFactorSetup(
                    TwoFactorSetupVerifyRequest(setupToken, code.trim(), deviceInfo.checkIn()),
                )
                val accessToken  = response.accessToken
                val refreshToken = response.refreshToken
                if (accessToken == null || refreshToken == null) {
                    _ui.value = _ui.value.copy(verifying = false, error = "Server did not return tokens.")
                    return@launch
                }
                tokenStore.saveTokens(accessToken, refreshToken, tenantId)
                _ui.value = _ui.value.copy(verifying = false, isComplete = true)
            } catch (e: HttpException) {
                Log.w(TAG, "verify HTTP ${e.code()}", e)
                _ui.value = _ui.value.copy(
                    verifying = false,
                    error = when (e.code()) {
                        400, 422 -> "Invalid 6-digit code. Try again."
                        401      -> "Setup session expired — please sign in again."
                        else     -> "Verification failed (HTTP ${e.code()})."
                    },
                )
            } catch (e: IOException) {
                Log.w(TAG, "verify network error", e)
                _ui.value = _ui.value.copy(verifying = false, error = "Network error — try again.")
            }
        }
    }

    companion object { private const val TAG = "TwoFactorSetupVM" }
}
