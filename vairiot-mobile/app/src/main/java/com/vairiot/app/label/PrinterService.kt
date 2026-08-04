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
    suspend fun printBitmap(printerAddress: String, bitmap: Bitmap, copies: Int = 1): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            val device: BluetoothDevice = adapter?.getRemoteDevice(printerAddress)
                ?: return@withContext Result.failure(Exception("Bluetooth not available"))

            val socket: BluetoothSocket = device.createRfcommSocketToServiceRecord(SPP_UUID)
            socket.connect()

            try {
                val out = socket.outputStream
                repeat(copies.coerceIn(1, 20)) {
                    sendEscPosImage(out, bitmap)
                    out.write(byteArrayOf(0x0A, 0x0A, 0x0A)) // feed 3 lines
                }
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

        // ESC/POS: select bit-image mode
        out.write(byteArrayOf(0x1B, 0x40)) // init
        out.write(byteArrayOf(0x1B, 0x33, 0x00)) // set line spacing to 0

        // ESC * 33 (24-dot double density): n = dot columns; each column is
        // 3 bytes, byte k covering rows y+8k..y+8k+7 with the top row in the
        // most significant bit.
        for (y in 0 until h step 24) {
            out.write(byteArrayOf(0x1B, 0x2A, 33, (w and 0xFF).toByte(), ((w shr 8) and 0xFF).toByte()))
            val slice = ByteArrayOutputStream()
            for (col in 0 until w) {
                for (k in 0 until 3) {
                    var b = 0
                    for (bit in 0 until 8) {
                        val py = y + k * 8 + bit
                        if (py < h) {
                            val pixel = bitmap.getPixel(col, py)
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
