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
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Sort
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

private val STATUS_OPTIONS = listOf("active", "maintenance", "inactive", "retired")
private val CONDITION_OPTIONS = listOf("good", "fair", "poor", "damaged")

@Composable
fun AssetListScreen(
    onAssetClick: (String) -> Unit,
    viewModel: AssetListViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
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
                    Row(verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Assets — ${state.total}", style = MaterialTheme.typography.bodySmall,
                            color = White.copy(alpha = 0.6f))
                        if (state.offline) {
                            Text("OFFLINE • cached",
                                style = MaterialTheme.typography.labelSmall,
                                color = White,
                                modifier = Modifier
                                    .background(VairiotPink.copy(alpha = 0.85f), RoundedCornerShape(6.dp))
                                    .padding(horizontal = 8.dp, vertical = 2.dp))
                        }
                    }
                }
            }
        }

        Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)) {

            OutlinedTextField(
                value = state.search,
                onValueChange = viewModel::onSearchChange,
                label = { Text("Search assets") },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )

            // Status filter chips
            FilterChipRow(
                label = "Status",
                options = STATUS_OPTIONS,
                selected = state.status,
                onSelect = viewModel::onStatusChange,
            )

            // Condition filter chips
            FilterChipRow(
                label = "Condition",
                options = CONDITION_OPTIONS,
                selected = state.condition,
                onSelect = viewModel::onConditionChange,
            )

            // Sort selector
            SortRow(
                current = state.sortField,
                dir = state.sortDir,
                onSelect = viewModel::onSortChange,
            )

            when {
                state.isLoading && state.assets.isEmpty() -> {
                    Row(verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        CircularProgressIndicator(color = VairiotViolet,
                            modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                        Text("Loading…", style = MaterialTheme.typography.bodyMedium)
                    }
                }
                state.error != null -> Text(state.error!!, color = ErrorRed,
                    style = MaterialTheme.typography.bodyMedium)
                state.assets.isEmpty() -> Text("No assets match your filters.",
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
            }
        }

        LazyColumn(
            modifier = Modifier.weight(1f).fillMaxWidth().padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            items(state.assets, key = { it.id }) { asset ->
                AssetRow(asset = asset, onClick = { onAssetClick(asset.id) })
            }
            item { Spacer(Modifier.height(12.dp)) }
        }
    }
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
            Surface(
                onClick = { onSelect(option) },
                color = bg,
                shape = RoundedCornerShape(8.dp),
            ) {
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
private fun SortRow(
    current: SortField,
    dir: SortDir,
    onSelect: (SortField) -> Unit,
) {
    Row(
        modifier = Modifier.horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Default.Sort, contentDescription = null,
            modifier = Modifier.size(14.dp),
            tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f))
        SortField.entries.forEach { field ->
            val isSelected = current == field
            val bg by animateColorAsState(
                if (isSelected) VairiotCharcoal else MaterialTheme.colorScheme.surfaceVariant,
                label = "sortBg",
            )
            val fg by animateColorAsState(
                if (isSelected) White else MaterialTheme.colorScheme.onSurface,
                label = "sortFg",
            )
            Surface(
                onClick = { onSelect(field) },
                color = bg,
                shape = RoundedCornerShape(8.dp),
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    Text(field.label,
                        style = MaterialTheme.typography.labelSmall,
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
private fun AssetRow(asset: AssetResponse, onClick: () -> Unit) {
    Card(onClick = onClick, modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(10.dp)) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically) {
                Text(asset.assetNumber, style = MaterialTheme.typography.labelMedium,
                    color = VairiotViolet, fontWeight = FontWeight.SemiBold)
                StatusBadge(asset.status)
            }
            Text(asset.name, style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold, color = VairiotCharcoal)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                asset.site?.let {
                    Text(it.name, style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                }
                if (asset.condition.isNotBlank()) {
                    ConditionBadge(asset.condition)
                }
            }
        }
    }
}

@Composable
private fun StatusBadge(status: String) {
    val (bg, fg) = when (status.lowercase()) {
        "active"       -> SuccessGreen.copy(alpha = 0.15f) to SuccessGreen
        "retired"      -> ErrorRed.copy(alpha = 0.15f)     to ErrorRed
        "maintenance"  -> WarningAmber.copy(alpha = 0.15f) to WarningAmber
        else           -> VairiotViolet.copy(alpha = 0.15f) to VairiotViolet
    }
    Surface(color = bg, shape = RoundedCornerShape(6.dp)) {
        Text(status.uppercase(),
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
            style = MaterialTheme.typography.labelSmall,
            color = fg, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun ConditionBadge(condition: String) {
    val (bg, fg) = when (condition.lowercase()) {
        "good"     -> SuccessGreen.copy(alpha = 0.10f) to SuccessGreen
        "fair"     -> WarningAmber.copy(alpha = 0.10f) to WarningAmber
        "poor"     -> ErrorRed.copy(alpha = 0.10f)     to ErrorRed
        "damaged"  -> ErrorRed.copy(alpha = 0.15f)     to ErrorRed
        else       -> VairiotMauve.copy(alpha = 0.10f)  to VairiotMauve
    }
    Surface(color = bg, shape = RoundedCornerShape(6.dp)) {
        Text(condition.replaceFirstChar { it.uppercase() },
            modifier = Modifier.padding(horizontal = 6.dp, vertical = 1.dp),
            style = MaterialTheme.typography.labelSmall,
            color = fg)
    }
}
