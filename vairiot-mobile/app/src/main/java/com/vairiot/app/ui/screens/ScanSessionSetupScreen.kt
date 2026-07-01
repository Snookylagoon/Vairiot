package com.vairiot.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Explore
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.vairiot.app.ui.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ScanSessionSetupScreen(
    onStart: (sessionId: String) -> Unit,
    onBack:  () -> Unit,
    viewModel: ScanSessionSetupViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()

    Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {

        Box(modifier = Modifier.fillMaxWidth()
            .background(Brush.horizontalGradient(listOf(VairiotCharcoal, VairiotCharcoal)))
            .statusBarsPadding()
            .padding(horizontal = 8.dp, vertical = 8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = "Back", tint = White)
                }
                Column {
                    Text("Start scan session",
                        style = MaterialTheme.typography.titleLarge,
                        fontFamily = MontserratFamily,
                        fontWeight = FontWeight.ExtraBold,
                        color = White)
                    Text("Choose the assets you're scanning",
                        style = MaterialTheme.typography.bodySmall,
                        color = White.copy(alpha = 0.7f))
                }
            }
        }

        Column(modifier = Modifier.fillMaxSize().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)) {

            if (state.isLoading) {
                LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            }

            OptionalDropdown(
                label            = "Site",
                emptyLabel       = "All sites",
                options          = state.sites.map { it.id to it.name },
                selectedId       = state.selectedSiteId,
                onSelected       = { viewModel.selectSite(it) },
            )

            OptionalDropdown(
                label            = "Category",
                emptyLabel       = "All categories",
                options          = state.categories.map { it.id to it.name },
                selectedId       = state.selectedCatId,
                onSelected       = { viewModel.selectCategory(it) },
            )

            state.error?.let {
                Surface(color = ErrorRed.copy(alpha = 0.12f), shape = RoundedCornerShape(8.dp)) {
                    Text(it, modifier = Modifier.padding(10.dp),
                        style = MaterialTheme.typography.bodySmall, color = ErrorRed)
                }
            }

            Spacer(Modifier.weight(1f))

            Button(
                onClick = { viewModel.start(onStart) },
                enabled = !state.isStarting,
                modifier = Modifier.fillMaxWidth().height(56.dp),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = VairiotPink),
            ) {
                Icon(Icons.Default.Explore, contentDescription = null,
                    modifier = Modifier.size(22.dp))
                Spacer(Modifier.width(8.dp))
                Text(if (state.isStarting) "Starting…" else "Start session",
                    fontFamily = MontserratFamily, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun OptionalDropdown(
    label: String,
    emptyLabel: String,
    options: List<Pair<String, String>>,
    selectedId: String?,
    onSelected: (String?) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    val selectedName = options.firstOrNull { it.first == selectedId }?.second ?: emptyLabel

    ExposedDropdownMenuBox(
        expanded = expanded,
        onExpandedChange = { expanded = !expanded },
    ) {
        OutlinedTextField(
            value = selectedName,
            onValueChange = {},
            readOnly = true,
            singleLine = true,
            label = { Text(label) },
            modifier = Modifier.fillMaxWidth().menuAnchor(),
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded) },
        )
        ExposedDropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
        ) {
            DropdownMenuItem(
                text = { Text(emptyLabel) },
                onClick = { onSelected(null); expanded = false },
            )
            options.forEach { (id, name) ->
                DropdownMenuItem(
                    text = { Text(name) },
                    onClick = { onSelected(id); expanded = false },
                )
            }
        }
    }
}
