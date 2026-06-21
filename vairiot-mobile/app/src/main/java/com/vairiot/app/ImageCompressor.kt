package com.vairiot.app

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import android.os.Build
import androidx.exifinterface.media.ExifInterface
import java.io.File
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID

data class CompressionResult(
    val displayFile: File,
    val thumbFile: File,
    val displayBytes: Long,
    val thumbBytes: Long,
)

object ImageCompressor {

    private const val DISPLAY_MAX_EDGE = 1600
    private const val DISPLAY_QUALITY = 80

    private const val THUMBNAIL_MAX_EDGE = 400
    private const val THUMBNAIL_QUALITY = 75

    fun compress(context: Context, sourceUri: Uri, assetRef: String? = null): CompressionResult {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        context.contentResolver.openInputStream(sourceUri).use { input ->
            BitmapFactory.decodeStream(input, null, bounds)
        }

        val decodeOptions = BitmapFactory.Options().apply {
            inSampleSize = calculateInSampleSize(bounds.outWidth, bounds.outHeight, DISPLAY_MAX_EDGE)
        }

        var bitmap = context.contentResolver.openInputStream(sourceUri).use { input ->
            BitmapFactory.decodeStream(input, null, decodeOptions)
        } ?: throw IllegalArgumentException("Could not read the selected image.")

        bitmap = applyExifRotation(context, sourceUri, bitmap)

        val displayBitmap = scaleToMaxEdge(bitmap, DISPLAY_MAX_EDGE)

        val baseName = buildBaseName(assetRef)
        val outputDir = File(context.filesDir, "photos").apply { mkdirs() }
        val displayFile = File(outputDir, "$baseName.webp")
        val thumbFile = File(outputDir, "${baseName}_thumb.webp")

        writeWebp(displayBitmap, displayFile, DISPLAY_QUALITY)

        val thumbBitmap = scaleToMaxEdge(displayBitmap, THUMBNAIL_MAX_EDGE)
        writeWebp(thumbBitmap, thumbFile, THUMBNAIL_QUALITY)

        return CompressionResult(
            displayFile = displayFile,
            thumbFile = thumbFile,
            displayBytes = displayFile.length(),
            thumbBytes = thumbFile.length(),
        )
    }

    private fun calculateInSampleSize(width: Int, height: Int, target: Int): Int {
        var sample = 1
        val longEdge = maxOf(width, height)
        while (longEdge / (sample * 2) >= target) {
            sample *= 2
        }
        return sample
    }

    private fun applyExifRotation(context: Context, uri: Uri, bitmap: Bitmap): Bitmap {
        val orientation = context.contentResolver.openInputStream(uri).use { input ->
            if (input == null) {
                ExifInterface.ORIENTATION_NORMAL
            } else {
                ExifInterface(input).getAttributeInt(
                    ExifInterface.TAG_ORIENTATION,
                    ExifInterface.ORIENTATION_NORMAL,
                )
            }
        }

        val matrix = Matrix()
        when (orientation) {
            ExifInterface.ORIENTATION_ROTATE_90 -> matrix.postRotate(90f)
            ExifInterface.ORIENTATION_ROTATE_180 -> matrix.postRotate(180f)
            ExifInterface.ORIENTATION_ROTATE_270 -> matrix.postRotate(270f)
            ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.postScale(-1f, 1f)
            ExifInterface.ORIENTATION_FLIP_VERTICAL -> matrix.postScale(1f, -1f)
            else -> return bitmap
        }

        val rotated = Bitmap.createBitmap(
            bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true,
        )
        if (rotated != bitmap) bitmap.recycle()
        return rotated
    }

    private fun scaleToMaxEdge(bitmap: Bitmap, maxEdge: Int): Bitmap {
        val longEdge = maxOf(bitmap.width, bitmap.height)
        if (longEdge <= maxEdge) return bitmap

        val scale = maxEdge.toFloat() / longEdge
        val newWidth = (bitmap.width * scale).toInt()
        val newHeight = (bitmap.height * scale).toInt()
        return Bitmap.createScaledBitmap(bitmap, newWidth, newHeight, true)
    }

    private fun writeWebp(bitmap: Bitmap, file: File, quality: Int) {
        FileOutputStream(file).use { out ->
            val format = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                Bitmap.CompressFormat.WEBP_LOSSY
            } else {
                @Suppress("DEPRECATION")
                Bitmap.CompressFormat.WEBP
            }
            bitmap.compress(format, quality, out)
        }
    }

    private fun buildBaseName(assetRef: String?): String {
        val timestamp = SimpleDateFormat("yyyyMMdd-HHmmss", Locale.UK).format(Date())
        val shortId = UUID.randomUUID().toString().take(6)
        val prefix = if (assetRef != null) "asset-${assetRef}_" else ""
        return "$prefix$timestamp" + "_" + shortId
    }
}
