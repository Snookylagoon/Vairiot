package com.vairiot.app.data

import android.content.Context
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.vairiot.app.data.api.LabelTemplateDto
import com.vairiot.app.data.api.VairiotApiService
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Label templates designed in the desktop web app. Fetched from the server
 * when online and persisted so the template picker still works offline with
 * the last-known templates.
 */
@Singleton
class LabelTemplateRepository @Inject constructor(
    private val api: VairiotApiService,
    @ApplicationContext private val context: Context,
) {
    companion object {
        private const val PREFS_NAME = "label_template_prefs"
        private const val KEY_TEMPLATES = "templates_json"
    }

    private val gson = Gson()
    private val listType = object : TypeToken<List<LabelTemplateDto>>() {}.type

    /** Server first; falls back to the last persisted copy when offline. */
    suspend fun getTemplates(): List<LabelTemplateDto> {
        return try {
            fetchAndCache()
        } catch (_: Exception) {
            getCached() ?: emptyList()
        }
    }

    /** Server only — throws when unreachable so callers can report it. */
    suspend fun refreshTemplates(): List<LabelTemplateDto> = fetchAndCache()

    private suspend fun fetchAndCache(): List<LabelTemplateDto> {
        val templates = api.getLabelTemplates()
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
            .putString(KEY_TEMPLATES, gson.toJson(templates))
            .apply()
        return templates
    }

    private fun getCached(): List<LabelTemplateDto>? =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString(KEY_TEMPLATES, null)
            ?.let { try { gson.fromJson(it, listType) } catch (_: Exception) { null } }
}
