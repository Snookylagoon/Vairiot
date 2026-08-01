package com.vairiot.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.Print
import androidx.compose.material.icons.filled.QrCode
import androidx.compose.material.icons.filled.Wifi
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import com.vairiot.app.data.api.AssetResponse
import com.vairiot.app.data.api.Gs1EncodingResponse
import com.vairiot.app.ui.theme.*

@Composable
fun AssetDetailScreen(
    onBack: () -> Unit,
    onEdit: () -> Unit = {},
    onLabel: () -> Unit = {},
    viewModel: AssetDetailViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    val writeState by viewModel.writeState.collectAsState()

    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) viewModel.load()
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {

        Box(
            modifier = Modifier.fillMaxWidth()
                .background(Brush.horizontalGradient(listOf(VairiotCharcoal, VairiotCharcoal)))
                .statusBarsPadding()
                .padding(horizontal = 8.dp, vertical = 8.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = "Back", tint = White)
                }
                Text("Asset", style = MaterialTheme.typography.titleLarge,
                    fontFamily = MontserratFamily, fontWeight = FontWeight.ExtraBold,
                    color = White)
                Spacer(Modifier.weight(1f))
                IconButton(onClick = onLabel) {
                    Icon(Icons.Default.QrCode, contentDescription = "Label", tint = White)
                }
                IconButton(onClick = onEdit) {
                    Icon(Icons.Default.Edit, contentDescription = "Edit", tint = White)
                }
            }
        }

        when (val s = state) {
            is AssetDetailUiState.Loading -> LoadingCard()
            is AssetDetailUiState.Error   -> ErrorCard(s.message, onReset = onBack)
            is AssetDetailUiState.Loaded  -> AssetBody(
                asset = s.asset,
                gs1 = s.gs1,
                onPrintLabel = onLabel,
                supportsTagWrite = viewModel.supportsTagWrite,
                onWriteTag = { viewModel.startRfidWrite() },
            )
        }
    }

    RfidWriteDialogs(
        writeState = writeState,
        onConfirmInternal = { viewModel.confirmInternalBind(it) },
        onDismiss = { viewModel.dismissWrite() },
    )
}

/** Dialogs for the Write RFID tag flow, driven by [RfidWriteState]. */
@Composable
private fun RfidWriteDialogs(
    writeState: RfidWriteState,
    onConfirmInternal: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    when (val w = writeState) {
        is RfidWriteState.Idle -> {}
        is RfidWriteState.Scanning -> AlertDialog(
            onDismissRequest = onDismiss,
            title = { Text("Write RFID tag") },
            text = {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    CircularProgressIndicator(color = VairiotViolet,
                        modifier = Modifier.size(22.dp), strokeWidth = 2.dp)
                    Spacer(Modifier.width(12.dp))
                    Text("Hold the tag against the reader…")
                }
            },
            confirmButton = {},
            dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
        )
        is RfidWriteState.ConfirmInternal -> AlertDialog(
            onDismissRequest = onDismiss,
            title = { Text("Link manufacturer EPC") },
            text = {
                Text(
                    "GS1 is not activated for this workspace yet, so nothing will be " +
                        "written to the tag. The tag's factory-programmed EPC\n\n${w.epcHex}\n\n" +
                        "will be linked to this asset. When GS1 is activated, run " +
                        "Write RFID tag again to encode and lock the GS1 EPC."
                )
            },
            confirmButton = {
                TextButton(onClick = { onConfirmInternal(w.epcHex) }) { Text("Link tag") }
            },
            dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
        )
        is RfidWriteState.Working -> AlertDialog(
            onDismissRequest = {},
            title = { Text("Write RFID tag") },
            text = {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    CircularProgressIndicator(color = VairiotViolet,
                        modifier = Modifier.size(22.dp), strokeWidth = 2.dp)
                    Spacer(Modifier.width(12.dp))
                    Text(w.message)
                }
            },
            confirmButton = {},
        )
        is RfidWriteState.Done -> AlertDialog(
            onDismissRequest = onDismiss,
            title = { Text("Tag ready") },
            text = { Text(w.message) },
            confirmButton = { TextButton(onClick = onDismiss) { Text("OK") } },
        )
        is RfidWriteState.Failed -> AlertDialog(
            onDismissRequest = onDismiss,
            title = { Text("Tag write failed") },
            text = { Text(w.message) },
            confirmButton = { TextButton(onClick = onDismiss) { Text("OK") } },
        )
    }
}

@Composable
private fun AssetBody(
    asset: AssetResponse,
    gs1: Gs1EncodingResponse? = null,
    onPrintLabel: () -> Unit = {},
    supportsTagWrite: Boolean = false,
    onWriteTag: () -> Unit = {},
) {
    Column(modifier = Modifier.verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {

        Card(modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp),
            colors = CardDefaults.cardColors(containerColor = VairiotWash)) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(asset.assetNumber, style = MaterialTheme.typography.labelMedium,
                    color = VairiotViolet, fontWeight = FontWeight.SemiBold)
                Text(asset.name, style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold, color = VairiotCharcoal)
                asset.description?.let {
                    Text(it, style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))
                }
            }
        }

        Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                DetailRow("Status",      asset.status.uppercase())
                DetailRow("Condition",   asset.condition)
                asset.category?.let { DetailRow("Category", it.name) }
                asset.site?.let      { DetailRow("Site",     it.name) }
                asset.location?.let  { DetailRow("Location", it.name) }
                asset.serialNumber?.let { DetailRow("Serial number", it) }
                asset.barcode?.let      { DetailRow("Manufacturer EAN", it) }
                asset.rfidTag?.let      { DetailRow("RFID tag", it) }
            }
        }

        gs1?.let { Gs1IdentityCard(it) }

        Button(
            onClick = onPrintLabel,
            modifier = Modifier.fillMaxWidth().height(50.dp),
            shape = RoundedCornerShape(10.dp),
            colors = ButtonDefaults.buttonColors(containerColor = VairiotViolet),
        ) {
            Icon(Icons.Default.Print, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(8.dp))
            Text("Print label", fontFamily = MontserratFamily, fontWeight = FontWeight.Bold)
        }

        if (supportsTagWrite) {
            OutlinedButton(
                onClick = onWriteTag,
                modifier = Modifier.fillMaxWidth().height(50.dp),
                shape = RoundedCornerShape(10.dp),
            ) {
                Icon(Icons.Default.Wifi, contentDescription = null,
                    modifier = Modifier.size(18.dp), tint = VairiotViolet)
                Spacer(Modifier.width(8.dp))
                Text("Write RFID tag", fontFamily = MontserratFamily,
                    fontWeight = FontWeight.Bold, color = VairiotViolet)
            }
        }

        AssetPhotosSection()

        MaintenanceRequestSection()
    }
}

/**
 * GS1 identity block: HRI, GIAI and Digital Link, mirroring the web asset
 * page. Hidden entirely for assets that predate identifier allocation.
 */
@Composable
private fun Gs1IdentityCard(gs1: Gs1EncodingResponse) {
    Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = VairiotWash)) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Link, contentDescription = null,
                    tint = VairiotViolet, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(6.dp))
                Text("GS1 identity", style = MaterialTheme.typography.labelMedium,
                    color = VairiotCharcoal, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.weight(1f))
                Surface(
                    shape = RoundedCornerShape(6.dp),
                    color = if (gs1.mode == "GS1") SuccessGreen.copy(alpha = 0.15f)
                            else VairiotViolet.copy(alpha = 0.12f),
                ) {
                    Text(
                        if (gs1.mode == "GS1") "GS1" else "Internal",
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
                        style = MaterialTheme.typography.labelSmall,
                        color = if (gs1.mode == "GS1") SuccessGreen else VairiotViolet,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
            Gs1Row("Reference", gs1.hri)
            gs1.giai?.let { Gs1Row("GIAI", it) }
            Gs1Row("Digital Link", gs1.digitalLink)
        }
    }
}

@Composable
private fun Gs1Row(label: String, value: String) {
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(label, style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f))
        Spacer(Modifier.weight(1f))
        Text(value, style = MaterialTheme.typography.bodySmall,
            fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace,
            fontWeight = FontWeight.SemiBold, maxLines = 1,
            overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
            modifier = Modifier.padding(start = 12.dp))
    }
}
