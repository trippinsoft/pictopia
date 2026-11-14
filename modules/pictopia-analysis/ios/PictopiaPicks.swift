import ExpoModulesCore
import Photos
import UIKit
import Vision

/** On-device judgment of which photos make good game cards: people, pets and places rather
 * than documents, receipts, cheques, whiteboards or screenshots. Reads a small local preview
 * only (never downloads, never saves anything) and uses Apple's Vision framework. */
final class PictopiaPicks {
  private let queue = DispatchQueue(label: "pictopia.picks", qos: .userInitiated, attributes: .concurrent)

  /** Labels from Vision's built-in classifier that mean "this is paperwork, not a memory". */
  private static let utilityLabels: Set<String> = [
    "document", "receipt", "screenshot", "handwriting", "text", "paper", "printed_page", "whiteboard",
    "blackboard", "menu", "envelope", "map", "diagram", "chart", "illustrations", "computer_monitor",
    "computer", "screen", "barcode", "qr_code", "credit_card", "money", "ticket",
  ]
  /** People, animals and places: the photos that make a memory game feel personal. */
  private static let memoryLabels: Set<String> = [
    "people", "adult", "child", "baby", "teen", "crowd", "portrait", "selfie", "wedding", "party", "celebration",
    "animal", "dog", "cat", "pet", "bird", "horse",
    "outdoor", "sky", "beach", "mountain", "landscape", "nature", "water", "sea", "lake", "river", "sunset_sunrise",
    "tree", "forest", "park", "garden", "snow", "cityscape", "structure", "building", "bridge", "monument", "street",
  ]

  func assess(_ ids: [String], promise: Promise) {
    queue.async {
      let access = PHPhotoLibrary.authorizationStatus(for: .readWrite)
      guard access == .authorized || access == .limited else { promise.resolve([]); return }
      let assets = PHAsset.fetchAssets(withLocalIdentifiers: ids, options: nil)
      var list: [PHAsset] = []
      assets.enumerateObjects { asset, _, _ in list.append(asset) }
      var results = [[String: Any]?](repeating: nil, count: list.count)
      let lock = NSLock()
      DispatchQueue.concurrentPerform(iterations: list.count) { index in
        let result = Self.assess(list[index])
        lock.lock(); results[index] = result; lock.unlock()
      }
      promise.resolve(results.compactMap { $0 })
    }
  }

  private static func assess(_ asset: PHAsset) -> [String: Any]? {
    let options = PHImageRequestOptions()
    options.isSynchronous = true
    options.isNetworkAccessAllowed = false
    options.deliveryMode = .highQualityFormat
    options.resizeMode = .fast
    var picture: CGImage?
    PHImageManager.default().requestImage(for: asset, targetSize: CGSize(width: 360, height: 360), contentMode: .aspectFit, options: options) { image, _ in
      picture = image?.cgImage
    }
    guard let image = picture else { return nil }
    let handler = VNImageRequestHandler(cgImage: image, options: [:])
    let classify = VNClassifyImageRequest()
    let faces = VNDetectFaceRectanglesRequest()
    var requests: [VNRequest] = [classify, faces]
    var aesthetics: VNRequest?
    if #available(iOS 18.0, *) {
      let request = VNCalculateImageAestheticsScoresRequest()
      aesthetics = request
      requests.append(request)
    }
    do { try handler.perform(requests) } catch { return nil }

    let labels = (classify.results ?? []).filter { $0.confidence >= 0.3 }
    let utilityConfidence = labels.filter { utilityLabels.contains($0.identifier) }.map { Double($0.confidence) }.max() ?? 0
    let memoryConfidence = labels.filter { memoryLabels.contains($0.identifier) }.map { Double($0.confidence) }.max() ?? 0
    let faceCount = faces.results?.count ?? 0
    var utility = (utilityConfidence >= 0.5 && faceCount == 0) || asset.mediaSubtypes.contains(.photoScreenshot)
    var score = memoryConfidence + min(Double(faceCount), 3) * 0.5 - utilityConfidence
    if #available(iOS 18.0, *), let observation = (aesthetics as? VNCalculateImageAestheticsScoresRequest)?.results?.first {
      // Apple's own "utility image" flag covers documents, receipts, screenshots and the like.
      if observation.isUtility { utility = true }
      score += Double(observation.overallScore)
    }
    return ["id": asset.localIdentifier, "utility": utility, "score": score, "faces": faceCount]
  }
}
