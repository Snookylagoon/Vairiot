package com.vairiot.app.sync

/**
 * One offline queue as seen by [drainQueue]. Implemented per queue (scans,
 * assets, photos) over its Room DAO and the API call that sends a row.
 */
interface SyncQueue<T> {
    /** Rows to try, oldest first: PENDING and FAILED, never DEAD. */
    suspend fun nextBatch(limit: Int): List<T>
    fun idOf(item: T): Long
    /** Sends the row. Throws on any failure; [classifySyncFailure] decides what happens. */
    suspend fun send(item: T)
    /** The server has the row (accepted now, or an earlier attempt landed). Remove it. */
    suspend fun onSynced(item: T)
    suspend fun markFailed(id: Long, error: String)
    suspend fun markDead(id: Long, error: String)
}

enum class DrainOutcome {
    /** Every row was tried; nothing transient is left over. */
    DONE,
    /** Offline or a transient server error. Ask WorkManager to retry with backoff. */
    RETRY,
    /** 401: the session is gone. Stop until the user signs in again; don't spin on backoff. */
    PAUSED_AUTH,
}

data class DrainReport(
    val outcome: DrainOutcome,
    val synced: Int,
    val failed: Int,
    val dead: Int,
)

/**
 * Drains [queue] under the S0.2 rules:
 *
 * - success, or a 409 duplicate -> row removed;
 * - network error / timeout -> row FAILED, drain stops (the rest would fail too);
 * - 5xx / 408 / 429 -> row FAILED, drain continues with the next row;
 * - other 4xx (incl. 403 and non-duplicate 409) -> row DEAD with the server's message;
 * - 401 -> row untouched, drain stops, worker pauses.
 *
 * Network and server errors never count as attempts, and no failure ever
 * deletes a row. Each row is tried at most once per run so one bad row can't
 * starve the rest, and WorkManager's backoff spaces out the retries.
 */
suspend fun <T> drainQueue(queue: SyncQueue<T>, batchSize: Int = 50): DrainReport {
    var synced = 0
    var failed = 0
    var dead = 0
    var retry = false
    val seen = HashSet<Long>()

    while (true) {
        val batch = queue.nextBatch(batchSize).filter { queue.idOf(it) !in seen }
        if (batch.isEmpty()) break
        for (item in batch) {
            val id = queue.idOf(item)
            seen.add(id)
            try {
                queue.send(item)
                queue.onSynced(item)
                synced++
            } catch (e: Exception) {
                val failure = classifySyncFailure(e)
                when (failure.kind) {
                    SyncFailureKind.DUPLICATE -> {
                        queue.onSynced(item)
                        synced++
                    }
                    SyncFailureKind.NETWORK -> {
                        queue.markFailed(id, failure.message)
                        failed++
                        return DrainReport(DrainOutcome.RETRY, synced, failed, dead)
                    }
                    SyncFailureKind.AUTH ->
                        return DrainReport(DrainOutcome.PAUSED_AUTH, synced, failed, dead)
                    SyncFailureKind.TRANSIENT -> {
                        queue.markFailed(id, failure.message)
                        failed++
                        retry = true
                    }
                    SyncFailureKind.PERMANENT -> {
                        queue.markDead(id, failure.message)
                        dead++
                    }
                }
            }
        }
    }
    return DrainReport(if (retry) DrainOutcome.RETRY else DrainOutcome.DONE, synced, failed, dead)
}
