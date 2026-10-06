package com.vairiot.app.sync

import com.vairiot.app.data.api.AssetCreateRequest
import com.vairiot.app.data.api.AssetResponse
import com.vairiot.app.data.api.AuditScanEventResponse
import com.vairiot.app.data.api.RecordScanRequest
import com.vairiot.app.data.local.QueueState
import com.vairiot.app.data.local.QueuedAsset
import com.vairiot.app.data.local.QueuedAssetDao
import com.vairiot.app.data.local.QueuedPhoto
import com.vairiot.app.data.local.QueuedPhotoDao
import com.vairiot.app.data.local.QueuedScan
import com.vairiot.app.data.local.QueuedScanDao
import com.vairiot.app.data.local.StateCount
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import retrofit2.HttpException
import retrofit2.Response
import java.io.File
import java.io.IOException
import java.net.SocketTimeoutException

// In-memory stand-ins for the Room DAOs and the API. Each fake DAO mirrors the
// SQL in its interface, so the drain rules are tested against the same state
// transitions the real queue makes.

/** An HTTP error shaped like the API's `{ "error": ..., "code": ... }` body. */
fun http(status: Int, message: String = "", code: String? = null): HttpException {
    val json = buildString {
        append("{\"error\":\"").append(message).append('"')
        if (code != null) append(",\"code\":\"").append(code).append('"')
        append('}')
    }
    return HttpException(Response.error<Any>(status, json.toResponseBody("application/json".toMediaType())))
}

fun offline() = IOException("Unable to resolve host")
fun timeout() = SocketTimeoutException("timeout")

private fun counts(states: List<String>) =
    states.groupingBy { it }.eachCount().map { (state, n) -> StateCount(state, n) }

class FakeQueuedScanDao : QueuedScanDao {
    val rows = MutableStateFlow<List<QueuedScan>>(emptyList())
    private var nextId = 1L
    val all get() = rows.value
    fun get(id: Long) = rows.value.single { it.id == id }

    private fun update(id: Long, f: (QueuedScan) -> QueuedScan) {
        rows.value = rows.value.map { if (it.id == id) f(it) else it }
    }

    override suspend fun insert(scan: QueuedScan): Long {
        val id = nextId++
        rows.value = rows.value + scan.copy(id = id)
        return id
    }
    override suspend fun takeBatch(limit: Int) =
        rows.value.filter { it.state == QueueState.PENDING || it.state == QueueState.FAILED }.take(limit)
    override suspend fun deleteById(id: Long) { rows.value = rows.value.filterNot { it.id == id } }
    override suspend fun markFailed(id: Long, error: String) =
        update(id) { it.copy(state = QueueState.FAILED, lastError = error) }
    override suspend fun markDead(id: Long, error: String) =
        update(id) { it.copy(state = QueueState.DEAD, attempts = it.attempts + 1, lastError = error) }
    override fun pendingCountByCampaign(campaignId: String): Flow<Int> =
        rows.map { r -> r.count { it.campaignId == campaignId && it.state != QueueState.DEAD } }
    override fun pendingByCampaign(campaignId: String): Flow<List<QueuedScan>> =
        rows.map { r -> r.filter { it.campaignId == campaignId && it.state != QueueState.DEAD } }
    override fun countsByState(): Flow<List<StateCount>> = rows.map { r -> counts(r.map { it.state }) }
    override fun deadItems(): Flow<List<QueuedScan>> = rows.map { r -> r.filter { it.state == QueueState.DEAD } }
    override suspend fun retryDead(id: Long) = update(id) {
        if (it.state == QueueState.DEAD) it.copy(state = QueueState.PENDING, lastError = null) else it
    }
    override suspend fun retryAllDead() {
        rows.value = rows.value.map {
            if (it.state == QueueState.DEAD) it.copy(state = QueueState.PENDING, lastError = null) else it
        }
    }
    override suspend fun discardDead(id: Long) {
        rows.value = rows.value.filterNot { it.id == id && it.state == QueueState.DEAD }
    }
    override suspend fun discardAllDead() {
        rows.value = rows.value.filterNot { it.state == QueueState.DEAD }
    }
}

class FakeQueuedAssetDao : QueuedAssetDao {
    val rows = MutableStateFlow<List<QueuedAsset>>(emptyList())
    private var nextId = 1L
    val all get() = rows.value
    fun get(id: Long) = rows.value.single { it.id == id }

    private fun update(id: Long, f: (QueuedAsset) -> QueuedAsset) {
        rows.value = rows.value.map { if (it.id == id) f(it) else it }
    }

    override suspend fun insert(asset: QueuedAsset): Long {
        val id = nextId++
        rows.value = rows.value + asset.copy(id = id)
        return id
    }
    override suspend fun takeBatch(limit: Int) =
        rows.value.filter { it.state == QueueState.PENDING || it.state == QueueState.FAILED }.take(limit)
    override suspend fun deleteById(id: Long) { rows.value = rows.value.filterNot { it.id == id } }
    override suspend fun markFailed(id: Long, error: String) =
        update(id) { it.copy(state = QueueState.FAILED, lastError = error) }
    override suspend fun markDead(id: Long, error: String) =
        update(id) { it.copy(state = QueueState.DEAD, attempts = it.attempts + 1, lastError = error) }
    override fun countsByState(): Flow<List<StateCount>> = rows.map { r -> counts(r.map { it.state }) }
    override fun deadItems(): Flow<List<QueuedAsset>> = rows.map { r -> r.filter { it.state == QueueState.DEAD } }
    override suspend fun retryDead(id: Long) = update(id) {
        if (it.state == QueueState.DEAD) it.copy(state = QueueState.PENDING, lastError = null) else it
    }
    override suspend fun retryAllDead() {
        rows.value = rows.value.map {
            if (it.state == QueueState.DEAD) it.copy(state = QueueState.PENDING, lastError = null) else it
        }
    }
    override suspend fun discardDead(id: Long) {
        rows.value = rows.value.filterNot { it.id == id && it.state == QueueState.DEAD }
    }
    override suspend fun discardAllDead() {
        rows.value = rows.value.filterNot { it.state == QueueState.DEAD }
    }
}

class FakeQueuedPhotoDao : QueuedPhotoDao {
    val rows = MutableStateFlow<List<QueuedPhoto>>(emptyList())
    private var nextId = 1L
    val all get() = rows.value
    fun get(id: Long) = rows.value.single { it.id == id }

    private fun update(id: Long, f: (QueuedPhoto) -> QueuedPhoto) {
        rows.value = rows.value.map { if (it.id == id) f(it) else it }
    }

    override suspend fun insert(photo: QueuedPhoto): Long {
        val id = nextId++
        rows.value = rows.value + photo.copy(id = id)
        return id
    }
    override suspend fun takeBatch(limit: Int) = rows.value
        .filter { (it.state == QueueState.PENDING || it.state == QueueState.FAILED) && it.assetId != null }
        .take(limit)
    override suspend fun getById(id: Long) = rows.value.firstOrNull { it.id == id }
    override suspend fun deleteById(id: Long) { rows.value = rows.value.filterNot { it.id == id } }
    override suspend fun markFailed(id: Long, error: String) =
        update(id) { it.copy(state = QueueState.FAILED, lastError = error) }
    override suspend fun markDead(id: Long, error: String) =
        update(id) { it.copy(state = QueueState.DEAD, attempts = it.attempts + 1, lastError = error) }
    override suspend fun attachToAsset(assetClientRequestId: String, assetId: String) {
        rows.value = rows.value.map {
            if (it.assetClientRequestId == assetClientRequestId && it.assetId == null) it.copy(assetId = assetId) else it
        }
    }
    override fun pendingCountForAsset(assetId: String): Flow<Int> =
        rows.map { r -> r.count { it.assetId == assetId && it.state != QueueState.DEAD } }
    override fun countsByState(): Flow<List<StateCount>> = rows.map { r -> counts(r.map { it.state }) }
    override fun deadItems(): Flow<List<QueuedPhoto>> = rows.map { r -> r.filter { it.state == QueueState.DEAD } }
    override suspend fun deadItemsOnce() = rows.value.filter { it.state == QueueState.DEAD }
    override suspend fun retryDead(id: Long) = update(id) {
        if (it.state == QueueState.DEAD) it.copy(state = QueueState.PENDING, lastError = null) else it
    }
    override suspend fun retryAllDead() {
        rows.value = rows.value.map {
            if (it.state == QueueState.DEAD) it.copy(state = QueueState.PENDING, lastError = null) else it
        }
    }
    override suspend fun discardDead(id: Long) {
        rows.value = rows.value.filterNot { it.id == id && it.state == QueueState.DEAD }
    }
}

/**
 * Fake audit-scan endpoint. [responses] is consumed one entry per call: an
 * exception is thrown, anything else means "accepted". Once it runs out,
 * every call succeeds. Every request is recorded in [requests].
 */
class FakeScanApi(vararg responses: Any) : ScanSender {
    private val script = ArrayDeque(responses.toList())
    val requests = mutableListOf<Pair<String, RecordScanRequest>>()

    override suspend fun send(campaignId: String, request: RecordScanRequest): AuditScanEventResponse {
        requests += campaignId to request
        (script.removeFirstOrNull() as? Exception)?.let { throw it }
        return AuditScanEventResponse(
            id = "ev-${requests.size}",
            campaignId = campaignId,
            tagValue = request.tagValue,
            assetId = null,
            result = "found",
            scannedAt = "2026-10-05T10:00:00Z",
        )
    }
}

class FakeAssetApi(vararg responses: Any) : AssetSender {
    private val script = ArrayDeque(responses.toList())
    val requests = mutableListOf<AssetCreateRequest>()

    override suspend fun create(request: AssetCreateRequest): AssetResponse {
        requests += request
        (script.removeFirstOrNull() as? Exception)?.let { throw it }
        return AssetResponse(
            id = "asset-${requests.size}",
            assetNumber = "AST-${requests.size}",
            name = request.name,
            description = null,
            status = "active",
            condition = "good",
            serialNumber = null,
            barcode = request.barcode,
            rfidTag = request.rfidTag,
            category = null,
            site = null,
            location = null,
        )
    }
}

class FakePhotoApi(vararg responses: Any) : PhotoUploader {
    private val script = ArrayDeque(responses.toList())
    val uploads = mutableListOf<Pair<String, File>>()

    override suspend fun upload(assetId: String, photo: File, thumb: File?) {
        uploads += assetId to photo
        (script.removeFirstOrNull() as? Exception)?.let { throw it }
    }
}
