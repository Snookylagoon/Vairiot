package com.vairiot.app.sync

import com.vairiot.app.data.local.QueueState
import com.vairiot.app.data.local.QueuedAsset
import com.vairiot.app.data.local.QueuedPhoto
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.nio.file.Files

class AssetAndPhotoQueueTest {

    private val assetDao = FakeQueuedAssetDao()
    private val photoDao = FakeQueuedPhotoDao()
    private val dir: File = Files.createTempDirectory("queued-photos").toFile()

    @After
    fun cleanUp() {
        dir.deleteRecursively()
    }

    private fun photoFile(name: String) = File(dir, name).apply { writeText("webp") }

    // ─── Assets ───────────────────────────────────────────────────────────

    @Test
    fun `asset replay sends the key generated when it was queued`() = runBlocking {
        val queued = QueuedAsset(name = "Pump 4", rfidTag = "E200-1")
        assetDao.insert(queued)
        val api = FakeAssetApi(offline(), Unit)

        drainQueue(AssetSyncQueue(assetDao, photoDao, api))
        drainQueue(AssetSyncQueue(assetDao, photoDao, api))

        assertEquals(2, api.requests.size)
        assertTrue(api.requests.all { it.clientRequestId == queued.clientRequestId })
        assertTrue(assetDao.all.isEmpty())
    }

    @Test
    fun `asset 4xx is kept as dead`() = runBlocking {
        assetDao.insert(QueuedAsset(name = "Pump 4"))
        drainQueue(AssetSyncQueue(assetDao, photoDao, FakeAssetApi(http(422, "Asset limit reached"))))
        assertEquals(QueueState.DEAD, assetDao.get(1).state)
        assertEquals("HTTP 422: Asset limit reached", assetDao.get(1).lastError)
    }

    @Test
    fun `photos of an offline asset wait for it, then upload once it exists`() = runBlocking {
        val asset = QueuedAsset(name = "Pump 4")
        assetDao.insert(asset)
        photoDao.insert(QueuedPhoto(filePath = photoFile("a.webp").path, assetClientRequestId = asset.clientRequestId))

        val photoApi = FakePhotoApi()
        drainQueue(PhotoSyncQueue(photoDao, photoApi))
        assertTrue("no asset id yet, so nothing to upload", photoApi.uploads.isEmpty())

        drainQueue(AssetSyncQueue(assetDao, photoDao, FakeAssetApi()))
        assertEquals("asset-1", photoDao.get(1).assetId)

        drainQueue(PhotoSyncQueue(photoDao, photoApi))
        assertEquals("asset-1", photoApi.uploads.single().first)
        assertTrue(photoDao.all.isEmpty())
    }

    // ─── Photos ───────────────────────────────────────────────────────────

    @Test
    fun `uploaded photo is removed along with its files`() = runBlocking {
        val photo = photoFile("p.webp")
        val thumb = photoFile("p_thumb.webp")
        photoDao.insert(QueuedPhoto(filePath = photo.path, thumbPath = thumb.path, assetId = "asset-9"))

        drainQueue(PhotoSyncQueue(photoDao, FakePhotoApi()))

        assertTrue(photoDao.all.isEmpty())
        assertFalse(photo.exists())
        assertFalse(thumb.exists())
    }

    @Test
    fun `offline photo keeps its row and its file`() = runBlocking {
        val photo = photoFile("p.webp")
        photoDao.insert(QueuedPhoto(filePath = photo.path, assetId = "asset-9"))

        val report = drainQueue(PhotoSyncQueue(photoDao, FakePhotoApi(offline())))

        assertEquals(DrainOutcome.RETRY, report.outcome)
        assertEquals(QueueState.FAILED, photoDao.get(1).state)
        assertEquals(0, photoDao.get(1).attempts)
        assertTrue(photo.exists())
    }

    @Test
    fun `rejected photo is dead and its file is kept for retry`() = runBlocking {
        val photo = photoFile("p.webp")
        photoDao.insert(QueuedPhoto(filePath = photo.path, assetId = "asset-9"))

        drainQueue(PhotoSyncQueue(photoDao, FakePhotoApi(http(413, "File too large"))))

        assertEquals(QueueState.DEAD, photoDao.get(1).state)
        assertTrue(photo.exists())
    }

    @Test
    fun `photo whose file vanished is dead, not retried forever`() = runBlocking {
        photoDao.insert(QueuedPhoto(filePath = File(dir, "gone.webp").path, assetId = "asset-9"))
        val api = FakePhotoApi()

        drainQueue(PhotoSyncQueue(photoDao, api))

        assertTrue(api.uploads.isEmpty())
        assertEquals(QueueState.DEAD, photoDao.get(1).state)
    }
}
