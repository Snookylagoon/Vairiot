package com.vairiot.app.ui.screens

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Sort
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.Radio
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.SearchOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.vairiot.app.data.api.AuditReportResponse
import com.vairiot.app.data.api.AuditScanEventResponse
import com.vairiot.app.data.api.MissingAssetResponse
import com.vairiot.app.ui.components.ClearableTextField
import com.vairiot.app.ui.theme.*

private val SCAN_RESULT_OPTIONS = listOf("found", "unknown", "recorded")
private val CONDITION_OPTIONS = listOf("", "good", "fair", "poor", "damaged")

private enum class ScanSortField(val label: String) {
    TAG("Tag"), RESULT("Result"),
}

private enum class MissingSortField(val label: String) {
    ASSET_NUMBER("Asset #"), NAME("Name"),
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AuditRunScreen(
    onBack: () -> Unit,
    viewModel: AuditRunViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    var manual by remember { mutableStateOf("") }

    Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {

        // Header
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
                    Text("Run audit", style = MaterialTheme.typography.titleLarge,
                        fontFamily = MontserratFamily, fontWeight = FontWeight.ExtraBold,
                        color = White)
                    Text(
                        if (state.isBlind) "Recorded ${state.recordedCount}"
                        else "Found ${state.foundCount} · Unknown ${state.unknownCount}",
                        style = MaterialTheme.typography.bodySmall,
                        color = White.copy(alpha = 0.7f))
                }
            }
        }

        // Report view if completed
        state.report?.let { report ->
            ReportBody(report = report, onBack = onBack)
            return
        }

        LazyColumn(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            // Zone selector for blind mode
            if (state.isBlind) {
                item {
                    Card(shape = RoundedCornerShape(12.dp),
                        colors = CardDefaults.cardColors(containerColor = VairiotWash)) {
                        Column(modifier = Modifier.padding(12.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("Select zone", style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.SemiBold, color = VairiotCharcoal)

                            var expanded by remember { mutableStateOf(false) }
                            val selectedName = state.locations
                                .firstOrNull { it.first == state.selectedLocationId }?.second ?: "Choose a location…"
                            val zoneLocked = state.selectedLocationId.isNotBlank() &&
                                viewModel.isZoneLocked(state.selectedLocationId)

                            ExposedDropdownMenuBox(
                                expanded = expanded,
                                onExpandedChange = { expanded = !expanded },
                            ) {
                                OutlinedTextField(
                                    value = selectedName,
                                    onValueChange = {},
                                    readOnly = true,
                                    singleLine = true,
                                    modifier = Modifier.fillMaxWidth().menuAnchor(),
                                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded) },
                                )
                                ExposedDropdownMenu(
                                    expanded = expanded,
                                    onDismissRequest = { expanded = false },
                                ) {
                                    state.locations.forEach { (locId, locName) ->
                                        val locked = viewModel.isZoneLocked(locId)
                                        DropdownMenuItem(
                                            text = {
                                                Row(verticalAlignment = Alignment.CenterVertically,
                                                    horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                                    Text(locName)
                                                    if (locked) {
                                                        Icon(Icons.Default.Lock,
                                                            contentDescription = "Submitted",
                                                            modifier = Modifier.size(14.dp),
                                                            tint = WarningAmber)
                                                    }
                                                }
                                            },
                                            onClick = {
                                                viewModel.setSelectedLocation(locId)
                                                expanded = false
                                            },
                                            enabled = !locked,
                                        )
                                    }
                                }
                            }

                            if (zoneLocked) {
                                Row(verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                    Icon(Icons.Default.Lock, contentDescription = null,
                                        modifier = Modifier.size(14.dp), tint = WarningAmber)
                                    Text("This zone has been submitted and is locked.",
                                        style = MaterialTheme.typography.bodySmall, color = WarningAmber)
                                }
                            }

                            if (state.selectedLocationId.isNotBlank() && !zoneLocked) {
                                Button(
                                    onClick = { viewModel.submitZone() },
                                    enabled = !state.isSubmitting,
                                    colors = ButtonDefaults.buttonColors(containerColor = VairiotViolet),
                                ) {
                                    Icon(Icons.Default.Lock, contentDescription = null,
                                        modifier = Modifier.size(16.dp))
                                    Spacer(Modifier.width(6.dp))
                                    Text("Submit zone")
                                }
                            }
                        }
                    }
                }
            }

            // Condition picker
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.horizontalScroll(rememberScrollState())) {
                    Text("Condition", style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f))
                    CONDITION_OPTIONS.forEach { opt ->
                        val label = if (opt.isEmpty()) "None" else opt.replaceFirstChar { it.uppercase() }
                        val isSelected = state.condition == opt
                        val bg by animateColorAsState(
                            if (isSelected) VairiotViolet else MaterialTheme.colorScheme.surfaceVariant,
                            label = "condBg",
                        )
                        val fg by animateColorAsState(
                            if (isSelected) White else MaterialTheme.colorScheme.onSurface,
                            label = "condFg",
                        )
                        Surface(onClick = { viewModel.setCondition(opt) }, color = bg,
                            shape = RoundedCornerShape(8.dp)) {
                            Text(label, modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                                style = MaterialTheme.typography.labelSmall, color = fg,
                                fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal)
                        }
                    }
                }
            }

            // Manual entry + scan button
            item {
                val scanDisabled = state.isBlind && (state.selectedLocationId.isBlank() ||
                    viewModel.isZoneLocked(state.selectedLocationId))

                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        ClearableTextField(
                            value = manual, onValueChange = { manual = it },
                            label = { Text("Tag value") },
                            singleLine = true,
                            enabled = !scanDisabled,
                            modifier = Modifier.weight(1f),
                        )
                        Button(
                            onClick = { viewModel.submitTag(manual); manual = "" },
                            enabled = manual.isNotBlank() && !state.isSubmitting && !scanDisabled,
                            colors = ButtonDefaults.buttonColors(containerColor = VairiotViolet),
                        ) { Text("Record") }
                    }

                    Button(
                        onClick = { viewModel.triggerScan() },
                        enabled = !state.isSubmitting && !scanDisabled,
                        modifier = Modifier.fillMaxWidth().height(48.dp),
                        shape = RoundedCornerShape(10.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = VairiotPink),
                    ) {
                        Icon(Icons.Default.QrCodeScanner, contentDescription = null,
                            modifier = Modifier.size(20.dp))
                        Spacer(Modifier.width(8.dp))
                        Text("Scan tag", fontFamily = MontserratFamily, fontWeight = FontWeight.Bold)
                    }
                }
            }

            // Messages
            item {
                state.lastMessage?.let {
                    Surface(color = VairiotWash, shape = RoundedCornerShape(8.dp)) {
                        Text(it, modifier = Modifier.padding(10.dp),
                            style = MaterialTheme.typography.bodySmall, color = VairiotCharcoal)
                    }
                }
                state.error?.let {
                    Surface(color = ErrorRed.copy(alpha = 0.12f), shape = RoundedCornerShape(8.dp)) {
                        Text(it, modifier = Modifier.padding(10.dp),
                            style = MaterialTheme.typography.bodySmall, color = ErrorRed)
                    }
                }
            }

            // Complete button
            item {
                Button(
                    onClick = { viewModel.complete() },
                    enabled = !state.isSubmitting,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = SuccessGreen),
                ) { Text("Complete audit") }
            }

            item {
                HorizontalDivider()
                Text("Recent scans", style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold, color = VairiotCharcoal)
            }

            item {
                RecentScansSection(scans = state.recentScans, isBlind = state.isBlind)
            }
        }
    }
}

@Composable
private fun RecentScansSection(scans: List<AuditScanEventResponse>, isBlind: Boolean) {
    var search by rememberSaveable { mutableStateOf("") }
    var resultFilter by rememberSaveable { mutableStateOf("") }
    var sortFieldName by rememberSaveable { mutableStateOf(ScanSortField.TAG.name) }
    var sortDir by rememberSaveable { mutableStateOf(SortDir.DESC) }
    val sortField = ScanSortField.entries.firstOrNull { it.name == sortFieldName } ?: ScanSortField.TAG

    val filterOptions = if (isBlind) listOf("recorded") else listOf("found", "unknown")

    val visible = remember(scans, search, resultFilter, sortFieldName, sortDir) {
        var out = scans
        if (resultFilter.isNotBlank()) out = out.filter { it.result.equals(resultFilter, ignoreCase = true) }
        if (search.isNotBlank()) {
            val q = search.trim().lowercase()
            out = out.filter { it.tagValue.lowercase().contains(q) || it.result.lowercase().contains(q) }
        }
        val cmp = when (sortField) {
            ScanSortField.TAG    -> compareBy<AuditScanEventResponse> { it.tagValue.lowercase() }
            ScanSortField.RESULT -> compareBy<AuditScanEventResponse> { it.result.lowercase() }
        }
        if (sortDir == SortDir.DESC) out.sortedWith(cmp.reversed()) else out.sortedWith(cmp)
    }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        ClearableTextField(
            value = search,
            onValueChange = { search = it },
            label = { Text("Search scans") },
            leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
            singleLine = true,
        )
        ChipRow(
            label = "Result",
            options = filterOptions,
            selected = resultFilter,
            onSelect = { resultFilter = if (resultFilter == it) "" else it },
        )
        SortChipRow(
            options = ScanSortField.entries.map { it.name to it.label },
            currentKey = sortFieldName,
            dir = sortDir,
            onSelect = { key ->
                if (key == sortFieldName) sortDir = if (sortDir == SortDir.ASC) SortDir.DESC else SortDir.ASC
                else { sortFieldName = key; sortDir = SortDir.ASC }
            },
        )

        if (scans.isEmpty()) {
            Text("No scans recorded yet.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
        } else if (visible.isEmpty()) {
            Text("No scans match your filters.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
        }

        visible.forEach { ScanEventRow(it) }
    }
}

@Composable
private fun ScanEventRow(ev: AuditScanEventResponse) {
    val isFound = ev.result == "found"
    val isRecorded = ev.result == "recorded"
    val bgColour = when {
        isFound    -> SuccessGreen.copy(alpha = 0.08f)
        isRecorded -> VairiotViolet.copy(alpha = 0.08f)
        else       -> WarningAmber.copy(alpha = 0.10f)
    }
    val fgColour = when {
        isFound    -> SuccessGreen
        isRecorded -> VairiotViolet
        else       -> WarningAmber
    }
    val icon = when {
        isFound    -> Icons.Default.CheckCircle
        isRecorded -> Icons.Default.Radio
        else       -> Icons.Default.SearchOff
    }
    Surface(color = bgColour, shape = RoundedCornerShape(8.dp)) {
        Row(modifier = Modifier.padding(10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(imageVector = icon, contentDescription = null,
                tint = fgColour, modifier = Modifier.size(18.dp))
            Text(ev.tagValue, style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.weight(1f))
            Text(ev.result.uppercase(), style = MaterialTheme.typography.labelSmall,
                color = fgColour)
        }
    }
}

@Composable
private fun ReportBody(report: AuditReportResponse, onBack: () -> Unit) {
    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp),
            colors = CardDefaults.cardColors(containerColor = VairiotWash)) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Audit complete", style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold, color = VairiotCharcoal)
                DetailRow("Expected", report.totalExpected.toString())
                DetailRow("Scanned",  report.totalScanned.toString())
                DetailRow("Found",    report.found.toString())
                DetailRow("Missing",  report.missing.size.toString())
                DetailRow("Unknown",  report.unknownTags.size.toString())
            }
        }
        if (report.missing.isNotEmpty()) {
            Text("Missing assets", style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold)
            MissingAssetsSection(report.missing)
        }
        Button(onClick = onBack, modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.buttonColors(containerColor = VairiotViolet)) {
            Text("Back to audits")
        }
    }
}

@Composable
private fun MissingAssetsSection(missing: List<MissingAssetResponse>) {
    var search by rememberSaveable { mutableStateOf("") }
    var sortFieldName by rememberSaveable { mutableStateOf(MissingSortField.ASSET_NUMBER.name) }
    var sortDir by rememberSaveable { mutableStateOf(SortDir.ASC) }
    val sortField = MissingSortField.entries.firstOrNull { it.name == sortFieldName } ?: MissingSortField.ASSET_NUMBER

    val visible = remember(missing, search, sortFieldName, sortDir) {
        var out = missing
        if (search.isNotBlank()) {
            val q = search.trim().lowercase()
            out = out.filter { it.assetNumber.lowercase().contains(q) || it.name.lowercase().contains(q) }
        }
        val cmp = when (sortField) {
            MissingSortField.ASSET_NUMBER -> compareBy<MissingAssetResponse> { it.assetNumber.lowercase() }
            MissingSortField.NAME         -> compareBy<MissingAssetResponse> { it.name.lowercase() }
        }
        if (sortDir == SortDir.DESC) out.sortedWith(cmp.reversed()) else out.sortedWith(cmp)
    }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        ClearableTextField(
            value = search,
            onValueChange = { search = it },
            label = { Text("Search missing") },
            leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
            singleLine = true,
        )
        SortChipRow(
            options = MissingSortField.entries.map { it.name to it.label },
            currentKey = sortFieldName,
            dir = sortDir,
            onSelect = { key ->
                if (key == sortFieldName) sortDir = if (sortDir == SortDir.ASC) SortDir.DESC else SortDir.ASC
                else { sortFieldName = key; sortDir = SortDir.ASC }
            },
        )
        visible.forEach {
            Text("• ${it.assetNumber} — ${it.name}",
                style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun ChipRow(
    label: String,
    options: List<String>,
    selected: String,
    onSelect: (String) -> Unit,
) {
    Row(
        modifier = Modifier.horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f))
        options.forEach { option ->
            val isSelected = selected.equals(option, ignoreCase = true)
            val bg by animateColorAsState(
                if (isSelected) VairiotViolet else MaterialTheme.colorScheme.surfaceVariant,
                label = "chipBg",
            )
            val fg by animateColorAsState(
                if (isSelected) White else MaterialTheme.colorScheme.onSurface,
                label = "chipFg",
            )
            Surface(onClick = { onSelect(option) }, color = bg, shape = RoundedCornerShape(8.dp)) {
                Text(
                    option.replaceFirstChar { it.uppercase() },
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                    style = MaterialTheme.typography.labelSmall,
                    color = fg,
                    fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal,
                )
            }
        }
    }
}

@Composable
private fun SortChipRow(
    options: List<Pair<String, String>>,
    currentKey: String,
    dir: SortDir,
    onSelect: (String) -> Unit,
) {
    Row(
        modifier = Modifier.horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.AutoMirrored.Filled.Sort, contentDescription = null,
            modifier = Modifier.size(14.dp),
            tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f))
        options.forEach { (key, label) ->
            val isSelected = currentKey == key
            val bg by animateColorAsState(
                if (isSelected) VairiotCharcoal else MaterialTheme.colorScheme.surfaceVariant,
                label = "sortBg",
            )
            val fg by animateColorAsState(
                if (isSelected) White else MaterialTheme.colorScheme.onSurface,
                label = "sortFg",
            )
            Surface(onClick = { onSelect(key) }, color = bg, shape = RoundedCornerShape(8.dp)) {
                Row(
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    Text(label, style = MaterialTheme.typography.labelSmall,
                        color = fg,
                        fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal)
                    if (isSelected) {
                        Icon(
                            if (dir == SortDir.ASC) Icons.Default.ArrowUpward else Icons.Default.ArrowDownward,
                            contentDescription = if (dir == SortDir.ASC) "Ascending" else "Descending",
                            modifier = Modifier.size(12.dp),
                            tint = fg,
                        )
                    }
                }
            }
        }
    }
}
