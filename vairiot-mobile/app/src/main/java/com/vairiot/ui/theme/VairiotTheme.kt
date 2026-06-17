package com.vairiot.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.vairiot.R

// ─── Brand Colours ────────────────────────────────────────────────────────────
// Gradient: #FF0DCC → #A05B97 → #615AA0 (pixel-sampled from logo)
object VairiotColors {
    val Pink     = Color(0xFFFF0DCC)   // Gradient start — Pantone 807C
    val Mauve    = Color(0xFFA05B97)   // Gradient midpoint
    val Violet   = Color(0xFF615AA0)   // Gradient end
    val Charcoal = Color(0xFF2B3132)   // Body text — Pantone 533C
    val Wash     = Color(0xFFF8F0FA)   // Light tint — fills
    val White    = Color(0xFFFFFFFF)

    // The brand gradient — use as Modifier.background(VairiotColors.Gradient)
    val Gradient = Brush.horizontalGradient(
        colors = listOf(Pink, Mauve, Violet)
    )
}

// ─── Typography — Montserrat ──────────────────────────────────────────────────
// Note: Add Montserrat TTF files to res/font/ before using FontFamily.
// Download from: fonts.google.com/specimen/Montserrat
// Files needed: montserrat_regular.ttf, montserrat_semibold.ttf,
//               montserrat_bold.ttf, montserrat_extrabold.ttf
val MontserratFamily = FontFamily(
    Font(R.font.montserrat_regular,   FontWeight.Normal),
    Font(R.font.montserrat_semibold,  FontWeight.SemiBold),
    Font(R.font.montserrat_bold,      FontWeight.Bold),
    Font(R.font.montserrat_extrabold, FontWeight.ExtraBold),
)

val VairiotTypography = androidx.compose.material3.Typography(
    displayLarge  = TextStyle(fontFamily = MontserratFamily, fontWeight = FontWeight.ExtraBold, fontSize = 40.sp),
    headlineLarge = TextStyle(fontFamily = MontserratFamily, fontWeight = FontWeight.Bold,      fontSize = 24.sp, color = VairiotColors.Violet),
    headlineMedium= TextStyle(fontFamily = MontserratFamily, fontWeight = FontWeight.Bold,      fontSize = 20.sp, color = VairiotColors.Charcoal),
    headlineSmall = TextStyle(fontFamily = MontserratFamily, fontWeight = FontWeight.SemiBold,  fontSize = 16.sp, color = VairiotColors.Mauve),
    bodyLarge     = TextStyle(fontFamily = MontserratFamily, fontWeight = FontWeight.Normal,    fontSize = 14.sp, color = VairiotColors.Charcoal),
    bodyMedium    = TextStyle(fontFamily = MontserratFamily, fontWeight = FontWeight.Normal,    fontSize = 12.sp, color = VairiotColors.Charcoal),
    labelLarge    = TextStyle(fontFamily = MontserratFamily, fontWeight = FontWeight.Bold,      fontSize = 14.sp),
)

// ─── Colour Schemes ───────────────────────────────────────────────────────────
private val LightColorScheme = lightColorScheme(
    primary          = VairiotColors.Violet,
    primaryContainer = VairiotColors.Wash,
    secondary        = VairiotColors.Pink,
    tertiary         = VairiotColors.Mauve,
    background       = VairiotColors.White,
    surface          = VairiotColors.White,
    surfaceVariant   = VairiotColors.Wash,
    onPrimary        = VairiotColors.White,
    onBackground     = VairiotColors.Charcoal,
    onSurface        = VairiotColors.Charcoal,
)

private val DarkColorScheme = darkColorScheme(
    primary          = VairiotColors.Mauve,
    primaryContainer = VairiotColors.Charcoal,
    secondary        = VairiotColors.Pink,
    tertiary         = VairiotColors.Violet,
    background       = VairiotColors.Charcoal,
    surface          = Color(0xFF1A1E1F),
    onPrimary        = VairiotColors.White,
    onBackground     = VairiotColors.White,
    onSurface        = VairiotColors.White,
)

// ─── Theme Composable ─────────────────────────────────────────────────────────
@Composable
fun VairiotTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme

    MaterialTheme(
        colorScheme = colorScheme,
        typography  = VairiotTypography,
        content     = content,
    )
}
