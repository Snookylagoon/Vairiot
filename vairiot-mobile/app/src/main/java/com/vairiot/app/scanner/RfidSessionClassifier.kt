package com.vairiot.app.scanner

import com.vairiot.app.data.local.SessionTagEntity
import com.vairiot.app.domain.model.SessionTagStatus

/**
 * Pure-Kotlin implementation of the read-confidence and classification rules
 * from the Vairiot RFID Scan Session Manager user story.
 *
 * A tag is "confident" (visible to the operator) once EITHER:
 *   • [minReadCount] reads have accumulated, OR
 *   • the tag has been continuously visible for at least [minVisibleMs].
 *
 * Once confident, it is classified as KNOWN or NEW against the expected-asset
 * EPC set. IGNORED and MISSING are terminal states set explicitly (Ignored by
 * the operator; Missing at session-complete for expected EPCs never scanned).
 */
class RfidSessionClassifier(
    val minReadCount: Int  = 3,
    val minVisibleMs: Long = 500L,
) {

    fun isConfident(tag: SessionTagEntity): Boolean {
        if (tag.readCount >= minReadCount) return true
        val visibleMs = tag.lastSeenMs - tag.firstSeenMs
        return visibleMs >= minVisibleMs
    }

    /**
     * Deterministic classification given the session tag row and the
     * expected-asset EPC set. Ignored is sticky and always wins.
     */
    fun classify(tag: SessionTagEntity, expectedEpcs: Set<String>): SessionTagStatus {
        val current = runCatching { SessionTagStatus.valueOf(tag.status) }
            .getOrDefault(SessionTagStatus.PENDING)
        if (current == SessionTagStatus.IGNORED) return SessionTagStatus.IGNORED
        if (!isConfident(tag)) return SessionTagStatus.PENDING
        return if (tag.epc in expectedEpcs) SessionTagStatus.KNOWN else SessionTagStatus.NEW
    }
}
