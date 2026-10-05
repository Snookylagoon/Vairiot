package com.vairiot.app.sync

import com.google.gson.JsonParser
import retrofit2.HttpException
import java.io.IOException

/** How a queue item's sync failure should be treated. */
enum class SyncFailureKind {
    /** No connectivity or a timeout. Row -> FAILED, drain stops, no attempt counted. */
    NETWORK,
    /** The session was rejected (401). Row untouched, worker pauses until signed in again. */
    AUTH,
    /** The server is struggling (5xx, 408, 429). Row -> FAILED, no attempt counted. */
    TRANSIENT,
    /** The server rejected this payload (any other 4xx). Row -> DEAD with the server's message. */
    PERMANENT,
    /** 409 saying the record already exists — the earlier attempt landed. Treated as success. */
    DUPLICATE,
}

data class SyncFailure(val kind: SyncFailureKind, val message: String)

/**
 * 409 codes that mean "you already sent this". The server currently answers a
 * replayed clientRequestId with 201 and the original record, so these only
 * matter if it is changed to signal duplicates with a 409. Every other 409
 * (CAMPAIGN_NOT_ACTIVE, ZONE_LOCKED, ALREADY_DISPOSED…) is a real rejection:
 * treating those as success would delete a scan the server never stored.
 */
private val DUPLICATE_CODES = setOf("DUPLICATE_REQUEST")

/** Thrown for a queued row that can never be sent as-is (e.g. its photo file is gone). */
class UnsendableException(message: String) : Exception(message)

fun classifySyncFailure(e: Exception): SyncFailure {
    if (e is IOException) {
        return SyncFailure(SyncFailureKind.NETWORK, e.message ?: e.javaClass.simpleName)
    }
    if (e is UnsendableException) {
        return SyncFailure(SyncFailureKind.PERMANENT, e.message ?: "Cannot be uploaded")
    }
    if (e !is HttpException) {
        // Unexpected client-side error (e.g. a malformed response after the
        // server accepted the request). Retrying is safe: the replay carries
        // the same clientRequestId and the server dedupes it.
        return SyncFailure(SyncFailureKind.TRANSIENT, e.message ?: e.javaClass.simpleName)
    }
    val status = e.code()
    val body = parseErrorBody(e)
    val message = "HTTP $status: ${body.message ?: e.message()}".trimEnd(':', ' ')
    val kind = when {
        status == 401 -> SyncFailureKind.AUTH
        status == 408 || status == 429 || status >= 500 -> SyncFailureKind.TRANSIENT
        status == 409 && body.code in DUPLICATE_CODES -> SyncFailureKind.DUPLICATE
        else -> SyncFailureKind.PERMANENT
    }
    return SyncFailure(kind, message)
}

private data class ErrorBody(val message: String?, val code: String?)

/** The API's error shape is `{"error": "<message>", "code": "<CODE>"}` (vairiot-api error-handler.ts). */
private fun parseErrorBody(e: HttpException): ErrorBody {
    val raw = try {
        e.response()?.errorBody()?.string()
    } catch (_: Exception) {
        null
    } ?: return ErrorBody(null, null)
    return try {
        val obj = JsonParser.parseString(raw).asJsonObject
        ErrorBody(
            message = obj.get("error")?.takeIf { it.isJsonPrimitive }?.asString,
            code = obj.get("code")?.takeIf { it.isJsonPrimitive }?.asString,
        )
    } catch (_: Exception) {
        ErrorBody(raw.take(200).ifBlank { null }, null)
    }
}
