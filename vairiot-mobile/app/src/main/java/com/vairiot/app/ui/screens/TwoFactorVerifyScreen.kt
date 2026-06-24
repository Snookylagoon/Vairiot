package com.vairiot.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.vairiot.app.ui.theme.MontserratFamily
import com.vairiot.app.ui.theme.VairiotCharcoal
import com.vairiot.app.ui.theme.VairiotMauve
import com.vairiot.app.ui.theme.VairiotPink
import com.vairiot.app.ui.theme.VairiotViolet

@Composable
fun TwoFactorVerifyScreen(
    challengeToken: String,
    tenantId:       String,
    onSuccess:      () -> Unit,
    onCancel:       () -> Unit,
    viewModel:      TwoFactorVerifyViewModel = hiltViewModel(),
) {
    val ui by viewModel.uiState.collectAsState()
    var code by remember { mutableStateOf("") }

    LaunchedEffect(ui.isLoggedIn) { if (ui.isLoggedIn) onSuccess() }

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
            Text("Two-factor verification",
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
                    Text("Open your authenticator app and enter the 6-digit code for this account.",
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
                        value = code,
                        onValueChange = { v -> if (v.length <= 6 && v.all { it.isDigit() }) code = v },
                        label = { Text("6-digit code") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                        modifier = Modifier.fillMaxWidth(),
                    )

                    Button(
                        onClick  = { viewModel.verify(challengeToken, code, tenantId) },
                        enabled  = !ui.isLoading && code.length == 6,
                        modifier = Modifier.fillMaxWidth().height(48.dp),
                    ) {
                        if (ui.isLoading) {
                            CircularProgressIndicator(modifier = Modifier.size(20.dp),
                                color = MaterialTheme.colorScheme.onPrimary, strokeWidth = 2.dp)
                        } else {
                            Text("Verify", fontWeight = FontWeight.SemiBold)
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
