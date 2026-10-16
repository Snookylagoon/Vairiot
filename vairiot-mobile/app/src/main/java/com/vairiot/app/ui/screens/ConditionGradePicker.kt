package com.vairiot.app.ui.screens

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.vairiot.app.domain.model.ConditionScaleEntry
import com.vairiot.app.ui.theme.VairiotViolet

/**
 * Condition grade for the next scan (stage 1.15): "None" or 1–5 from the
 * tenant's scale, with the chosen grade's criteria underneath. Moved out of
 * AuditRunScreen, which is on the line-limit baseline.
 */
@Composable
fun ConditionGradePicker(entries: List<ConditionScaleEntry>, selected: Int?, onSelect: (Int?) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.horizontalScroll(rememberScrollState())) {
            Text("Condition", style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f))
            Chip("None", selected == null) { onSelect(null) }
            entries.sortedByDescending { it.grade }.forEach { e ->
                Chip("${e.grade} · ${e.label}", selected == e.grade) { onSelect(e.grade) }
            }
        }
        entries.firstOrNull { it.grade == selected }?.let { e ->
            Text(e.criteria + if (e.photoRequired) " A photo is needed." else "",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
        }
    }
}

@Composable
private fun Chip(label: String, isSelected: Boolean, onClick: () -> Unit) {
    val bg by animateColorAsState(if (isSelected) VairiotViolet else MaterialTheme.colorScheme.surfaceVariant, label = "condBg")
    val fg by animateColorAsState(if (isSelected) Color.White else MaterialTheme.colorScheme.onSurface, label = "condFg")
    Surface(onClick = onClick, color = bg, shape = RoundedCornerShape(8.dp)) {
        Text(label, modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
            style = MaterialTheme.typography.labelSmall, color = fg,
            fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal)
    }
}
