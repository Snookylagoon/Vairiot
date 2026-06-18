package com.vairiot.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable

private val VairiotColorScheme = lightColorScheme(
    primary          = VairiotViolet,
    primaryContainer = VairiotWash,
    secondary        = VairiotPink,
    tertiary         = VairiotMauve,
    background       = White,
    surface          = White,
    surfaceVariant   = VairiotWash,
    onPrimary        = White,
    onBackground     = VairiotCharcoal,
    onSurface        = VairiotCharcoal,
    error            = ErrorRed,
)

@Composable
fun VairiotTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = VairiotColorScheme,
        typography  = VairiotTypography,
        content     = content,
    )
}
