package com.vairiot.app.domain.model

/** One grade of the condition scale (GET /condition/scale, stage 1.15). Grade 5 is best. */
data class ConditionScaleEntry(
    val grade: Int,
    val label: String,
    val criteria: String,
    val colour: String,
    val impairmentIndicator: Boolean = false,
    val photoRequired: Boolean = false,
)

data class ConditionScaleResponse(val source: String, val entries: List<ConditionScaleEntry>)

/** Mirrors vairiot-shared DEFAULT_CONDITION_SCALE, for use offline before the tenant's scale loads. */
val DEFAULT_CONDITION_SCALE = listOf(
    ConditionScaleEntry(5, "Excellent", "As new. No visible wear or defects; fully functional.", "#16a34a"),
    ConditionScaleEntry(4, "Good", "Minor wear only. Fully functional; routine maintenance.", "#65a30d"),
    ConditionScaleEntry(3, "Fair", "Visible wear or minor damage. Functional; repair needed soon.", "#d97706"),
    ConditionScaleEntry(2, "Poor", "Significant damage or deterioration. Partly functional; major repair needed.", "#ea580c", impairmentIndicator = true, photoRequired = true),
    ConditionScaleEntry(1, "Unserviceable", "Not functional or unsafe. Replace or dispose.", "#dc2626", impairmentIndicator = true, photoRequired = true),
)
