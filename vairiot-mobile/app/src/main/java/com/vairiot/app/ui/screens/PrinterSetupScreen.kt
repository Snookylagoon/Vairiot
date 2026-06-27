package com.vairiot.app.ui.screens

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Bluetooth
import androidx.compose.material.icons.filled.BluetoothDisabled
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Print
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.vairiot.app.label.PrinterInfo
import com.vairiot.app.ui.theme.*

@Composable
fun PrinterSetupScreen(
    onBack: () -> Unit,
    viewModel: PrinterSetupViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { viewModel.refresh() }

    Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {

        // Header
        Box(
            modifier = Modifier.fillMaxWidth()
                .background(androidx.compose.ui.graphics.Brush.horizontalGradient(listOf(VairiotCharcoal, VairiotCharcoal)))
                .statusBarsPadding()
                .padding(horizontal = 8.dp, vertical = 8.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = White)
                }
                Text("Printer setup", style = MaterialTheme.typography.titleLarge,
                    fontFamily = MontserratFamily, fontWeight = FontWeight.ExtraBold, color = White)
                Spacer(Modifier.weight(1f))
                IconButton(onClick = { viewModel.refresh() }) {
                    Icon(Icons.Default.Refresh, contentDescription = "Refresh", tint = White)
                }
            }
        }

        Column(
            modifier = Modifier.verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {

            // Bluetooth status
            if (!state.bluetoothAvailable) {
                StatusCard(
                    icon = Icons.Default.BluetoothDisabled,
                    title = "Bluetooth not available",
                    subtitle = "This device does not support Bluetooth.",
                    isError = true,
                )
                return@Column
            }

            if (!state.bluetoothEnabled) {
                StatusCard(
                    icon = Icons.Default.BluetoothDisabled,
                    title = "Bluetooth is off",
                    subtitle = "Turn on Bluetooth in your device settings to find printers.",
                    isError = true,
                )
                return@Column
            }

            if (!state.hasPermissions) {
                Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Bluetooth permissions needed",
                            fontWeight = FontWeight.SemiBold)
                        Text("Grant Bluetooth permissions to discover and connect to printers.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))
                        Button(
                            onClick = {
                                val perms = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                                    arrayOf(
                                        Manifest.permission.BLUETOOTH_CONNECT,
                                        Manifest.permission.BLUETOOTH_SCAN,
                                    )
                                } else {
                                    arrayOf(
                                        Manifest.permission.BLUETOOTH,
                                        Manifest.permission.BLUETOOTH_ADMIN,
                                        Manifest.permission.ACCESS_FINE_LOCATION,
                                    )
                                }
                                permissionLauncher.launch(perms)
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = VairiotViolet),
                            shape = RoundedCornerShape(8.dp),
                        ) {
                            Text("Grant permissions")
                        }
                    }
                }
                return@Column
            }

            // Currently selected printer
            state.savedPrinter?.let { printer ->
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = VairiotWash),
                ) {
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.Check, contentDescription = null,
                                tint = SuccessGreen, modifier = Modifier.size(20.dp))
                            Spacer(Modifier.width(8.dp))
                            Text("Selected printer", fontWeight = FontWeight.SemiBold,
                                color = SuccessGreen)
                        }
                        Text(printer.name, fontWeight = FontWeight.Medium)
                        Text(printer.address, style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                        TextButton(onClick = { viewModel.clearPrinter() }) {
                            Text("Remove", color = ErrorRed)
                        }
                    }
                }
            }

            // Paired devices
            Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Bluetooth, contentDescription = null,
                            tint = VairiotViolet, modifier = Modifier.size(20.dp))
                        Spacer(Modifier.width(8.dp))
                        Text("Paired devices", fontWeight = FontWeight.SemiBold)
                    }
                    Text("Select a Bluetooth printer from your paired devices. " +
                         "Pair your printer in Android Bluetooth settings first.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))

                    if (state.pairedDevices.isEmpty()) {
                        Text("No paired Bluetooth devices found.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f),
                            modifier = Modifier.padding(vertical = 8.dp))
                    } else {
                        state.pairedDevices.forEach { device ->
                            val isSelected = state.savedPrinter?.address == device.address
                            Surface(
                                onClick = { viewModel.selectPrinter(device) },
                                shape = RoundedCornerShape(8.dp),
                                color = if (isSelected) VairiotViolet.copy(alpha = 0.1f) else MaterialTheme.colorScheme.surface,
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Row(
                                    modifier = Modifier.padding(12.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Icon(Icons.Default.Print, contentDescription = null,
                                        modifier = Modifier.size(24.dp),
                                        tint = if (isSelected) VairiotViolet else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f))
                                    Spacer(Modifier.width(12.dp))
                                    Column(Modifier.weight(1f)) {
                                        Text(device.name, fontWeight = FontWeight.Medium)
                                        Text(device.address, style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f))
                                    }
                                    if (isSelected) {
                                        Icon(Icons.Default.Check, contentDescription = "Selected",
                                            tint = VairiotViolet, modifier = Modifier.size(20.dp))
                                    }
                                }
                            }
                        }
                    }
                }
            }

            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
private fun StatusCard(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    subtitle: String,
    isError: Boolean = false,
) {
    Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(icon, contentDescription = null,
                    tint = if (isError) ErrorRed else VairiotViolet,
                    modifier = Modifier.size(24.dp))
                Spacer(Modifier.width(8.dp))
                Text(title, fontWeight = FontWeight.SemiBold,
                    color = if (isError) ErrorRed else VairiotCharcoal)
            }
            Text(subtitle, style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))
        }
    }
}
