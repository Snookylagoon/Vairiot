package com.vairiot.app.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * A [Button] (or [OutlinedButton] when [baseColor] is null) that scales down,
 * tilts on the X axis for a 3D press effect, and darkens its container color
 * while pressed.
 */
@Composable
fun PressableButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    baseColor: Color? = null,
    shape: Shape = RoundedCornerShape(12.dp),
    height: Dp = 56.dp,
    content: @Composable RowScope.() -> Unit,
) {
    val interactionSource = remember { MutableInteractionSource() }
    val pressed by interactionSource.collectIsPressedAsState()

    val scale by animateFloatAsState(
        targetValue = if (pressed) 0.93f else 1f,
        animationSpec = spring(dampingRatio = Spring.DampingRatioMediumBouncy),
        label = "pressableButtonScale",
    )
    val tilt by animateFloatAsState(
        targetValue = if (pressed) 10f else 0f,
        animationSpec = spring(dampingRatio = Spring.DampingRatioMediumBouncy),
        label = "pressableButtonTilt",
    )

    val pressedModifier = modifier
        .height(height)
        .graphicsLayer {
            scaleX = scale
            scaleY = scale
            rotationX = tilt
            cameraDistance = 12f * density
        }

    if (baseColor != null) {
        val containerColor by animateColorAsState(
            targetValue = if (pressed) {
                Color(baseColor.red * 0.65f, baseColor.green * 0.65f, baseColor.blue * 0.65f, baseColor.alpha)
            } else {
                baseColor
            },
            label = "pressableButtonColor",
        )
        Button(
            onClick = onClick,
            enabled = enabled,
            interactionSource = interactionSource,
            modifier = pressedModifier,
            shape = shape,
            colors = ButtonDefaults.buttonColors(containerColor = containerColor),
            elevation = ButtonDefaults.buttonElevation(defaultElevation = 4.dp, pressedElevation = 1.dp),
            content = content,
        )
    } else {
        OutlinedButton(
            onClick = onClick,
            enabled = enabled,
            interactionSource = interactionSource,
            modifier = pressedModifier,
            shape = shape,
            content = content,
        )
    }
}
