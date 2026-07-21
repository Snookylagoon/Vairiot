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
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.vairiot.app.ui.theme.MontserratFamily
import com.vairiot.app.ui.theme.VairiotCharcoal
import com.vairiot.app.ui.theme.VairiotMauve
import com.vairiot.app.ui.theme.VairiotPink
import com.vairiot.app.ui.theme.VairiotViolet

// Mirrors the server password policy (vairiot-api password-policy.service):
// 12–128 chars; under 16 chars must include ≥3 of {lower, upper, digit, symbol};
// 16+ chars accepted on length alone.
private const val PASSWORD_MIN_LENGTH = 12
private const val PASSWORD_MAX_LENGTH = 128
private const val PASSWORD_PASSPHRASE_LENGTH = 16

private fun passwordClassCount(value: String): Int {
    var classes = 0
    if (Regex("[a-z]").containsMatchIn(value)) classes++
    if (Regex("[A-Z]").containsMatchIn(value)) classes++
    if (Regex("[0-9]").containsMatchIn(value)) classes++
    if (Regex("[^A-Za-z0-9]").containsMatchIn(value)) classes++
    return classes
}

fun isValidNewPassword(value: String): Boolean {
    if (value.length < PASSWORD_MIN_LENGTH || value.length > PASSWORD_MAX_LENGTH) return false
    return value.length >= PASSWORD_PASSPHRASE_LENGTH || passwordClassCount(value) >= 3
}

@Composable
fun ForcedPasswordChangeScreen(
    challengeToken:  String,
    currentPassword: String,
    tenantId:        String,
    onSuccess:       () -> Unit,
    onTwoFactorVerify: (challengeToken: String, tenantId: String) -> Unit,
    onTwoFactorSetup:  (setupToken: String, tenantId: String) -> Unit,
    onCancel:        () -> Unit,
    viewModel:       ForcedPasswordChangeViewModel = hiltViewModel(),
) {
    val ui by viewModel.uiState.collectAsState()
    var newPassword     by remember { mutableStateOf("") }
    var confirmPassword by remember { mutableStateOf("") }
    var passwordVisible by remember { mutableStateOf(false) }

    val isValid = isValidNewPassword(newPassword) && newPassword == confirmPassword

    LaunchedEffect(ui.result) {
        when (val r = ui.result) {
            is PasswordChangeResult.Success              -> onSuccess()
            is PasswordChangeResult.TwoFactorRequired    -> onTwoFactorVerify(r.challengeToken, r.tenantId)
            is PasswordChangeResult.TwoFactorSetupRequired -> onTwoFactorSetup(r.setupToken, r.tenantId)
            null -> Unit
        }
    }

    Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        Box(Modifier.fillMaxWidth().height(6.dp)
            .background(Brush.horizontalGradient(listOf(VairiotPink, VairiotMauve, VairiotViolet))))

        Column(
            modifier = Modifier.fillMaxSize().padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Text("VAIRIOT", fontSize = 28.sp, fontWeight = FontWeight.ExtraBold,
                fontFamily = MontserratFamily, color = VairiotCharcoal)
            Text("Set a new password",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
                textAlign = TextAlign.Center, modifier = Modifier.padding(top = 8.dp))

            Spacer(Modifier.height(24.dp))

            Card(
                modifier = Modifier.fillMaxWidth(),
                shape    = RoundedCornerShape(16.dp),
                colors   = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                elevation= CardDefaults.cardElevation(defaultElevation = 2.dp),
            ) {
                Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    Text("Your account requires a password change before you can continue.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))

                    ui.error?.let {
                        Surface(color = MaterialTheme.colorScheme.errorContainer,
                            shape = RoundedCornerShape(8.dp)) {
                            Text(it, modifier = Modifier.padding(12.dp),
                                color = MaterialTheme.colorScheme.onErrorContainer,
                                style = MaterialTheme.typography.bodySmall)
                        }
                    }

                    OutlinedTextField(
                        value = newPassword,
                        onValueChange = { if (it.length <= PASSWORD_MAX_LENGTH) newPassword = it },
                        label = { Text("New password") },
                        supportingText = { Text("At least 12 characters. Under 16 must mix 3 of: lower-case, upper-case, number, symbol.") },
                        visualTransformation = if (passwordVisible) VisualTransformation.None
                                               else PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Password,
                            autoCorrect = false,
                            capitalization = KeyboardCapitalization.None,
                        ),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                        trailingIcon = {
                            IconButton(onClick = { passwordVisible = !passwordVisible }) {
                                Icon(
                                    imageVector = if (passwordVisible) Icons.Default.VisibilityOff
                                                  else Icons.Default.Visibility,
                                    contentDescription = if (passwordVisible) "Hide" else "Show",
                                )
                            }
                        },
                    )

                    OutlinedTextField(
                        value = confirmPassword,
                        onValueChange = { if (it.length <= PASSWORD_MAX_LENGTH) confirmPassword = it },
                        label = { Text("Confirm new password") },
                        supportingText = {
                            if (isValidNewPassword(newPassword) && newPassword == confirmPassword) {
                                Text("Passwords match", color = MaterialTheme.colorScheme.primary)
                            }
                        },
                        visualTransformation = if (passwordVisible) VisualTransformation.None
                                               else PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Password,
                            autoCorrect = false,
                            capitalization = KeyboardCapitalization.None,
                        ),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                        trailingIcon = {
                            IconButton(onClick = { passwordVisible = !passwordVisible }) {
                                Icon(
                                    imageVector = if (passwordVisible) Icons.Default.VisibilityOff
                                                  else Icons.Default.Visibility,
                                    contentDescription = if (passwordVisible) "Hide" else "Show",
                                )
                            }
                        },
                    )

                    Button(
                        onClick  = { viewModel.submit(challengeToken, currentPassword, newPassword, tenantId) },
                        enabled  = !ui.isLoading && isValid,
                        modifier = Modifier.fillMaxWidth().height(48.dp),
                        shape    = RoundedCornerShape(12.dp),
                        colors   = ButtonDefaults.buttonColors(containerColor = VairiotViolet),
                    ) {
                        if (ui.isLoading) {
                            CircularProgressIndicator(modifier = Modifier.size(20.dp),
                                color = MaterialTheme.colorScheme.onPrimary, strokeWidth = 2.dp)
                        } else {
                            Text("Update password & sign in", fontWeight = FontWeight.SemiBold)
                        }
                    }

                    TextButton(onClick = onCancel, modifier = Modifier.fillMaxWidth()) {
                        Text("Back to sign in")
                    }
                }
            }
        }
    }
}
