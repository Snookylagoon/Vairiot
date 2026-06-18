package com.vairiot.app.ui.screens

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vairiot.app.data.api.LoginRequest
import com.vairiot.app.data.api.VairiotApiService
import com.vairiot.app.data.local.TokenStore
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
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
) : ViewModel() {

    private val _uiState = MutableStateFlow(LoginUiState())
    val uiState: StateFlow<LoginUiState> = _uiState

    fun login(email: String, password: String, tenantId: String) {
        viewModelScope.launch {
            _uiState.value = LoginUiState(isLoading = true)
            try {
                val response = api.login(LoginRequest(email, password, tenantId))
                tokenStore.saveTokens(response.accessToken, response.refreshToken, tenantId)
                _uiState.value = LoginUiState(isLoggedIn = true)
            } catch (e: Exception) {
                _uiState.value = LoginUiState(error = "Invalid credentials. Please check your details.")
            }
        }
    }
}
