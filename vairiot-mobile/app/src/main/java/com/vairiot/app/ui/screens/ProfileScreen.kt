package com.vairiot.app.ui.screens

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.vairiot.app.ui.theme.*

@Composable
fun ProfileScreen(
    onLogout: () -> Unit,
    viewModel: ProfileViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    val context = LocalContext.current

    Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {

        Box(
            modifier = Modifier.fillMaxWidth()
                .background(Brush.horizontalGradient(listOf(VairiotCharcoal, VairiotCharcoal)))
                .padding(16.dp),
        ) {
            Column {
                Text("Profile", color = androidx.compose.ui.graphics.Color.White,
                    fontSize = 20.sp, fontWeight = FontWeight.Bold)
                Text(state.email ?: "—", color = androidx.compose.ui.graphics.Color.White.copy(alpha = 0.7f),
                    fontSize = 14.sp)
            }
        }

        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (state.isLoading && state.licenceNumber == null) {
                LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            }

            if (state.offline) {
                AssistChip(onClick = {}, label = { Text("Offline — showing last known licence") })
            }

            LicenceCard(
                number    = state.licenceNumber,
                tier      = state.licenceTier,
                status    = state.licenceStatus,
                startDate = state.licenceStart,
                onCopy = { num ->
                    val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                    cm.setPrimaryClip(ClipData.newPlainText("Licence number", num))
                    Toast.makeText(context, "Licence number copied", Toast.LENGTH_SHORT).show()
                },
            )

            if (state.roles.isNotEmpty()) {
                Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
                    Column(Modifier.padding(16.dp)) {
                        Text("Roles", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Spacer(Modifier.height(4.dp))
                        Text(state.roles.joinToString(", "), fontWeight = FontWeight.Medium)
                    }
                }
            }

            state.error?.let {
                Text(it, color = MaterialTheme.colorScheme.error, fontSize = 13.sp)
            }

            Spacer(Modifier.weight(1f))

            OutlinedButton(onClick = onLogout, modifier = Modifier.fillMaxWidth()) {
                Text("Sign out")
            }
        }
    }
}

@Composable
private fun LicenceCard(
    number: String?,
    tier: String?,
    status: String?,
    startDate: String?,
    onCopy: (String) -> Unit,
) {
    val formattedStart = startDate
        ?.let { runCatching { java.time.OffsetDateTime.parse(it).toLocalDate().toString() }.getOrNull() }
    Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Licence number", fontSize = 12.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    number ?: "—",
                    fontFamily = FontFamily.Monospace,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(Modifier.weight(1f))
                if (number != null) {
                    TextButton(onClick = { onCopy(number) }) { Text("Copy") }
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                tier?.let {
                    Column {
                        Text("Tier", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(it, fontWeight = FontWeight.Medium)
                    }
                }
                status?.let {
                    Column {
                        Text("Status", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(it.uppercase(), fontWeight = FontWeight.Medium)
                    }
                }
                formattedStart?.let {
                    Column {
                        Text("Start date", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(it, fontWeight = FontWeight.Medium)
                    }
                }
            }
        }
    }
}
