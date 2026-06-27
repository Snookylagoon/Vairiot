package com.vairiot.app.ui.screens

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Print
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.vairiot.app.label.*
import com.vairiot.app.ui.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LabelDesignScreen(
    onBack: () -> Unit,
    onPrinterSetup: () -> Unit,
    viewModel: LabelDesignViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()

    LaunchedEffect(Unit) { viewModel.refreshSavedPrinter() }

    state.printResult?.let { msg ->
        LaunchedEffect(msg) {
            kotlinx.coroutines.delay(3000)
            viewModel.clearPrintResult()
        }
    }

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
                Text("Label Design", style = MaterialTheme.typography.titleLarge,
                    fontFamily = MontserratFamily, fontWeight = FontWeight.ExtraBold, color = White)
                Spacer(Modifier.weight(1f))
                IconButton(onClick = onPrinterSetup) {
                    Icon(Icons.Default.Settings, contentDescription = "Printer setup", tint = White)
                }
            }
        }

        if (state.isLoading) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = VairiotViolet)
            }
            return
        }

        state.error?.let { err ->
            Surface(color = ErrorRed.copy(alpha = 0.12f), shape = RoundedCornerShape(8.dp),
                modifier = Modifier.padding(16.dp).fillMaxWidth()) {
                Text(err, modifier = Modifier.padding(12.dp), color = ErrorRed,
                    style = MaterialTheme.typography.bodySmall)
            }
        }

        Column(
            modifier = Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {

            // Preview
            state.previewBitmap?.let { bmp ->
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = VairiotWash),
                ) {
                    Column(modifier = Modifier.padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("Preview", style = MaterialTheme.typography.labelMedium,
                            color = VairiotViolet, fontWeight = FontWeight.SemiBold)
                        Spacer(Modifier.height(8.dp))
                        Image(
                            bitmap = bmp.asImageBitmap(),
                            contentDescription = "Label preview",
                            modifier = Modifier.fillMaxWidth()
                                .clip(RoundedCornerShape(4.dp))
                                .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.3f), RoundedCornerShape(4.dp)),
                        )
                    }
                }
            }

            // Barcode Standard
            Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Barcode standard", style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.SemiBold)
                    BarcodeTypeDropdown(
                        selected = state.barcodeType,
                        onSelect = { viewModel.setBarcodeType(it) },
                    )
                }
            }

            // Label Size
            Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Label size", style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.SemiBold)
                    LabelSizeDropdown(
                        selectedIndex = state.labelSizeIndex,
                        onSelect = { viewModel.setLabelSizeIndex(it) },
                    )
                }
            }

            // Content Fields
            Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("Show on label", style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.height(4.dp))
                    FieldToggle("Asset name", state.fields.name) { viewModel.toggleField { f -> f.copy(name = it) } }
                    FieldToggle("Asset number", state.fields.assetNumber) { viewModel.toggleField { f -> f.copy(assetNumber = it) } }
                    FieldToggle("Serial number", state.fields.serialNumber) { viewModel.toggleField { f -> f.copy(serialNumber = it) } }
                    FieldToggle("Barcode value", state.fields.barcode) { viewModel.toggleField { f -> f.copy(barcode = it) } }
                    FieldToggle("Site", state.fields.site) { viewModel.toggleField { f -> f.copy(site = it) } }
                    FieldToggle("Category", state.fields.category) { viewModel.toggleField { f -> f.copy(category = it) } }
                }
            }

            // Printer Info
            Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Printer", style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.SemiBold)
                    if (state.savedPrinter != null) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(state.savedPrinter!!.name, fontWeight = FontWeight.Medium)
                                Text(state.savedPrinter!!.address,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                            }
                            TextButton(onClick = onPrinterSetup) { Text("Change") }
                        }
                    } else {
                        OutlinedButton(onClick = onPrinterSetup, modifier = Modifier.fillMaxWidth()) {
                            Icon(Icons.Default.Settings, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(8.dp))
                            Text("Find printer")
                        }
                    }
                }
            }

            // Print result message
            state.printResult?.let { msg ->
                val isError = msg.startsWith("Print failed")
                Surface(
                    color = if (isError) ErrorRed.copy(alpha = 0.12f) else SuccessGreen.copy(alpha = 0.12f),
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(msg, modifier = Modifier.padding(12.dp),
                        color = if (isError) ErrorRed else SuccessGreen,
                        style = MaterialTheme.typography.bodySmall)
                }
            }

            Spacer(Modifier.height(8.dp))
        }

        // Print button pinned to bottom
        Surface(tonalElevation = 4.dp, shadowElevation = 4.dp) {
            Button(
                onClick = { viewModel.printLabel() },
                enabled = !state.isPrinting && state.previewBitmap != null && state.savedPrinter != null,
                modifier = Modifier.fillMaxWidth().padding(16.dp).height(50.dp),
                shape = RoundedCornerShape(10.dp),
                colors = ButtonDefaults.buttonColors(containerColor = VairiotViolet),
            ) {
                if (state.isPrinting) {
                    CircularProgressIndicator(color = White, modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                    Spacer(Modifier.width(8.dp))
                    Text("Printing…", fontFamily = MontserratFamily, fontWeight = FontWeight.Bold)
                } else {
                    Icon(Icons.Default.Print, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Print label", fontFamily = MontserratFamily, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun BarcodeTypeDropdown(selected: BarcodeType, onSelect: (BarcodeType) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = it }) {
        OutlinedTextField(
            value = selected.label,
            onValueChange = {},
            readOnly = true,
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded) },
            modifier = Modifier.menuAnchor().fillMaxWidth(),
        )
        ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            BarcodeType.entries.forEach { type ->
                DropdownMenuItem(
                    text = { Text("${type.label} (${type.group})") },
                    onClick = { onSelect(type); expanded = false },
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun LabelSizeDropdown(selectedIndex: Int, onSelect: (Int) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    val selectedLabel = AVERY_PRESETS.getOrNull(selectedIndex)?.label ?: ""
    ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = it }) {
        OutlinedTextField(
            value = selectedLabel,
            onValueChange = {},
            readOnly = true,
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded) },
            modifier = Modifier.menuAnchor().fillMaxWidth(),
        )
        ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            AVERY_PRESETS.forEachIndexed { i, preset ->
                DropdownMenuItem(
                    text = { Text(preset.label) },
                    onClick = { onSelect(i); expanded = false },
                )
            }
        }
    }
}

@Composable
private fun FieldToggle(label: String, checked: Boolean, onToggle: (Boolean) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Checkbox(
            checked = checked,
            onCheckedChange = onToggle,
            colors = CheckboxDefaults.colors(checkedColor = VairiotViolet),
        )
        Text(label, modifier = Modifier.padding(start = 4.dp))
    }
}
