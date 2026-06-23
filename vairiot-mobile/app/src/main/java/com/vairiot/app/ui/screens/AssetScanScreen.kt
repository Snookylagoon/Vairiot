package com.vairiot.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.vairiot.app.LocalUseSideRail
import com.vairiot.app.data.api.AssetResponse
import com.vairiot.app.ui.theme.*

@Composable
fun AssetScanScreen(viewModel: AssetScanViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsState()
    var manualQuery by remember { mutableStateOf("") }
    val sideRail = LocalUseSideRail.current

    Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {

        if (!sideRail) {
            // Gradient header
            Box(
                modifier = Modifier.fillMaxWidth()
                    .background(Brush.horizontalGradient(listOf(VairiotCharcoal, VairiotCharcoal)))
                    .padding(16.dp),
            ) {
                Column {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier.height(32.dp).width(4.dp)
                                .background(Brush.verticalGradient(listOf(VairiotPink, VairiotViolet)),
                                    RoundedCornerShape(2.dp))
                        )
                        Spacer(Modifier.width(12.dp))
                        Text("VAIRIOT", style = MaterialTheme.typography.titleLarge,
                            fontFamily = MontserratFamily, fontWeight = FontWeight.ExtraBold,
                            color = White)
                    }
                    Spacer(Modifier.height(4.dp))
                    Text("Asset Scanner", style = MaterialTheme.typography.bodySmall,
                        color = White.copy(alpha = 0.6f))
                }
            }
        }

        Column(modifier = Modifier.fillMaxSize().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)) {

            // Manual lookup
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = manualQuery, onValueChange = { manualQuery = it },
                    label = { Text("Barcode or RFID tag") },
                    modifier = Modifier.weight(1f), singleLine = true,
                )
                Button(onClick = { viewModel.lookupManual(manualQuery) },
                    enabled = manualQuery.isNotBlank(),
                    colors = ButtonDefaults.buttonColors(containerColor = VairiotViolet)) {
                    Icon(Icons.Default.Search, contentDescription = "Search")
                }
            }

            // Scan trigger buttons — each disabled if the underlying hardware
            // doesn't support that scan type (e.g. ME65 has no UHF RFID).
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = { viewModel.triggerScan() },
                    enabled = viewModel.supportsRfid,
                    modifier = Modifier.weight(1f).height(56.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = VairiotPink),
                ) {
                    Icon(Icons.Default.QrCodeScanner, contentDescription = null,
                        modifier = Modifier.size(22.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(if (viewModel.supportsRfid) "RFID" else "RFID (n/a)",
                        fontFamily = MontserratFamily, fontWeight = FontWeight.Bold)
                }
                Button(
                    onClick = { viewModel.triggerBarcodeScan() },
                    enabled = viewModel.supportsBarcode,
                    modifier = Modifier.weight(1f).height(56.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = VairiotViolet),
                ) {
                    Icon(Icons.Default.QrCode2, contentDescription = null,
                        modifier = Modifier.size(22.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(if (viewModel.supportsBarcode) "Barcode" else "Barcode (n/a)",
                        fontFamily = MontserratFamily, fontWeight = FontWeight.Bold)
                }
            }

            // Result area
            when (val s = state) {
                is ScanUiState.Idle       -> IdleCard()
                is ScanUiState.Scanning   -> ScanningCard(expecting = s.expecting, onCancel = { viewModel.cancelScan() })
                is ScanUiState.Loading    -> LoadingCard()
                is ScanUiState.Found      -> AssetResultCard(s.asset, onReset = { viewModel.reset() })
                is ScanUiState.NotFound   -> NotFoundCard(
                    value = s.value,
                    isRfid = s.isRfid,
                    secondaryValue = s.secondaryValue,
                    onReset    = { viewModel.reset() },
                    onRegister = { name, secondary ->
                        viewModel.registerAsset(name, s.value, s.isRfid, secondary)
                    },
                    onScanSecondary = { viewModel.scanSecondary() },
                    onClearSecondary = { viewModel.clearSecondary() },
                )
                is ScanUiState.Registering -> LoadingCard()
                is ScanUiState.Registered  -> AssetResultCard(s.asset, onReset = { viewModel.reset() }, isNew = true)
                is ScanUiState.Error      -> ErrorCard(s.message, onReset = { viewModel.reset() })
            }
        }
    }
}

@Composable
fun IdleCard() {
    Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
        Column(modifier = Modifier.padding(24.dp).fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(Icons.Default.QrCodeScanner, contentDescription = null,
                modifier = Modifier.size(48.dp), tint = VairiotViolet.copy(alpha = 0.4f))
            Text("Ready to scan", style = MaterialTheme.typography.titleMedium, color = VairiotCharcoal)
            Text("Press Scan Tag or use the hardware trigger",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f))
        }
    }
}

@Composable
fun LoadingCard() {
    Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
        Row(modifier = Modifier.padding(24.dp), verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            CircularProgressIndicator(color = VairiotViolet, modifier = Modifier.size(24.dp))
            Text("Looking up asset…", style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
fun ScanningCard(expecting: com.vairiot.app.scanner.ScanType, onCancel: () -> Unit) {
    val title = if (expecting == com.vairiot.app.scanner.ScanType.BARCODE)
        "Waiting for barcode…" else "Waiting for RFID tag…"
    val hint = if (expecting == com.vairiot.app.scanner.ScanType.BARCODE)
        "Press the device's hardware trigger and point at a barcode."
    else
        "Press the device's hardware trigger to read an RFID tag, or type the value above and tap the search icon."
    Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
        Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                CircularProgressIndicator(color = VairiotPink, modifier = Modifier.size(24.dp))
                Text(title, style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold)
            }
            Text(hint,
                style = MaterialTheme.typography.bodySmall,
                color  = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
            )
            TextButton(onClick = onCancel) { Text("Cancel") }
        }
    }
}

@Composable
fun AssetResultCard(asset: AssetResponse, onReset: () -> Unit, isNew: Boolean = false) {
    Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = VairiotWash)) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Icon(Icons.Default.CheckCircle, contentDescription = null,
                    tint = SuccessGreen, modifier = Modifier.size(22.dp))
                Text(if (isNew) "Asset Registered" else "Asset Found",
                    style = MaterialTheme.typography.titleMedium, color = SuccessGreen)
            }
            HorizontalDivider()
            DetailRow("Asset No.",   asset.assetNumber)
            DetailRow("Name",        asset.name)
            DetailRow("Status",      asset.status)
            DetailRow("Condition",   asset.condition)
            asset.category?.let { DetailRow("Category", it.name) }
            asset.site?.let      { DetailRow("Site",     it.name) }
            asset.serialNumber?.let { DetailRow("Serial", it) }
            Spacer(Modifier.height(4.dp))
            TextButton(onClick = onReset) { Text("Scan Another") }
        }
    }
}

@Composable
fun NotFoundCard(
    value: String,
    isRfid: Boolean,
    secondaryValue: String? = null,
    onReset: () -> Unit,
    onRegister: (String, String?) -> Unit,
    onScanSecondary: () -> Unit = {},
    onClearSecondary: () -> Unit = {},
) {
    var showDialog by remember { mutableStateOf(false) }
    var assetName by remember { mutableStateOf("") }
    var manualSecondary by remember { mutableStateOf("") }

    val primaryLabel   = if (isRfid) "RFID Tag" else "Barcode"
    val secondaryLabel = if (isRfid) "Barcode" else "RFID Tag"
    val secondaryFinal = secondaryValue ?: manualSecondary.ifBlank { null }

    Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Icon(Icons.Default.SearchOff, contentDescription = null,
                    tint = WarningAmber, modifier = Modifier.size(22.dp))
                Text("Not Registered", style = MaterialTheme.typography.titleMedium,
                    color = WarningAmber)
            }
            Text("$primaryLabel: $value", style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
            Text("This $primaryLabel is not assigned to any asset in the system.",
                style = MaterialTheme.typography.bodyMedium)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = { showDialog = true },
                    colors = ButtonDefaults.buttonColors(containerColor = VairiotViolet),
                ) {
                    Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("Register Asset")
                }
                TextButton(onClick = onReset) { Text("Scan Another") }
            }
        }
    }

    if (showDialog) {
        AlertDialog(
            onDismissRequest = { showDialog = false },
            title = { Text("Register New Asset") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("$primaryLabel: $value", style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                    OutlinedTextField(
                        value = assetName,
                        onValueChange = { assetName = it },
                        label = { Text("Asset Name") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )

                    HorizontalDivider()

                    Text("$secondaryLabel (optional)", style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))

                    if (secondaryValue != null) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Icon(Icons.Default.CheckCircle, contentDescription = null,
                                tint = SuccessGreen, modifier = Modifier.size(18.dp))
                            Text(secondaryValue, style = MaterialTheme.typography.bodyMedium,
                                modifier = Modifier.weight(1f))
                            IconButton(onClick = { onClearSecondary() }) {
                                Icon(Icons.Default.Close, contentDescription = "Clear",
                                    modifier = Modifier.size(18.dp))
                            }
                        }
                    } else {
                        OutlinedTextField(
                            value = manualSecondary,
                            onValueChange = { manualSecondary = it },
                            label = { Text(secondaryLabel) },
                            placeholder = { Text("Scan or type $secondaryLabel") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        OutlinedButton(
                            onClick = onScanSecondary,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Icon(Icons.Default.QrCodeScanner, contentDescription = null,
                                modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(8.dp))
                            Text("Scan $secondaryLabel")
                        }
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = { showDialog = false; onRegister(assetName, secondaryFinal) },
                    enabled = assetName.isNotBlank(),
                    colors = ButtonDefaults.buttonColors(containerColor = VairiotViolet),
                ) { Text("Register") }
            },
            dismissButton = {
                TextButton(onClick = { showDialog = false }) { Text("Cancel") }
            },
        )
    }
}

@Composable
fun ErrorCard(message: String, onReset: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(message, style = MaterialTheme.typography.bodyMedium, color = ErrorRed)
            TextButton(onClick = onReset) { Text("Try Again") }
        }
    }
}

@Composable
fun DetailRow(label: String, value: String) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f))
        Text(value, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold)
    }
}
