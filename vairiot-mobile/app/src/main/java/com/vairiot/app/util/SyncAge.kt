package com.vairiot.app.util

/**
 * "Last synced …" wording for the asset list header. Kept in whole minutes
 * and hours so the label doesn't flicker; null when there has been no sync.
 */
fun formatSyncAge(lastSyncedAtMs: Long?, nowMs: Long): String? {
    if (lastSyncedAtMs == null) return null
    val minutes = ((nowMs - lastSyncedAtMs).coerceAtLeast(0) / 60_000).toInt()
    return when {
        minutes < 1 -> "Last synced just now"
        minutes == 1 -> "Last synced 1 minute ago"
        minutes < 60 -> "Last synced $minutes minutes ago"
        minutes < 120 -> "Last synced 1 hour ago"
        minutes < 48 * 60 -> "Last synced ${minutes / 60} hours ago"
        else -> "Last synced ${minutes / (24 * 60)} days ago"
    }
}
