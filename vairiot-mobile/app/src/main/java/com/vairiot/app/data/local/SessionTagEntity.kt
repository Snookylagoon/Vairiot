package com.vairiot.app.data.local

import androidx.room.Entity

/**
 * One tag observation within a scan session. Composite PK (sessionId, epc)
 * enforces the "duplicate EPC records prohibited" performance rule and lets
 * upserts of the same EPC merge cleanly.
 */
@Entity(tableName = "session_tags", primaryKeys = ["sessionId", "epc"])
data class SessionTagEntity(
    val sessionId:        String,
    val epc:              String,
    val readCount:        Int,
    val firstSeenMs:      Long,
    val lastSeenMs:       Long,
    /** Persisted as the [com.vairiot.app.domain.model.SessionTagStatus] name. */
    val status:           String,
    /** Resolved when a PENDING row is promoted and the EPC matches an asset. */
    val assetId:          String? = null,
    val ignoredByUserId:  String? = null,
    val ignoredAtMs:      Long? = null,
)
