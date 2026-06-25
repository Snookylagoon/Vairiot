package com.vairiot.app.ui.screens

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vairiot.app.data.api.ForcedPasswordChangeRequest
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

sealed class PasswordChangeResult {
    data object Success : PasswordChangeResult()
    data class TwoFactorRequired(val challengeToken: String, val tenantId: String) : PasswordChangeResult()
    data class TwoFactorSetupRequired(val setupToken: String, val tenantId: String) : PasswordChangeResult()
}

data class ForcedPasswordChangeUiState(
    val isLoading: Boolean = false,
    val error:     String? = null,
    val result:    PasswordChangeResult? = null,
)

@HiltViewModel
class ForcedPasswordChangeViewModel @Inject constructor(
    private val api:        VairiotApiService,
    private val tokenStore: TokenStore,
    private val deviceInfo: DeviceInfoProvider,
) : ViewModel() {

    private val _ui = MutableStateFlow(ForcedPasswordChangeUiState())
    val uiState: StateFlow<ForcedPasswordChangeUiState> = _ui

    fun submit(challengeToken: String, currentPassword: String, newPassword: String, tenantId: String) {
        viewModelScope.launch {
            _ui.value = ForcedPasswordChangeUiState(isLoading = true)
            try {
                val response = api.completeForcedPasswordChange(
                    ForcedPasswordChangeRequest(challengeToken, currentPassword, newPassword, deviceInfo.checkIn()),
                )

                when {
                    response.requiresTwoFactor == true && response.twoFactorChallengeToken != null -> {
                        _ui.value = ForcedPasswordChangeUiState(
                            result = PasswordChangeResult.TwoFactorRequired(response.twoFactorChallengeToken, tenantId),
                        )
                    }
                    response.requiresTwoFactorSetup == true && response.twoFactorSetupToken != null -> {
                        _ui.value = ForcedPasswordChangeUiState(
                            result = PasswordChangeResult.TwoFactorSetupRequired(response.twoFactorSetupToken, tenantId),
                        )
                    }
                    response.accessToken != null && response.refreshToken != null -> {
                        tokenStore.saveTokens(response.accessToken, response.refreshToken, tenantId)
                        _ui.value = ForcedPasswordChangeUiState(result = PasswordChangeResult.Success)
                    }
                    else -> {
                        _ui.value = ForcedPasswordChangeUiState(error = "Unexpected server response.")
                    }
                }
            } catch (e: HttpException) {
                Log.w(TAG, "forced pw change HTTP ${e.code()}", e)
                val msg = when (e.code()) {
                    400  -> "Password must be exactly 12 alphanumeric characters."
                    401  -> "Session expired. Please sign in again."
                    422  -> "New password must be different from the current password."
                    else -> "Password change failed (HTTP ${e.code()})."
                }
                _ui.value = ForcedPasswordChangeUiState(error = msg)
            } catch (e: IOException) {
                Log.w(TAG, "forced pw change network error", e)
                _ui.value = ForcedPasswordChangeUiState(error = "Network error — try again.")
            }
        }
    }

    companion object { private const val TAG = "ForcedPasswordChangeVM" }
}
