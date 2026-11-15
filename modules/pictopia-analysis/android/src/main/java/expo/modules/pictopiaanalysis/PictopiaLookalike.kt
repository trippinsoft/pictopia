package expo.modules.pictopiaanalysis

import android.content.Context
import android.graphics.Bitmap
import android.os.Build
import android.provider.MediaStore
import android.util.Size

/** Duplicate Hunt prints from MediaStore's small thumbnail only; never the original file.
 * The algorithm mirrors `lookalikePrint` in lib/pictopia/lookalikes.ts exactly. */
object PictopiaLookalike {
  private const val SIDE = 32
  private const val DIGITS = "0123456789abcdef"

  @Suppress("DEPRECATION")
  fun prints(context: Context, ids: List<String>): List<Map<String, Any>> {
    val rows = mutableListOf<Map<String, Any>>()
    for (id in ids) {
      try {
        val source = PictopiaReview.uri(context, id)
        if (source.toString().contains("/video/")) continue
        val bitmap = if (Build.VERSION.SDK_INT >= 29) context.contentResolver.loadThumbnail(source, Size(64, 64), null)
          else MediaStore.Images.Thumbnails.getThumbnail(context.contentResolver, id.toLong(), MediaStore.Images.Thumbnails.MICRO_KIND, null)
        if (bitmap == null) continue
        val small = Bitmap.createScaledBitmap(bitmap, SIDE, SIDE, true)
        val pixels = IntArray(SIDE * SIDE)
        small.getPixels(pixels, 0, SIDE, 0, 0, SIDE, SIDE)
        if (small !== bitmap) small.recycle()
        bitmap.recycle()
        val gray = DoubleArray(SIDE * SIDE) { i -> val p = pixels[i]; .299 * ((p shr 16) and 255) + .587 * ((p shr 8) and 255) + .114 * (p and 255) }
        val hex = StringBuilder()
        var nibble = 0; var bits = 0
        for (y in 0 until 16) for (x in 0 until 16) {
          val i = (y * (SIDE - 1) / 15) * SIDE + (x * (SIDE - 2) / 15)
          nibble = (nibble shl 1) or (if (gray[i] > gray[i + 1]) 1 else 0)
          if (++bits == 4) { hex.append(DIGITS[nibble]); nibble = 0; bits = 0 }
        }
        var sum = 0.0; var squares = 0.0; var n = 0
        for (y in 1 until SIDE - 1) for (x in 1 until SIDE - 1) {
          val i = y * SIDE + x
          val v = gray[i - 1] + gray[i + 1] + gray[i - SIDE] + gray[i + SIDE] - 4 * gray[i]
          sum += v; squares += v * v; n++
        }
        rows.add(mapOf("id" to id, "print" to hex.toString(), "sharpness" to (squares / n - (sum / n) * (sum / n)), "exposure" to gray.average()))
      } catch (_: Exception) { /* Unreadable preview: left out, tried again next scan. */ }
    }
    return rows
  }
}
