package com.vairiot.app.sync

import retrofit2.HttpException
import java.io.IOException

/** How a queue item's sync failure should be treated. */
enum class SyncFailureKind {
    /** No connectivity / timeout — retry later, does NOT count as an attempt. */
    NETWORK,
    /** Not signed in (401/403) — stop draining, does NOT count as an attempt. */
    AUTH,
    /** Server hiccup (5xx) — counts as an attempt, retry with backoff. */
    TRANSIENT,
    /** Server rejected the payload (other 4xx) — counts as an attempt. */
    PERMANENT,
}

fun classifySyncFailure(e: Exception): SyncFailureKind = when {
    e is IOException -> SyncFailureKind.NETWORK
    e is HttpException && (e.code() == 401 || e.code() == 403) -> SyncFailureKind.AUTH
    e is HttpException && e.code() >= 500 -> SyncFailureKind.TRANSIENT
    e is HttpException -> SyncFailureKind.PERMANENT
    else -> SyncFailureKind.TRANSIENT
}
