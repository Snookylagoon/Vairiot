package com.vairiot.app.data.api

/** Body of POST /audits/{id}/scans; online and queued replays use the same fields. */
data class RecordScanRequest(
    val tagValue:   String,
    val deviceId:   String? = null,
    val locationId: String? = null,
    val condition:  String? = null,
    /** Idempotency key so offline replays can't double-count. */
    val clientRequestId: String? = null,
    /** ISO-8601 device capture time for offline scans replayed later. */
    val capturedAt: String? = null,
    /** Device position at the scan; the server drops it while GIS is off. */
    val latitude: Double? = null,
    val longitude: Double? = null,
    val geoAccuracyMeters: Double? = null,
)
