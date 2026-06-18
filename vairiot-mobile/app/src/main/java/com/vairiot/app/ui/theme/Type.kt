package com.vairiot.app.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.vairiot.app.R

val MontserratFamily = FontFamily(
    Font(R.font.montserrat_regular,   FontWeight.Normal),
    Font(R.font.montserrat_semibold,  FontWeight.SemiBold),
    Font(R.font.montserrat_bold,      FontWeight.Bold),
    Font(R.font.montserrat_extrabold, FontWeight.ExtraBold),
)

val VairiotTypography = Typography(
    displayLarge  = TextStyle(fontFamily = MontserratFamily, fontWeight = FontWeight.ExtraBold, fontSize = 40.sp, color = VairiotCharcoal),
    headlineLarge = TextStyle(fontFamily = MontserratFamily, fontWeight = FontWeight.Bold,      fontSize = 24.sp, color = VairiotViolet),
    headlineMedium= TextStyle(fontFamily = MontserratFamily, fontWeight = FontWeight.Bold,      fontSize = 20.sp, color = VairiotCharcoal),
    titleLarge    = TextStyle(fontFamily = MontserratFamily, fontWeight = FontWeight.SemiBold,  fontSize = 18.sp, color = VairiotCharcoal),
    titleMedium   = TextStyle(fontFamily = MontserratFamily, fontWeight = FontWeight.SemiBold,  fontSize = 16.sp, color = VairiotCharcoal),
    bodyLarge     = TextStyle(fontFamily = MontserratFamily, fontWeight = FontWeight.Normal,    fontSize = 14.sp, color = VairiotCharcoal),
    bodyMedium    = TextStyle(fontFamily = MontserratFamily, fontWeight = FontWeight.Normal,    fontSize = 12.sp, color = VairiotCharcoal),
    labelLarge    = TextStyle(fontFamily = MontserratFamily, fontWeight = FontWeight.Bold,      fontSize = 14.sp),
    labelSmall    = TextStyle(fontFamily = MontserratFamily, fontWeight = FontWeight.Normal,    fontSize = 11.sp, color = VairiotCharcoal),
)
