package com.vairiot.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.vairiot.app.ui.theme.*

private val STATUSES   = listOf("active", "in_maintenance", "retired", "lost")
private val CONDITIONS = listOf("excellent", "good", "fair", "poor")

@Composable
fun AssetEditScreen(
    onBack:        () -> Unit,
    onSaved:       () -> Unit,
    viewModel: AssetEditViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()

    LaunchedEffect(state.savedAsset) {
        if (state.savedAsset != null) onSaved()
    }

    Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {

        Box(modifier = Modifier.fillMaxWidth()
            .background(Brush.horizontalGradient(listOf(VairiotCharcoal, VairiotCharcoal)))
            .padding(horizontal = 8.dp, vertical = 8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = "Back", tint = White)
                }
                Text("Edit asset", style = MaterialTheme.typography.titleLarge,
                    fontFamily = MontserratFamily, fontWeight = FontWeight.ExtraBold,
                    color = White)
            }
        }

        if (state.isLoading) {
            Row(modifier = Modifier.padding(16.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                CircularProgressIndicator(color = VairiotViolet,
                    modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                Text("Loading…")
            }
            return
        }

        Column(modifier = Modifier
            .padding(16.dp)
            .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp)) {

            OutlinedTextField(value = state.name,
                onValueChange = { viewModel.update("name", it) },
                label = { Text("Name") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth())

            OutlinedTextField(value = state.description,
                onValueChange = { viewModel.update("description", it) },
                label = { Text("Description") },
                minLines = 2, maxLines = 4,
                modifier = Modifier.fillMaxWidth())

            DropdownField(label = "Status", value = state.status,
                options = STATUSES,
                onChange = { viewModel.update("status", it) })

            DropdownField(label = "Condition", value = state.condition,
                options = CONDITIONS,
                onChange = { viewModel.update("condition", it) })

            OutlinedTextField(value = state.serialNumber,
                onValueChange = { viewModel.update("serialNumber", it) },
                label = { Text("Serial number") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth())

            OutlinedTextField(value = state.barcode,
                onValueChange = { viewModel.update("barcode", it) },
                label = { Text("Barcode") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth())

            OutlinedTextField(value = state.rfidTag,
                onValueChange = { viewModel.update("rfidTag", it) },
                label = { Text("RFID tag") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth())

            state.error?.let {
                Surface(color = ErrorRed.copy(alpha = 0.12f),
                    shape = RoundedCornerShape(8.dp)) {
                    Text(it, modifier = Modifier.padding(10.dp),
                        style = MaterialTheme.typography.bodySmall, color = ErrorRed)
                }
            }

            Button(
                onClick = { viewModel.save() },
                enabled = !state.isSaving && state.name.isNotBlank(),
                modifier = Modifier.fillMaxWidth().height(50.dp),
                shape = RoundedCornerShape(10.dp),
                colors = ButtonDefaults.buttonColors(containerColor = VairiotViolet),
            ) {
                if (state.isSaving) {
                    CircularProgressIndicator(color = White,
                        modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                } else {
                    Text("Save changes", fontFamily = MontserratFamily,
                        fontWeight = FontWeight.Bold)
                }
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DropdownField(label: String, value: String, options: List<String>, onChange: (String) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    ExposedDropdownMenuBox(
        expanded = expanded,
        onExpandedChange = { expanded = it },
    ) {
        OutlinedTextField(
            value = value,
            onValueChange = {},
            readOnly = true,
            label = { Text(label) },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded) },
            modifier = Modifier.menuAnchor().fillMaxWidth(),
        )
        ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            options.forEach { opt ->
                DropdownMenuItem(
                    text = { Text(opt) },
                    onClick = { onChange(opt); expanded = false },
                )
            }
        }
    }
}
