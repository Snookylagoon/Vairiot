package com.vairiot.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.vairiot.app.data.api.AssetResponse
import com.vairiot.app.ui.theme.*

@Composable
fun AssetListScreen(
    onAssetClick: (String) -> Unit,
    viewModel: AssetListViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()

    Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {

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

        Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)) {

            OutlinedTextField(
                value = state.search,
                onValueChange = viewModel::onSearchChange,
                label = { Text("Search assets") },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
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
                state.assets.isEmpty() -> Text("No assets match your search.",
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
            }
        }

        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
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
private fun AssetRow(asset: AssetResponse, onClick: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth().clickable { onClick() },
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
            asset.site?.let {
                Text(it.name, style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
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
