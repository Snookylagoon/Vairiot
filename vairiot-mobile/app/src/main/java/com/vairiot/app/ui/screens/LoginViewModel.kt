package com.vairiot.app.ui.screens

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vairiot.app.data.api.LoginRequest
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

data class LoginUiState(
    val isLoading:    Boolean = false,
    val error:        String? = null,
    val isLoggedIn:   Boolean = false,
)

@HiltViewModel
class LoginViewModel @Inject constructor(
    private val api:        VairiotApiService,
    private val tokenStore: TokenStore,
    private val deviceInfo: DeviceInfoProvider,
) : ViewModel() {

    private val _uiState = MutableStateFlow(LoginUiState())
    val uiState: StateFlow<LoginUiState> = _uiState

    fun login(email: String, password: String, tenantId: String) {
        viewModelScope.launch {
            _uiState.value = LoginUiState(isLoading = true)
            try {
                val response = api.login(LoginRequest(email, password, tenantId, deviceInfo.checkIn()))
                tokenStore.saveTokens(response.accessToken, response.refreshToken, tenantId)
                _uiState.value = LoginUiState(isLoggedIn = true)
            } catch (e: HttpException) {
                Log.w(TAG, "Login HTTP ${e.code()}: ${e.message()}", e)
                val msg = when (e.code()) {
                    401  -> "Invalid email, password, or organisation ID."
                    400  -> "Please check the details and try again."
                    in 500..599 -> "Server error (${e.code()}). Please try again shortly."
                    else -> "Login failed (HTTP ${e.code()})."
                }
                _uiState.value = LoginUiState(error = msg)
            } catch (e: IOException) {
                Log.w(TAG, "Login network error: ${e.message}", e)
                _uiState.value = LoginUiState(
                    error = "Cannot reach the server. Check the API is running and you are on the right network. (${e.message})"
                )
            } catch (e: Exception) {
                Log.e(TAG, "Login unexpected error", e)
                _uiState.value = LoginUiState(error = "Unexpected error: ${e.message}")
            }
        }
    }

    companion object { private const val TAG = "LoginViewModel" }
}
