package com.vairiot.app.ui.screens

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
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
import com.vairiot.app.util.encodeQrToImageBitmap

@Composable
fun TwoFactorSetupScreen(
    setupToken:  String,
    tenantId:    String,
    onComplete:  () -> Unit,
    onCancel:    () -> Unit,
    viewModel:   TwoFactorSetupViewModel = hiltViewModel(),
) {
    val ui by viewModel.uiState.collectAsState()
    var code by remember { mutableStateOf("") }

    LaunchedEffect(setupToken) { viewModel.generate(setupToken) }
    LaunchedEffect(ui.isComplete) { if (ui.isComplete) onComplete() }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .verticalScroll(rememberScrollState()),
    ) {
        Box(Modifier.fillMaxWidth().height(6.dp)
            .background(Brush.horizontalGradient(listOf(VairiotPink, VairiotMauve, VairiotViolet))))

        Column(
            modifier = Modifier.fillMaxWidth().padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text("VAIRIOT", fontSize = 28.sp, fontWeight = FontWeight.ExtraBold,
                fontFamily = MontserratFamily, color = VairiotCharcoal)
            Text("Set up two-factor authentication",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
                textAlign = TextAlign.Center, modifier = Modifier.padding(top = 8.dp))

            Spacer(Modifier.height(16.dp))

            Card(
                modifier = Modifier.fillMaxWidth(),
                shape    = RoundedCornerShape(16.dp),
                colors   = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                elevation= CardDefaults.cardElevation(defaultElevation = 2.dp),
            ) {
                Column(
                    modifier = Modifier.padding(20.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    Text(
                        "Your account requires 2FA. Scan the QR code below with Google " +
                        "Authenticator, Authy, 1Password, or any TOTP app, then enter the " +
                        "6-digit code it generates.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
                    )

                    if (ui.isLoading) {
                        Box(Modifier.fillMaxWidth().padding(32.dp), Alignment.Center) {
                            CircularProgressIndicator()
                        }
                    }

                    ui.error?.let {
                        Surface(color = MaterialTheme.colorScheme.errorContainer,
                            shape = RoundedCornerShape(8.dp)) {
                            Text(it, modifier = Modifier.padding(12.dp),
                                color = MaterialTheme.colorScheme.onErrorContainer,
                                style = MaterialTheme.typography.bodySmall)
                        }
                    }

                    val setup = ui.setup
                    if (setup != null) {
                        // QR code
                        val qr = remember(setup.otpauthUrl) { encodeQrToImageBitmap(setup.otpauthUrl, 600) }
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(Color.White, RoundedCornerShape(12.dp))
                                .padding(12.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            Image(
                                bitmap = qr,
                                contentDescription = "2FA QR code",
                                modifier = Modifier.size(220.dp),
                            )
                        }

                        // Manual entry secret
                        Column {
                            Text("Or enter manually:",
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                            Text(
                                setup.secret.chunked(4).joinToString(" "),
                                fontFamily = FontFamily.Monospace,
                                style = MaterialTheme.typography.bodyLarge,
                                modifier = Modifier.padding(top = 2.dp),
                            )
                        }

                        // Backup codes
                        Surface(
                            color = MaterialTheme.colorScheme.surfaceVariant,
                            shape = RoundedCornerShape(8.dp),
                        ) {
                            Column(Modifier.padding(12.dp)) {
                                Text("Recovery codes — save these somewhere safe.",
                                    style = MaterialTheme.typography.labelMedium,
                                    fontWeight = FontWeight.SemiBold)
                                Text(
                                    setup.backupCodes.joinToString("   "),
                                    fontFamily = FontFamily.Monospace,
                                    style = MaterialTheme.typography.bodySmall,
                                    modifier = Modifier.padding(top = 4.dp),
                                )
                            }
                        }

                        // Code entry
                        OutlinedTextField(
                            value = code,
                            onValueChange = { v -> if (v.length <= 6 && v.all { it.isDigit() }) code = v },
                            label = { Text("6-digit code") },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                            modifier = Modifier.fillMaxWidth(),
                        )

                        Button(
                            onClick  = { viewModel.verify(setupToken, code, tenantId) },
                            enabled  = !ui.verifying && code.length == 6,
                            modifier = Modifier.fillMaxWidth().height(48.dp),
                        ) {
                            if (ui.verifying) {
                                CircularProgressIndicator(modifier = Modifier.size(20.dp),
                                    color = MaterialTheme.colorScheme.onPrimary, strokeWidth = 2.dp)
                            } else {
                                Text("Verify and continue", fontWeight = FontWeight.SemiBold)
                            }
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
