package com.vairiot.app.ui.screens

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
import androidx.compose.material.icons.filled.Refresh
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
import com.vairiot.app.data.api.LabelTemplateDto
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
                Text("Print Label", style = MaterialTheme.typography.titleLarge,
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

            // Template picker — templates come from the web designer
            Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                        Text("Template", style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                        if (state.isRefreshingTemplates) {
                            CircularProgressIndicator(color = VairiotViolet,
                                modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                        } else {
                            IconButton(onClick = { viewModel.refreshTemplates() }, modifier = Modifier.size(24.dp)) {
                                Icon(Icons.Default.Refresh, contentDescription = "Refresh templates",
                                    tint = VairiotViolet, modifier = Modifier.size(18.dp))
                            }
                        }
                    }
                    if (state.templates.isEmpty()) {
                        Text(
                            "No label templates yet. Templates are designed in the Vairiot web app " +
                            "under Asset Labels and appear here automatically once saved.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
                        )
                    } else {
                        TemplateDropdown(
                            templates = state.templates,
                            selectedId = state.selectedTemplateId,
                            onSelect = { viewModel.selectTemplate(it) },
                        )
                        val copies = state.selectedTemplate?.config?.printer?.copies ?: 1
                        if (copies > 1) {
                            Text("Prints ${copies.coerceIn(1, 20)} copies per label",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                        }
                    }
                }
            }

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

            // Printer Info
            Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Printer", style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.SemiBold)
                    val printer = state.effectivePrinter
                    if (printer != null) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(printer.name, fontWeight = FontWeight.Medium)
                                Text(printer.address,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                                if (state.matchedPrinter != null) {
                                    Text("Selected by the template",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = VairiotViolet)
                                }
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
                    state.printerHint?.let { hint ->
                        Text(hint, style = MaterialTheme.typography.bodySmall, color = WarningAmber)
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
                enabled = !state.isPrinting && state.selectedTemplate != null &&
                          state.previewBitmap != null && state.effectivePrinter != null,
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
private fun TemplateDropdown(
    templates: List<LabelTemplateDto>,
    selectedId: String?,
    onSelect: (String) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    val selectedName = templates.firstOrNull { it.id == selectedId }?.name ?: "Choose a template"
    ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = it }) {
        OutlinedTextField(
            value = selectedName,
            onValueChange = {},
            readOnly = true,
            singleLine = true,
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded) },
            modifier = Modifier.menuAnchor().fillMaxWidth(),
        )
        ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            templates.forEach { template ->
                DropdownMenuItem(
                    text = { Text(template.name) },
                    onClick = { onSelect(template.id); expanded = false },
                )
            }
        }
    }
}
