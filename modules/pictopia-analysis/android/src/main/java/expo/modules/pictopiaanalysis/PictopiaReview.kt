package expo.modules.pictopiaanalysis

import android.content.ContentUris
import android.content.Context
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import android.graphics.Bitmap
import android.util.Size
import java.io.File
import java.security.MessageDigest

/** Work with MediaStore IDs and temporary, bounded thumbnails only. */
object PictopiaReview {
  fun uri(context: Context, id: String): Uri {
    val number = id.toLongOrNull() ?: error("Invalid media reference")
    val row = ContentUris.withAppendedId(MediaStore.Files.getContentUri("external"), number)
    context.contentResolver.query(row, arrayOf(MediaStore.Files.FileColumns.MEDIA_TYPE), null, null, null)?.use { cursor ->
      if (!cursor.moveToFirst()) error("This photo is no longer available. Check library access.")
      val collection = if (cursor.getInt(0) == MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO) MediaStore.Video.Media.EXTERNAL_CONTENT_URI else MediaStore.Images.Media.EXTERNAL_CONTENT_URI
      return ContentUris.withAppendedId(collection, number)
    }
    error("This photo is unavailable. Check library access.")
  }
  fun favorite(context: Context, id: String): Boolean {
    if (Build.VERSION.SDK_INT < 30) error("Native favorites require Android 11 or later.")
    context.contentResolver.query(uri(context, id), arrayOf(MediaStore.MediaColumns.IS_FAVORITE), null, null, null)?.use { cursor ->
      if (cursor.moveToFirst()) return cursor.getInt(0) == 1
    }
    error("The favorite status could not be read.")
  }
  @Synchronized
  @Suppress("DEPRECATION")
  fun localSize(context: Context, id: String): Double? {
    val source = uri(context, id)
    return context.contentResolver.query(source, arrayOf(MediaStore.MediaColumns.SIZE), null, null, null)?.use { cursor ->
      val column = cursor.getColumnIndex(MediaStore.MediaColumns.SIZE)
      if (!cursor.moveToFirst() || column < 0 || cursor.isNull(column)) null
      else cursor.getLong(column).takeIf { it > 0 }?.toDouble()
    }
  }
  fun thumbnail(context: Context, id: String, version: String): String {
    val source = uri(context, id) // verify access before returning even a cached thumbnail
    val directory = File(context.cacheDir, "pictopia-thumbnails").apply { mkdirs() }
    val key = MessageDigest.getInstance("SHA-256").digest("$id:$version".toByteArray()).joinToString("") { "%02x".format(it.toInt() and 255) }
    val target = File(directory, "$key.jpg")
    if (!target.exists()) {
      val bitmap = if (Build.VERSION.SDK_INT >= 29) context.contentResolver.loadThumbnail(source, Size(160, 160), null)
        else if (source.toString().contains("/video/")) MediaStore.Video.Thumbnails.getThumbnail(context.contentResolver, id.toLong(), MediaStore.Video.Thumbnails.MINI_KIND, null)
        else MediaStore.Images.Thumbnails.getThumbnail(context.contentResolver, id.toLong(), MediaStore.Images.Thumbnails.MINI_KIND, null)
      if (bitmap == null) error("Thumbnail unavailable")
      val scale = minOf(1f, 160f / maxOf(bitmap.width, bitmap.height))
      val small = Bitmap.createScaledBitmap(bitmap, maxOf(1, (bitmap.width * scale).toInt()), maxOf(1, (bitmap.height * scale).toInt()), true)
      try { target.outputStream().use { small.compress(Bitmap.CompressFormat.JPEG, 78, it) } }
      finally { if (small !== bitmap) small.recycle(); bitmap.recycle() }
      val files = directory.listFiles()?.sortedBy { it.lastModified() } ?: emptyList()
      files.take(maxOf(0, files.size - 128)).filter { it != target }.forEach { it.delete() }
    }
    return Uri.fromFile(target).toString()
  }
}
