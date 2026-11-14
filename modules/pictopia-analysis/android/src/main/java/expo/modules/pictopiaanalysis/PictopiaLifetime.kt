package expo.modules.pictopiaanalysis

import android.util.Base64
import java.security.KeyFactory
import java.security.Signature
import java.security.spec.X509EncodedKeySpec
import java.math.BigInteger

/** No key or grant is stored natively. The public key is pinned in the published app. */
internal object PictopiaLifetime {
  fun verify(payload: String, signature: String, publicKey: String): Boolean = try {
    val raw = Base64.decode(signature, Base64.DEFAULT)
    require(raw.size == 64 && payload.toByteArray(Charsets.UTF_8).size <= 2048)
    // WebCrypto uses fixed-width r || s; Android's verifier uses ASN.1 DER integers.
    val r = BigInteger(1, raw.copyOfRange(0, 32)).toByteArray()
    val s = BigInteger(1, raw.copyOfRange(32, 64)).toByteArray()
    val der = byteArrayOf(0x30, (r.size + s.size + 4).toByte(), 0x02, r.size.toByte()) + r + byteArrayOf(0x02, s.size.toByte()) + s
    val key = KeyFactory.getInstance("EC").generatePublic(X509EncodedKeySpec(Base64.decode(publicKey, Base64.DEFAULT)))
    Signature.getInstance("SHA256withECDSA").run {
      initVerify(key)
      update(payload.toByteArray(Charsets.UTF_8))
      verify(der)
    }
  } catch (_: Exception) { false }
}
