package com.vairiot.app.ui.screens

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vairiot.app.data.api.TwoFactorLoginRequest
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

data class TwoFactorVerifyUiState(
    val isLoading: Boolean = false,
    val error:     String? = null,
    val isLoggedIn:Boolean = false,
)

@HiltViewModel
class TwoFactorVerifyViewModel @Inject constructor(
    private val api:        VairiotApiService,
    private val tokenStore: TokenStore,
    private val deviceInfo: DeviceInfoProvider,
) : ViewModel() {

    private val _ui = MutableStateFlow(TwoFactorVerifyUiState())
    val uiState: StateFlow<TwoFactorVerifyUiState> = _ui

    fun verify(challengeToken: String, code: String, tenantId: String) {
        viewModelScope.launch {
            _ui.value = TwoFactorVerifyUiState(isLoading = true)
            try {
                val response = api.loginWithTwoFactor(
                    TwoFactorLoginRequest(challengeToken, code.trim(), deviceInfo.checkIn()),
                )
                val accessToken  = response.accessToken
                val refreshToken = response.refreshToken
                if (accessToken == null || refreshToken == null) {
                    _ui.value = TwoFactorVerifyUiState(error = "Server did not return tokens.")
                    return@launch
                }
                tokenStore.saveTokens(accessToken, refreshToken, tenantId)
                _ui.value = TwoFactorVerifyUiState(isLoggedIn = true)
            } catch (e: HttpException) {
                Log.w(TAG, "verify HTTP ${e.code()}", e)
                _ui.value = TwoFactorVerifyUiState(
                    error = when (e.code()) {
                        400, 401, 422 -> "Invalid 6-digit code. Try again."
                        else          -> "Verification failed (HTTP ${e.code()})."
                    },
                )
            } catch (e: IOException) {
                Log.w(TAG, "verify network error", e)
                _ui.value = TwoFactorVerifyUiState(error = "Network error — try again.")
            }
        }
    }

    companion object { private const val TAG = "TwoFactorVerifyVM" }
}
