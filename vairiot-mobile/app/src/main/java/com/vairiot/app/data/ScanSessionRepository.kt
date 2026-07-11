package com.vairiot.app.data

import com.vairiot.app.data.api.AssetCreateRequest
import com.vairiot.app.data.api.AssetResponse
import com.vairiot.app.data.api.AssetUpdateRequest
import com.vairiot.app.data.api.CategoryRefResponse
import com.vairiot.app.data.api.LocationRefResponse
import com.vairiot.app.data.api.ScanSessionTagDto
import com.vairiot.app.data.api.ScanSessionUploadRequest
import com.vairiot.app.data.api.SiteRefResponse
import com.vairiot.app.data.api.VairiotApiService
import com.vairiot.app.data.local.CachedAsset
import com.vairiot.app.data.local.CachedAssetDao
import com.vairiot.app.data.local.ScanSessionDao
import com.vairiot.app.data.local.ScanSessionEntity
import com.vairiot.app.data.local.SessionTagDao
import com.vairiot.app.data.local.SessionTagEntity
import com.vairiot.app.domain.model.SessionScope
import com.vairiot.app.domain.model.SessionSnapshot
import com.vairiot.app.domain.model.SessionTag
import com.vairiot.app.domain.model.SessionTagStatus
import com.vairiot.app.scanner.RfidSessionClassifier
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.emitAll
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.sample
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Owns the lifecycle of a scan session — from creation through per-EPC upserts,
 * live snapshotting, operator actions, and completion.
 *
 * Deliberately backend-agnostic: reads and writes go through Room; the server
 * is only touched for asset registration/assignment and (best-effort) session
 * upload at completion. Operates fully offline.
 */
@Singleton
class ScanSessionRepository @Inject constructor(
    private val sessionDao:     ScanSessionDao,
    private val tagDao:         SessionTagDao,
    private val cachedAssetDao: CachedAssetDao,
    private val assetRepo:      AssetRepository,
    private val api:            VairiotApiService,
) {

    private val classifier = RfidSessionClassifier()

    /**
     * Expected-asset EPC set per active session. Populated at session start
     * and refreshed whenever the operator registers/assigns during the run
     * (so newly-linked assets promote correctly to KNOWN on the next read).
     */
    private val expectedByEpc = ConcurrentHashMap<String, MutableMap<String, CachedAsset>>()

    suspend fun startSession(scope: SessionScope, nowMs: Long = System.currentTimeMillis()): String {
        val id = UUID.randomUUID().toString()
        sessionDao.insert(
            ScanSessionEntity(
                id           = id,
                siteId       = scope.siteId,
                siteName     = scope.siteName,
                categoryId   = scope.categoryId,
                categoryName = scope.categoryName,
                createdAtMs  = nowMs,
            ),
        )
        expectedByEpc[id] = loadExpectedByEpc(scope)
        return id
    }

    /**
     * Called for every EPC delivered by the scanner. Upserts the row with an
     * incremented read count / last-seen timestamp. If the row transitions
     * from PENDING to confident, resolves classification and persists it.
     */
    suspend fun recordRead(sessionId: String, epc: String, nowMs: Long = System.currentTimeMillis()) {
        val trimmed = epc.trim()
        if (trimmed.isEmpty()) return

        val existing = tagDao.getByEpc(sessionId, trimmed)
        val next = if (existing == null) {
            SessionTagEntity(
                sessionId    = sessionId,
                epc          = trimmed,
                readCount    = 1,
                firstSeenMs  = nowMs,
                lastSeenMs   = nowMs,
                status       = SessionTagStatus.PENDING.name,
            )
        } else {
            existing.copy(
                readCount  = existing.readCount + 1,
                lastSeenMs = nowMs,
            )
        }
        val expected = expectedByEpc[sessionId] ?: emptyMap()
        val resolved = classifier.classify(next, expected.keys)
        val withStatus = if (SessionTagStatus.valueOf(next.status) != resolved && resolved != SessionTagStatus.PENDING) {
            next.copy(
                status  = resolved.name,
                assetId = expected[trimmed]?.id,
            )
        } else next
        tagDao.upsert(withStatus)
    }

    @OptIn(FlowPreview::class)
    fun observeSnapshot(sessionId: String): Flow<SessionSnapshot> = flow {
        val session = sessionDao.getById(sessionId)
        val scope = SessionScope(
            siteId       = session?.siteId,
            siteName     = session?.siteName,
            categoryId   = session?.categoryId,
            categoryName = session?.categoryName,
        )
        // Cold repopulate on process restart or observer resubscription.
        if (expectedByEpc[sessionId] == null) {
            expectedByEpc[sessionId] = loadExpectedByEpc(scope)
        }
        emitAll(snapshotFlow(sessionId))
    }

    @OptIn(FlowPreview::class)
    private fun snapshotFlow(sessionId: String): Flow<SessionSnapshot> =
        combine(
            tagDao.observeAll(sessionId),
            sessionDao.observeById(sessionId),
        ) { tags, session ->
            val expected = expectedByEpc[sessionId] ?: emptyMap()
            buildSnapshot(sessionId, tags, expected, session?.completedAtMs != null)
        }.sample(SNAPSHOT_INTERVAL_MS)

    private fun buildSnapshot(
        sessionId: String,
        tags: List<SessionTagEntity>,
        expected: Map<String, CachedAsset>,
        isComplete: Boolean,
    ): SessionSnapshot {
        val known   = mutableListOf<SessionTag>()
        val newList = mutableListOf<SessionTag>()
        val ignored = mutableListOf<SessionTag>()
        val missing = mutableListOf<SessionTag>()

        val seenExpected = HashSet<String>(expected.size)
        for (row in tags) {
            val status = runCatching { SessionTagStatus.valueOf(row.status) }
                .getOrDefault(SessionTagStatus.PENDING)
            when (status) {
                SessionTagStatus.PENDING -> {
                    /* deliberately hidden from operator view */
                }
                SessionTagStatus.KNOWN -> {
                    val asset = expected[row.epc]?.toApiResponse()
                    known += row.toDomain(status, asset)
                    seenExpected += row.epc
                }
                SessionTagStatus.NEW -> newList += row.toDomain(status, null)
                SessionTagStatus.IGNORED -> ignored += row.toDomain(status, null)
                SessionTagStatus.MISSING -> {
                    val asset = expected[row.epc]?.toApiResponse()
                    missing += row.toDomain(status, asset)
                }
            }
        }
        // Only compute Missing on completed sessions per the spec — mid-session
        // an expected asset simply hasn't been scanned yet.
        if (isComplete) {
            for ((epc, asset) in expected) {
                if (epc in seenExpected) continue
                if (missing.any { it.epc == epc }) continue
                missing += SessionTag(
                    epc          = epc,
                    readCount    = 0,
                    firstSeenMs  = 0L,
                    lastSeenMs   = 0L,
                    status       = SessionTagStatus.MISSING,
                    asset        = asset.toApiResponse(),
                )
            }
        }
        return SessionSnapshot(
            sessionId  = sessionId,
            known      = known.sortedByDescending { it.lastSeenMs },
            newTags    = newList.sortedByDescending { it.firstSeenMs },
            missing    = missing.sortedBy { it.asset?.name?.lowercase() ?: it.epc },
            ignored    = ignored.sortedByDescending { it.ignoredAtMs ?: it.lastSeenMs },
            isComplete = isComplete,
        )
    }

    suspend fun ignoreTag(sessionId: String, epc: String, userId: String?, nowMs: Long = System.currentTimeMillis()) {
        tagDao.updateStatus(
            sessionId       = sessionId,
            epc             = epc,
            status          = SessionTagStatus.IGNORED.name,
            assetId         = null,
            ignoredByUserId = userId,
            ignoredAtMs     = nowMs,
        )
    }

    /**
     * Registers a brand-new asset for the given EPC via the assets API, then
     * promotes the session row to KNOWN. Throws on API failure so the caller
     * can surface an error — offline registration is not supported (the caller
     * should retry once connectivity returns).
     */
    suspend fun registerNewAsset(
        sessionId: String,
        epc: String,
        name: String,
    ): AssetResponse {
        val asset = api.createAsset(AssetCreateRequest(name = name, rfidTag = epc))
        cachedAssetDao.upsertAll(listOf(asset.toCached()))
        expectedByEpc[sessionId]?.put(epc, asset.toCached())
        tagDao.updateStatus(
            sessionId       = sessionId,
            epc             = epc,
            status          = SessionTagStatus.KNOWN.name,
            assetId         = asset.id,
            ignoredByUserId = null,
            ignoredAtMs     = null,
        )
        return asset
    }

    /**
     * Links an existing asset's rfidTag to this EPC and promotes the row to
     * KNOWN. Used when the operator recognises a New EPC as belonging to a
     * legacy asset whose tag was never enrolled.
     */
    suspend fun assignExistingAsset(
        sessionId: String,
        epc: String,
        assetId: String,
    ): AssetResponse {
        val asset = api.updateAsset(assetId, AssetUpdateRequest(rfidTag = epc))
        cachedAssetDao.upsertAll(listOf(asset.toCached()))
        expectedByEpc[sessionId]?.put(epc, asset.toCached())
        tagDao.updateStatus(
            sessionId       = sessionId,
            epc             = epc,
            status          = SessionTagStatus.KNOWN.name,
            assetId         = assetId,
            ignoredByUserId = null,
            ignoredAtMs     = null,
        )
        return asset
    }

    /**
     * Marks the session complete and materialises MISSING rows for every
     * expected EPC that wasn't scanned. Returns the final snapshot.
     */
    suspend fun completeSession(sessionId: String, nowMs: Long = System.currentTimeMillis()): SessionSnapshot {
        val expected = expectedByEpc[sessionId] ?: loadExpectedByEpc(
            SessionScope(
                siteId       = sessionDao.getById(sessionId)?.siteId,
                siteName     = sessionDao.getById(sessionId)?.siteName,
                categoryId   = sessionDao.getById(sessionId)?.categoryId,
                categoryName = sessionDao.getById(sessionId)?.categoryName,
            ),
        )
        val existing = tagDao.listAllOnce(sessionId)
        val known = existing.filter { it.status == SessionTagStatus.KNOWN.name }.map { it.epc }.toHashSet()
        val missingRows = expected.filterKeys { it !in known && existing.none { row -> row.epc == it } }
            .map { (epc, asset) ->
                SessionTagEntity(
                    sessionId    = sessionId,
                    epc          = epc,
                    readCount    = 0,
                    firstSeenMs  = 0L,
                    lastSeenMs   = 0L,
                    status       = SessionTagStatus.MISSING.name,
                    assetId      = asset.id,
                )
            }
        if (missingRows.isNotEmpty()) tagDao.upsertAll(missingRows)
        sessionDao.markCompleted(sessionId, nowMs)
        val allTags = tagDao.listAllOnce(sessionId)
        return buildSnapshot(sessionId, allTags, expected, isComplete = true)
    }

    /**
     * Best-effort upload of the session payload. Silently no-ops on network
     * failure (e.g. no connectivity) — the session remains on device and can
     * be retried later. The endpoint upserts on sessionId, so a retry after a
     * timeout is safe.
     */
    suspend fun uploadSession(sessionId: String, nowMs: Long = System.currentTimeMillis()) {
        val session = sessionDao.getById(sessionId) ?: return
        val tags = tagDao.listAllOnce(sessionId)
        val payload = ScanSessionUploadRequest(
            sessionId    = sessionId,
            siteId       = session.siteId,
            categoryId   = session.categoryId,
            createdAtMs  = session.createdAtMs,
            completedAtMs = session.completedAtMs ?: nowMs,
            tags = tags.map {
                ScanSessionTagDto(
                    epc          = it.epc,
                    status       = it.status,
                    readCount    = it.readCount,
                    firstSeenMs  = it.firstSeenMs,
                    lastSeenMs   = it.lastSeenMs,
                    assetId      = it.assetId,
                )
            },
        )
        try {
            api.uploadScanSession(payload)
            sessionDao.markUploaded(sessionId, nowMs)
        } catch (_: Exception) {
            // Deferred — caller may schedule a WorkManager retry.
        }
    }

    private suspend fun loadExpectedByEpc(scope: SessionScope): MutableMap<String, CachedAsset> {
        // Snapshot the current local cache once at session start. The cache is
        // refreshed periodically by AssetRepository — refreshing during a
        // session would shift the expected set out from under the operator.
        val all = cachedAssetDao.searchFlow("").firstOrNull().orEmpty()
        val filtered = all.asSequence()
            .filter { asset -> !asset.rfidTag.isNullOrBlank() }
            .filter { asset ->
                scope.siteName == null || asset.siteName?.equals(scope.siteName, ignoreCase = true) == true
            }
            .filter { asset ->
                scope.categoryName == null || asset.categoryName?.equals(scope.categoryName, ignoreCase = true) == true
            }
        val map = HashMap<String, CachedAsset>()
        for (asset in filtered) {
            val tag = asset.rfidTag?.trim().orEmpty()
            if (tag.isNotEmpty()) map[tag] = asset
        }
        return map
    }

    companion object {
        const val SNAPSHOT_INTERVAL_MS = 1_000L
    }
}

private fun SessionTagEntity.toDomain(
    status: SessionTagStatus,
    asset: AssetResponse?,
): SessionTag = SessionTag(
    epc              = epc,
    readCount        = readCount,
    firstSeenMs      = firstSeenMs,
    lastSeenMs       = lastSeenMs,
    status           = status,
    asset            = asset,
    ignoredByUserId  = ignoredByUserId,
    ignoredAtMs      = ignoredAtMs,
)

private fun CachedAsset.toApiResponse(): AssetResponse = AssetResponse(
    id           = id,
    assetNumber  = assetNumber,
    name         = name,
    description  = description,
    status       = status,
    condition    = condition,
    serialNumber = serialNumber,
    barcode      = barcode,
    rfidTag      = rfidTag,
    category     = categoryName?.let { CategoryRefResponse(id = "", name = it) },
    site         = siteName?.let { SiteRefResponse(id = "", name = it) },
    location     = locationName?.let { LocationRefResponse(id = "", name = it) },
)

private fun AssetResponse.toCached(): CachedAsset = CachedAsset(
    id           = id,
    assetNumber  = assetNumber,
    name         = name,
    description  = description,
    status       = status,
    condition    = condition,
    serialNumber = serialNumber,
    barcode      = barcode,
    rfidTag      = rfidTag,
    categoryName = category?.name,
    siteName     = site?.name,
    locationName = location?.name,
)
