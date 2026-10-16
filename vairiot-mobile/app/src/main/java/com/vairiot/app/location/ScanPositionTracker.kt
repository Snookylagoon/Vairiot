package com.vairiot.app.location

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * Keeps a recent GPS fix while an audit is running, so each scan can carry the
 * device position without waiting for GPS (stage 1.5). The scan loop never
 * blocks: a scan takes [latest], which is null when there is no fix younger
 * than [maxAgeMs], when permission is missing, or when GIS is off.
 */
class ScanPositionTracker(
    private val provider: PositionProvider,
    private val clock: () -> Long = System::currentTimeMillis,
    private val refreshEveryMs: Long = 20_000,
    private val maxAgeMs: Long = 60_000,
) {
    @Volatile private var fix: GeoFix? = null
    private var job: Job? = null

    /** Refreshes the fix in [scope] until [stop]. Idempotent. */
    fun start(scope: CoroutineScope) {
        if (job?.isActive == true) return
        job = scope.launch {
            while (isActive) {
                refreshOnce()
                delay(refreshEveryMs)
            }
        }
    }

    fun stop() {
        job?.cancel()
        job = null
    }

    /** One attempt; a failure (no permission, GPS off, no signal) keeps the last fix. */
    suspend fun refreshOnce() {
        try {
            fix = provider.currentFix()
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            // No permission, GPS off or no signal: nothing new to attach.
        }
    }

    /** The current fix if it is recent enough to describe where the scan happened. */
    fun latest(): GeoFix? = fix?.takeIf { clock() - it.capturedAtMs <= maxAgeMs }
}
