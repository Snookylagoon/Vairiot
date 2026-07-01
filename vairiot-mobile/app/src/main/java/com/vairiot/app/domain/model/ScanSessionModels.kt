package com.vairiot.app.domain.model

import com.vairiot.app.data.api.AssetResponse

enum class SessionTagStatus { PENDING, KNOWN, NEW, MISSING, IGNORED }

/**
 * Scope used to derive the expected-asset set at session start. Names are
 * carried alongside IDs so the repository can filter the local
 * `cached_assets` table (which stores site/category by name, not by ID).
 */
data class SessionScope(
    val siteId:       String? = null,
    val siteName:     String? = null,
    val categoryId:   String? = null,
    val categoryName: String? = null,
)

/**
 * A single classified tag in an active scan session. `asset` is populated for
 * KNOWN and MISSING rows. For NEW / IGNORED rows only [epc] is meaningful.
 */
data class SessionTag(
    val epc:              String,
    val readCount:        Int,
    val firstSeenMs:      Long,
    val lastSeenMs:       Long,
    val status:           SessionTagStatus,
    val asset:            AssetResponse? = null,
    val ignoredByUserId:  String? = null,
    val ignoredAtMs:      Long? = null,
)

/**
 * Immutable snapshot of an active scan session. Emitted at most 1×/sec by
 * [com.vairiot.app.data.ScanSessionRepository.observeSnapshot] so the UI can
 * render without churning even under heavy read traffic.
 */
data class SessionSnapshot(
    val sessionId:  String,
    val known:      List<SessionTag> = emptyList(),
    val newTags:    List<SessionTag> = emptyList(),
    val missing:    List<SessionTag> = emptyList(),
    val ignored:    List<SessionTag> = emptyList(),
    val isComplete: Boolean = false,
) {
    val knownCount:   Int get() = known.size
    val newCount:     Int get() = newTags.size
    val missingCount: Int get() = missing.size
    val ignoredCount: Int get() = ignored.size
}
