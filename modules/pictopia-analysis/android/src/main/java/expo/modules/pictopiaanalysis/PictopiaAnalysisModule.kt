package expo.modules.pictopiaanalysis

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import android.app.ActivityManager
import android.os.PowerManager
import android.os.Build
import android.provider.MediaStore
import android.net.Uri
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import java.io.File
import java.security.MessageDigest

class PictopiaAnalysisModule : Module() {
  @Volatile private var cancelled = false
  override fun definition() = ModuleDefinition {
    Name("PictopiaAnalysis")
    Function("cancel") { cancelled = true }
    AsyncFunction("canScan") {
      val context = appContext.reactContext ?: error("Context unavailable")
      val power = context.getSystemService(android.content.Context.POWER_SERVICE) as PowerManager
      val activity = context.getSystemService(android.content.Context.ACTIVITY_SERVICE) as ActivityManager
      val memory = ActivityManager.MemoryInfo()
      activity.getMemoryInfo(memory)
      !power.isPowerSaveMode && !memory.lowMemory
    }
    AsyncFunction("getMetadata") Coroutine { ids: List<String> ->
      withContext(Dispatchers.IO) {
        val context = appContext.reactContext ?: error("Context unavailable")
        val projection = mutableListOf("_id")
        if (Build.VERSION.SDK_INT >= 30) projection.add("is_favorite")
        if (Build.VERSION.SDK_INT >= 29) projection.add("relative_path")
        val result = mutableListOf<Map<String, Any>>()
        if (ids.isNotEmpty()) context.contentResolver.query(MediaStore.Files.getContentUri("external"), projection.toTypedArray(), "_id IN (${ids.joinToString(",") { "?" }})", ids.toTypedArray(), null)?.use { cursor ->
          while (cursor.moveToNext()) {
            val id = cursor.getString(0)
            val favoriteIndex = cursor.getColumnIndex("is_favorite")
            val pathIndex = cursor.getColumnIndex("relative_path")
            val favorite = favoriteIndex >= 0 && cursor.getInt(favoriteIndex) == 1
            val path = if (pathIndex >= 0) cursor.getString(pathIndex) ?: "" else ""
            result.add(mapOf("id" to id, "favorite" to favorite, "screenshot" to path.lowercase().split('/').any { it == "screenshots" || it == "screenshot" }))
          }
        }
        result
      }
    }
    AsyncFunction("analyze") Coroutine { id: String, uri: String, isVideo: Boolean ->
      withContext(Dispatchers.IO) {
        cancelled = false
        val context = appContext.reactContext ?: error("Context unavailable")
        fun stream() = if (uri.startsWith("file://")) File(Uri.parse(uri).path ?: error("Missing path")).inputStream() else context.contentResolver.openInputStream(Uri.parse(uri)) ?: error("Media unavailable")
        val digest = MessageDigest.getInstance("SHA-256")
        var size = 0L
        stream().use { input ->
          val buffer = ByteArray(65536)
          while (true) { if (cancelled) error("Scan paused"); val count = input.read(buffer); if (count < 0) break; digest.update(buffer, 0, count); size += count }
        }
        val result = mutableMapOf<String, Any>("hash" to digest.digest().joinToString("") { "%02x".format(it.toInt() and 255) }, "size" to size)
        if (!isVideo) {
          val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
          stream().use { BitmapFactory.decodeStream(it, null, bounds) }
          var sample = 1
          while (bounds.outWidth / sample > 128 || bounds.outHeight / sample > 128) sample *= 2
          val options = BitmapFactory.Options().apply { inSampleSize = sample; inPreferredConfig = Bitmap.Config.ARGB_8888 }
          val bitmap = stream().use { BitmapFactory.decodeStream(it, null, options) } ?: error("Unsupported image")
          val small = Bitmap.createScaledBitmap(bitmap, 32, 32, true)
          val pixels = IntArray(1024)
          small.getPixels(pixels, 0, 32, 0, 0, 32, 32)
          val gray = DoubleArray(1024) { i -> val p = pixels[i]; .299 * ((p shr 16) and 255) + .587 * ((p shr 8) and 255) + .114 * (p and 255) }
          val hash = StringBuilder()
          for (y in 0..7) for (x in 0..7) { val yy = y * 31 / 7; val xx = x * 30 / 7; hash.append(if (gray[yy * 32 + xx] > gray[yy * 32 + xx + 1]) '1' else '0') }
          var sum = 0.0; var squares = 0.0; var n = 0
          for (y in 1..30) for (x in 1..30) { val i = y * 32 + x; val v = gray[i-1] + gray[i+1] + gray[i-32] + gray[i+32] - 4 * gray[i]; sum += v; squares += v*v; n++ }
          result["perceptual"] = hash.toString()
          result["sharpness"] = squares / n - (sum / n) * (sum / n)
          result["exposure"] = gray.average()
          if (small !== bitmap) small.recycle()
          bitmap.recycle()
        }
        result
      }
    }
  }
}
