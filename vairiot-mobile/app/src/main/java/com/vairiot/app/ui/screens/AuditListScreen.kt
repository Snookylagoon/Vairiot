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
import androidx.compose.material.icons.automirrored.filled.Sort
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.vairiot.app.LocalUseSideRail
import com.vairiot.app.data.api.AuditCampaignResponse
import com.vairiot.app.ui.components.ClearableTextField
import com.vairiot.app.ui.theme.*

private val CAMPAIGN_STATUS_OPTIONS = listOf("draft", "in_progress", "completed")

private enum class CampaignSortField(val key: String, val label: String) {
    NAME("name", "Name"),
    STATUS("status", "Status"),
    SCANS("scans", "Scans"),
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AuditListScreen(
    onCampaignClick: (campaignId: String, status: String) -> Unit,
    viewModel: AuditListViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()

    // Refresh the list whenever the screen returns to the foreground, so a status
    // change made elsewhere (e.g. an audit completed on the run screen) shows
    // without a manual pull-to-refresh.
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) viewModel.load()
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    var search by rememberSaveable { mutableStateOf("") }
    var statusFilter by rememberSaveable { mutableStateOf("") }
    var sortFieldKey by rememberSaveable { mutableStateOf(CampaignSortField.NAME.key) }
    var sortDir by rememberSaveable { mutableStateOf(SortDir.ASC) }
    val sortField = CampaignSortField.entries.firstOrNull { it.key == sortFieldKey } ?: CampaignSortField.NAME

    val visible = remember(state.campaigns, search, statusFilter, sortFieldKey, sortDir) {
        applyCampaignFilters(state.campaigns, search, statusFilter, sortField, sortDir)
    }

    var showCreate by rememberSaveable { mutableStateOf(false) }

    val sideRail = LocalUseSideRail.current

    Box(modifier = Modifier.fillMaxSize()) {
    Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {

        if (!sideRail) {
            Box(
                modifier = Modifier.fillMaxWidth()
                    .background(Brush.horizontalGradient(listOf(VairiotCharcoal, VairiotCharcoal)))
                    .padding(16.dp),
            ) {
                Column {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(modifier = Modifier.height(32.dp).width(4.dp)
                            .background(Brush.verticalGradient(listOf(VairiotPink, VairiotViolet)),
                                RoundedCornerShape(2.dp)))
                        Spacer(Modifier.width(12.dp))
                        Text("VAIRIOT", style = MaterialTheme.typography.titleLarge,
                            fontFamily = MontserratFamily, fontWeight = FontWeight.ExtraBold,
                            color = White)
                    }
                    Spacer(Modifier.height(4.dp))
                    Text("Audit campaigns — ${state.campaigns.size}",
                        style = MaterialTheme.typography.bodySmall,
                        color = White.copy(alpha = 0.6f))
                }
            }
        }

        Column(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            ClearableTextField(
                value = search,
                onValueChange = { search = it },
                label = { Text("Search campaigns") },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                singleLine = true,
            )

            FilterChipRow(
                label = "Status",
                options = CAMPAIGN_STATUS_OPTIONS,
                selected = statusFilter,
                onSelect = { statusFilter = if (statusFilter == it) "" else it },
            )

            CampaignSortRow(
                current = sortField,
                dir = sortDir,
                onSelect = { f ->
                    if (sortField == f) sortDir = if (sortDir == SortDir.ASC) SortDir.DESC else SortDir.ASC
                    else { sortFieldKey = f.key; sortDir = SortDir.ASC }
                },
            )

            when {
                state.isLoading && state.campaigns.isEmpty() -> Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    CircularProgressIndicator(color = VairiotViolet,
                        modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                    Text("Loading…", style = MaterialTheme.typography.bodyMedium)
                }
                state.error != null -> Text(state.error!!, color = ErrorRed,
                    style = MaterialTheme.typography.bodyMedium)
                visible.isEmpty() -> Text(
                    if (state.campaigns.isEmpty()) "No audit campaigns yet."
                    else "No campaigns match your filters.",
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                )
            }
        }

        // Pull down to refresh the campaign list (statuses can change server-side,
        // e.g. an audit completed on another device or on the run screen).
        PullToRefreshBox(
            isRefreshing = state.isLoading && state.campaigns.isNotEmpty(),
            onRefresh = { viewModel.load() },
            modifier = Modifier.weight(1f).fillMaxWidth(),
        ) {
            LazyColumn(
                modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(visible, key = { it.id }) { c ->
                    AuditRow(campaign = c, onClick = { onCampaignClick(c.id, c.status) })
                }
                item { Spacer(Modifier.height(80.dp)) } // breathing room above FAB
            }
        }
    }

    FloatingActionButton(
        onClick = { showCreate = true; viewModel.ensureScopeRefs() },
        modifier = Modifier.align(Alignment.BottomEnd).padding(16.dp),
        containerColor = VairiotViolet,
        contentColor = White,
    ) {
        Icon(Icons.Default.Add, contentDescription = "New audit")
    }

    if (showCreate) {
        CreateAuditDialog(
            state = state,
            blindAuditEnabled = state.blindAuditEnabled,
            onSiteSelected = { viewModel.loadLocationsForSite(it) },
            onDismiss = { showCreate = false },
            onCreate = { name, mode, siteId, locationId, categoryId ->
                viewModel.createCampaign(name, mode, siteId, locationId, categoryId) {
                    showCreate = false
                }
            },
        )
    }
    } // end outer Box
}

private fun applyCampaignFilters(
    rows: List<AuditCampaignResponse>,
    search: String,
    statusFilter: String,
    sortField: CampaignSortField,
    sortDir: SortDir,
): List<AuditCampaignResponse> {
    var out = rows
    if (statusFilter.isNotBlank()) {
        out = out.filter { it.status.equals(statusFilter, ignoreCase = true) }
    }
    if (search.isNotBlank()) {
        val q = search.trim().lowercase()
        out = out.filter { it.name.lowercase().contains(q) || it.status.lowercase().contains(q) }
    }
    val cmp = when (sortField) {
        CampaignSortField.NAME   -> compareBy<AuditCampaignResponse> { it.name.lowercase() }
        CampaignSortField.STATUS -> compareBy<AuditCampaignResponse> { it.status.lowercase() }
        CampaignSortField.SCANS  -> compareBy<AuditCampaignResponse> { it._count?.scanEvents ?: 0 }
    }
    return if (sortDir == SortDir.DESC) out.sortedWith(cmp.reversed()) else out.sortedWith(cmp)
}

@Composable
private fun FilterChipRow(
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
                    option.replace('_', ' ').replaceFirstChar { it.uppercase() },
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
private fun CampaignSortRow(
    current: CampaignSortField,
    dir: SortDir,
    onSelect: (CampaignSortField) -> Unit,
) {
    Row(
        modifier = Modifier.horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.AutoMirrored.Filled.Sort, contentDescription = null,
            modifier = Modifier.size(14.dp),
            tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f))
        CampaignSortField.entries.forEach { field ->
            val isSelected = current == field
            val bg by animateColorAsState(
                if (isSelected) VairiotCharcoal else MaterialTheme.colorScheme.surfaceVariant,
                label = "sortBg",
            )
            val fg by animateColorAsState(
                if (isSelected) White else MaterialTheme.colorScheme.onSurface,
                label = "sortFg",
            )
            Surface(onClick = { onSelect(field) }, color = bg, shape = RoundedCornerShape(8.dp)) {
                Row(
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    Text(field.label, style = MaterialTheme.typography.labelSmall,
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

@Composable
private fun AuditRow(campaign: AuditCampaignResponse, onClick: () -> Unit) {
    Card(onClick = onClick, modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(10.dp)) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically) {
                Row(verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(campaign.name, style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold, color = VairiotCharcoal)
                    if (campaign.mode == "blind") {
                        Surface(color = VairiotPink.copy(alpha = 0.12f),
                            shape = RoundedCornerShape(4.dp)) {
                            Row(modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                                Icon(Icons.Default.VisibilityOff, contentDescription = null,
                                    modifier = Modifier.size(10.dp), tint = VairiotPink)
                                Text("Blind", style = MaterialTheme.typography.labelSmall,
                                    color = VairiotPink, fontWeight = FontWeight.SemiBold)
                            }
                        }
                    }
                }
                AuditStatusBadge(campaign.status)
            }
            Text("${campaign._count?.scanEvents ?: 0} scan${if ((campaign._count?.scanEvents ?: 0) == 1) "" else "s"} recorded",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CreateAuditDialog(
    state: AuditListUiState,
    blindAuditEnabled: Boolean,
    onSiteSelected: (String?) -> Unit,
    onDismiss: () -> Unit,
    onCreate: (name: String, mode: String?, siteId: String?, locationId: String?, categoryId: String?) -> Unit,
) {
    var name by rememberSaveable { mutableStateOf("") }
    var mode by rememberSaveable { mutableStateOf("sighted") }
    var siteId by rememberSaveable { mutableStateOf<String?>(null) }
    var locationId by rememberSaveable { mutableStateOf<String?>(null) }
    var categoryId by rememberSaveable { mutableStateOf<String?>(null) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("New audit", fontWeight = FontWeight.SemiBold) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                ClearableTextField(
                    value = name, onValueChange = { name = it },
                    label = { Text("Campaign name") },
                    singleLine = true,
                )

                if (blindAuditEnabled) {
                    Text("Mode", style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf("sighted" to "Sighted", "blind" to "Blind").forEach { (key, label) ->
                            val isSelected = mode == key
                            val bg by animateColorAsState(
                                if (isSelected) VairiotViolet else MaterialTheme.colorScheme.surfaceVariant,
                                label = "modeBg",
                            )
                            val fg by animateColorAsState(
                                if (isSelected) White else MaterialTheme.colorScheme.onSurface,
                                label = "modeFg",
                            )
                            Surface(onClick = { mode = key }, color = bg, shape = RoundedCornerShape(8.dp)) {
                                Text(label,
                                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                                    style = MaterialTheme.typography.labelMedium,
                                    color = fg,
                                    fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal)
                            }
                        }
                    }
                    if (mode == "blind") {
                        Text("Auditors will not see expected assets during capture. A site must be selected.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f))
                    }
                }

                Text("Scope (optional)", style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))

                ScopePicker(
                    label = "Site",
                    selectedId = siteId,
                    options = state.sites.map { it.id to it.name },
                    onSelect = {
                        siteId = it
                        locationId = null
                        onSiteSelected(it)
                    },
                )
                ScopePicker(
                    label = "Location",
                    selectedId = locationId,
                    options = state.locations.map { it.id to it.name },
                    onSelect = { locationId = it },
                    disabled = siteId.isNullOrBlank(),
                    disabledHint = "Pick a site first",
                )
                ScopePicker(
                    label = "Category",
                    selectedId = categoryId,
                    options = state.categories.map { it.id to it.name },
                    onSelect = { categoryId = it },
                )

                state.createError?.let {
                    Text(it, color = ErrorRed, style = MaterialTheme.typography.bodySmall)
                }
            }
        },
        confirmButton = {
            Button(
                onClick = { onCreate(name, if (mode == "blind") "blind" else null, siteId, locationId, categoryId) },
                enabled = name.isNotBlank() && !state.isCreating,
                colors = ButtonDefaults.buttonColors(containerColor = VairiotViolet),
            ) {
                if (state.isCreating) {
                    CircularProgressIndicator(color = White, strokeWidth = 2.dp,
                        modifier = Modifier.size(14.dp))
                    Spacer(Modifier.width(6.dp))
                }
                Text("Create")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        },
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ScopePicker(
    label: String,
    selectedId: String?,
    options: List<Pair<String, String>>,   // id to display
    onSelect: (String?) -> Unit,
    disabled: Boolean = false,
    disabledHint: String? = null,
) {
    var expanded by remember { mutableStateOf(false) }
    val displayed = when {
        disabled && disabledHint != null -> disabledHint
        selectedId == null               -> "All"
        else -> options.firstOrNull { it.first == selectedId }?.second ?: "All"
    }

    ExposedDropdownMenuBox(
        expanded = expanded && !disabled,
        onExpandedChange = { if (!disabled) expanded = !expanded },
    ) {
        OutlinedTextField(
            value = displayed,
            onValueChange = {},
            readOnly = true,
            enabled = !disabled,
            label = { Text(label) },
            trailingIcon = { Icon(Icons.Default.ArrowDropDown, contentDescription = null) },
            modifier = Modifier.menuAnchor().fillMaxWidth(),
        )
        ExposedDropdownMenu(expanded = expanded && !disabled, onDismissRequest = { expanded = false }) {
            DropdownMenuItem(
                text = { Text("All") },
                onClick = { onSelect(null); expanded = false },
            )
            options.forEach { (id, label) ->
                DropdownMenuItem(
                    text = { Text(label) },
                    onClick = { onSelect(id); expanded = false },
                )
            }
        }
    }
}

@Composable
private fun AuditStatusBadge(status: String) {
    val (bg, fg) = when (status.lowercase()) {
        "draft"       -> VairiotViolet.copy(alpha = 0.15f) to VairiotViolet
        "in_progress" -> WarningAmber.copy(alpha = 0.15f)  to WarningAmber
        "completed"   -> SuccessGreen.copy(alpha = 0.15f)  to SuccessGreen
        else          -> VairiotMauve.copy(alpha = 0.15f)  to VairiotMauve
    }
    Surface(color = bg, shape = RoundedCornerShape(6.dp)) {
        Text(status.replace('_', ' ').uppercase(),
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
            style = MaterialTheme.typography.labelSmall,
            color = fg, fontWeight = FontWeight.SemiBold)
    }
}
