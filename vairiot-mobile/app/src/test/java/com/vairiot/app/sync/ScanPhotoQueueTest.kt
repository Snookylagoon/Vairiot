package com.vairiot.app.sync

import com.vairiot.app.data.local.QueueState
import com.vairiot.app.data.local.QueuedPhoto
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/** Stage 1.8: scan photos upload through the scan endpoint, after their scan. */
class ScanPhotoQueueTest {

    private val dao = FakeQueuedPhotoDao()
    private val assetUploads = mutableListOf<String>()
    private val scanUploads = mutableListOf<QueuedPhoto>()
    private val queue = PhotoSyncQueue(
        dao,
        PhotoUploader { assetId, _, _ -> assetUploads += assetId },
        ScanPhotoUploader { item, _, _ -> scanUploads += item },
    )

    private fun file(): String = File.createTempFile("scan", ".webp").apply { deleteOnExit() }.absolutePath

    private fun scanPhoto(key: String) = QueuedPhoto(
        filePath = file(), campaignId = "camp-1", scanClientRequestId = key,
        photoType = "inventory", latitude = 41.7151, longitude = 44.8271, geoAccuracyMeters = 6.0,
    )

    @Test
    fun `a scan photo waits while its scan is still queued, then uploads with its fields`() = runBlocking {
        dao.insert(scanPhoto("scan-key-1"))
        dao.queuedScanKeys += "scan-key-1"
        drainQueue(queue)
        assertTrue(scanUploads.isEmpty())
        assertEquals(1, dao.all.size)

        dao.queuedScanKeys.clear()
        drainQueue(queue)
        val sent = scanUploads.single()
        assertEquals("camp-1", sent.campaignId)
        assertEquals(41.7151, sent.latitude!!, 0.0)
        assertTrue(dao.all.isEmpty())
    }

    @Test
    fun `asset photos keep using the asset endpoint`() = runBlocking {
        dao.insert(QueuedPhoto(filePath = file(), assetId = "asset-1"))
        drainQueue(queue)
        assertEquals(listOf("asset-1"), assetUploads)
        assertTrue(scanUploads.isEmpty())
    }

    @Test
    fun `an offline scan photo stays queued for the next run`() = runBlocking {
        val failing = PhotoSyncQueue(dao, PhotoUploader { _, _, _ -> }, ScanPhotoUploader { _, _, _ -> throw offline() })
        dao.insert(scanPhoto("scan-key-2"))
        drainQueue(failing)
        assertEquals(QueueState.FAILED, dao.all.single().state)
    }
}
