package com.vairiot.app.label

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.os.Build
import androidx.core.content.ContextCompat
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.io.OutputStream
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

data class PrinterInfo(
    val name: String,
    val address: String,
    val paired: Boolean,
)

@Singleton
class PrinterService @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    companion object {
        private val SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
        private const val PREFS_NAME = "printer_prefs"
        private const val KEY_ADDRESS = "saved_printer_address"
        private const val KEY_NAME = "saved_printer_name"
    }

    private val bluetoothManager: BluetoothManager? =
        context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
    private val adapter: BluetoothAdapter? = bluetoothManager?.adapter

    fun isBluetoothAvailable(): Boolean = adapter != null

    fun isBluetoothEnabled(): Boolean = adapter?.isEnabled == true

    fun hasPermissions(): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            return ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED &&
                   ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_SCAN) == PackageManager.PERMISSION_GRANTED
        }
        return ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH) == PackageManager.PERMISSION_GRANTED
    }

    @SuppressLint("MissingPermission")
    fun getPairedPrinters(): List<PrinterInfo> {
        if (!hasPermissions() || !isBluetoothEnabled()) return emptyList()
        return adapter?.bondedDevices?.map { device ->
            PrinterInfo(
                name = device.name ?: "Unknown",
                address = device.address,
                paired = true,
            )
        } ?: emptyList()
    }

    fun getSavedPrinter(): PrinterInfo? {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val address = prefs.getString(KEY_ADDRESS, null) ?: return null
        val name = prefs.getString(KEY_NAME, "Printer") ?: "Printer"
        return PrinterInfo(name, address, paired = true)
    }

    fun savePrinter(printer: PrinterInfo) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
            .putString(KEY_ADDRESS, printer.address)
            .putString(KEY_NAME, printer.name)
            .apply()
    }

    fun clearSavedPrinter() {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
            .remove(KEY_ADDRESS)
            .remove(KEY_NAME)
            .apply()
    }

    @SuppressLint("MissingPermission")
    suspend fun printBitmap(printerAddress: String, bitmap: Bitmap): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            val device: BluetoothDevice = adapter?.getRemoteDevice(printerAddress)
                ?: return@withContext Result.failure(Exception("Bluetooth not available"))

            val socket: BluetoothSocket = device.createRfcommSocketToServiceRecord(SPP_UUID)
            socket.connect()

            try {
                val out = socket.outputStream
                sendEscPosImage(out, bitmap)
                out.write(byteArrayOf(0x0A, 0x0A, 0x0A)) // feed 3 lines
                out.flush()
                Result.success(Unit)
            } finally {
                socket.close()
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    private fun sendEscPosImage(out: OutputStream, original: Bitmap) {
        val maxWidth = 576
        val bitmap = if (original.width > maxWidth) {
            val ratio = maxWidth.toFloat() / original.width
            Bitmap.createScaledBitmap(original, maxWidth, (original.height * ratio).toInt(), true)
        } else original

        val w = bitmap.width
        val h = bitmap.height
        val bytesPerRow = (w + 7) / 8

        // ESC/POS: select bit-image mode
        out.write(byteArrayOf(0x1B, 0x40)) // init
        out.write(byteArrayOf(0x1B, 0x33, 0x00)) // set line spacing to 0

        for (y in 0 until h step 24) {
            out.write(byteArrayOf(0x1B, 0x2A, 33, (bytesPerRow and 0xFF).toByte(), ((bytesPerRow shr 8) and 0xFF).toByte()))
            val slice = ByteArrayOutputStream()
            for (x in 0 until bytesPerRow) {
                for (k in 0 until 3) {
                    var b = 0
                    for (bit in 0 until 8) {
                        val px = x * 8 + bit
                        val py = y + k * 8 + (7 - bit % 8).let { _ -> k * 8 + bit }
                        val py2 = y + k * 8 + bit
                        if (px < w && py2 < h) {
                            val pixel = bitmap.getPixel(px, py2)
                            val lum = (0.299 * android.graphics.Color.red(pixel) +
                                       0.587 * android.graphics.Color.green(pixel) +
                                       0.114 * android.graphics.Color.blue(pixel))
                            if (lum < 128) {
                                b = b or (1 shl (7 - bit))
                            }
                        }
                    }
                    slice.write(b)
                }
            }
            out.write(slice.toByteArray())
            out.write(0x0A) // line feed
        }

        out.write(byteArrayOf(0x1B, 0x32)) // restore default line spacing

        if (bitmap !== original) bitmap.recycle()
    }
}
