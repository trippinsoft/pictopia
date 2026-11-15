import Foundation
import Photos
import UIKit

/// Duplicate Hunt prints from PhotoKit's small local preview only: no original bytes, no
/// network. The algorithm mirrors `lookalikePrint` in lib/pictopia/lookalikes.ts exactly.
enum PictopiaLookalike {
  static let side: Int = 32

  static func prints(_ ids: [String]) -> [[String: Any]] {
    let assets = PHAsset.fetchAssets(withLocalIdentifiers: ids, options: nil)
    let options = PHImageRequestOptions()
    options.isSynchronous = true
    options.isNetworkAccessAllowed = false
    options.deliveryMode = .highQualityFormat
    options.resizeMode = .fast
    var rows: [[String: Any]] = []
    for index in 0..<assets.count {
      let asset: PHAsset = assets.object(at: index)
      if asset.mediaType != .image { continue }
      autoreleasepool {
        let box = LookalikeImageBox()
        PHImageManager.default().requestImage(for: asset, targetSize: CGSize(width: 64, height: 64), contentMode: .aspectFit, options: options) { image, _ in box.set(image) }
        guard let cg = box.image?.cgImage, let gray = grayscale(cg) else { return }
        let result = measure(gray)
        rows.append(["id": asset.localIdentifier, "print": result.print, "sharpness": result.sharpness, "exposure": result.exposure])
      }
    }
    return rows
  }

  static func grayscale(_ image: CGImage) -> [Double]? {
    var rgba = [UInt8](repeating: 0, count: side * side * 4)
    let rendered = rgba.withUnsafeMutableBytes { buffer -> Bool in
      guard let ctx = CGContext(data: buffer.baseAddress, width: side, height: side, bitsPerComponent: 8, bytesPerRow: side * 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return false }
      ctx.interpolationQuality = .medium
      ctx.draw(image, in: CGRect(x: 0, y: 0, width: side, height: side))
      return true
    }
    if !rendered { return nil }
    var gray = [Double](repeating: 0, count: side * side)
    for i in 0..<(side * side) {
      let base: Int = i * 4
      let red: Double = 0.299 * Double(rgba[base])
      let green: Double = 0.587 * Double(rgba[base + 1])
      let blue: Double = 0.114 * Double(rgba[base + 2])
      gray[i] = red + green + blue
    }
    return gray
  }

  static func measure(_ gray: [Double]) -> (print: String, sharpness: Double, exposure: Double) {
    let digits: [Character] = Array("0123456789abcdef")
    var hex: String = ""
    var nibble: Int = 0
    var bits: Int = 0
    for y in 0..<16 {
      for x in 0..<16 {
        let row: Int = (y * (side - 1)) / 15
        let column: Int = (x * (side - 2)) / 15
        let i: Int = row * side + column
        let bit: Int = gray[i] > gray[i + 1] ? 1 : 0
        nibble = (nibble << 1) | bit
        bits += 1
        if bits == 4 { hex.append(digits[nibble]); nibble = 0; bits = 0 }
      }
    }
    return (hex, PictopiaPixelAnalysis.laplacianVariance(gray), PictopiaPixelAnalysis.meanBrightness(gray))
  }
}

private final class LookalikeImageBox: @unchecked Sendable {
  private let lock = NSLock()
  private var value: UIImage?
  func set(_ image: UIImage?) { lock.lock(); value = image; lock.unlock() }
  var image: UIImage? { lock.lock(); defer { lock.unlock() }; return value }
}
