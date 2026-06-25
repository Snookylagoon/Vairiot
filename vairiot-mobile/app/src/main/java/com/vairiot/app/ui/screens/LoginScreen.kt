package com.vairiot.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.vairiot.app.ui.theme.*

@Composable
fun LoginScreen(
    onLoginSuccess: () -> Unit,
    onTwoFactorSetup: (setupToken: String, tenantId: String) -> Unit = { _, _ -> },
    onTwoFactorVerify: (challengeToken: String, tenantId: String) -> Unit = { _, _ -> },
    onPasswordChange: (challengeToken: String, currentPassword: String, tenantId: String) -> Unit = { _, _, _ -> },
    viewModel: LoginViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()
    var email    by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var tenantId by remember { mutableStateOf("") }
    var passwordVisible by remember { mutableStateOf(false) }

    LaunchedEffect(uiState.isLoggedIn) {
        if (uiState.isLoggedIn) onLoginSuccess()
    }

    LaunchedEffect(uiState.challenge) {
        when (val ch = uiState.challenge) {
            is LoginChallenge.TwoFactorSetup  -> {
                onTwoFactorSetup(ch.setupToken, ch.tenantId)
                viewModel.resetChallenge()
            }
            is LoginChallenge.TwoFactorVerify -> {
                onTwoFactorVerify(ch.challengeToken, ch.tenantId)
                viewModel.resetChallenge()
            }
            is LoginChallenge.PasswordChange -> {
                onPasswordChange(ch.challengeToken, ch.currentPassword, ch.tenantId)
                viewModel.resetChallenge()
            }
            null -> Unit
        }
    }

    Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {

        // Gradient header band
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(6.dp)
                .background(Brush.horizontalGradient(listOf(VairiotPink, VairiotMauve, VairiotViolet)))
        )

        Column(
            modifier = Modifier.fillMaxSize().padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {

            // Wordmark
            Row {
                Text("VAIR", fontSize = 36.sp, fontWeight = FontWeight.ExtraBold,
                    fontFamily = MontserratFamily, color = VairiotCharcoal)
                Text("IOT", fontSize = 36.sp, fontWeight = FontWeight.ExtraBold,
                    fontFamily = MontserratFamily,
                    style = MaterialTheme.typography.displayLarge.copy(
                        brush = Brush.horizontalGradient(listOf(VairiotPink, VairiotMauve, VairiotViolet)),
                        fontSize = 36.sp,
                    )
                )
            }
            Text("Asset Intelligence", style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))

            Spacer(Modifier.height(40.dp))

            // Login card
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape    = RoundedCornerShape(16.dp),
                colors   = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                elevation= CardDefaults.cardElevation(defaultElevation = 2.dp),
            ) {
                Column(modifier = Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {

                    Text("Sign in", style = MaterialTheme.typography.titleLarge)

                    uiState.error?.let {
                        Surface(color = MaterialTheme.colorScheme.errorContainer,
                            shape = RoundedCornerShape(8.dp)) {
                            Text(it, modifier = Modifier.padding(12.dp),
                                color = MaterialTheme.colorScheme.onErrorContainer,
                                style = MaterialTheme.typography.bodySmall)
                        }
                    }

                    OutlinedTextField(value = tenantId, onValueChange = { tenantId = it },
                        label = { Text("Organisation ID") },
                        modifier = Modifier.fillMaxWidth(), singleLine = true)

                    OutlinedTextField(value = email, onValueChange = { email = it.trim() },
                        label = { Text("Email") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email,
                            autoCorrect = false, capitalization = KeyboardCapitalization.None),
                        modifier = Modifier.fillMaxWidth(), singleLine = true)

                    OutlinedTextField(value = password, onValueChange = { password = it },
                        label = { Text("Password") },
                        visualTransformation = if (passwordVisible) VisualTransformation.None
                                               else PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password,
                            autoCorrect = false, capitalization = KeyboardCapitalization.None),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                        trailingIcon = {
                            IconButton(onClick = { passwordVisible = !passwordVisible }) {
                                Icon(
                                    imageVector = if (passwordVisible) Icons.Default.VisibilityOff
                                                  else Icons.Default.Visibility,
                                    contentDescription = if (passwordVisible) "Hide password"
                                                         else "Show password",
                                )
                            }
                        },
                    )

                    Button(
                        onClick  = { viewModel.login(email, password, tenantId) },
                        enabled  = !uiState.isLoading && email.isNotBlank() && password.isNotBlank() && tenantId.isNotBlank(),
                        modifier = Modifier.fillMaxWidth().height(50.dp),
                        shape    = RoundedCornerShape(12.dp),
                        colors   = ButtonDefaults.buttonColors(containerColor = VairiotViolet),
                    ) {
                        if (uiState.isLoading) {
                            CircularProgressIndicator(modifier = Modifier.size(20.dp),
                                color = White, strokeWidth = 2.dp)
                        } else {
                            Text("Sign in", fontFamily = MontserratFamily,
                                fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }
    }
}
