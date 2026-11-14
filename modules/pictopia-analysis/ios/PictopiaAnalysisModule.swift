import ExpoModulesCore
import Photos
import UIKit
import CryptoKit

public class PictopiaAnalysisModule: Module {
  private let review = PictopiaReview()
  private let picks = PictopiaPicks()
  private let lock = NSLock()
  private var currentRequest: PHAssetResourceDataRequestID?
  private let queue = DispatchQueue(label: "pictopia.analysis", qos: .utility)
  public func definition() -> ModuleDefinition {
    Name("PictopiaAnalysis")
    View(PictopiaLivePhotoView.self) {
      Events("onReady", "onUnavailable")
      Prop("assetId") { (view: PictopiaLivePhotoView, id: String) in view.load(id: id) }
    }
    Function("cancel") {
      self.lock.lock(); let request = self.currentRequest; self.lock.unlock()
      if let request = request { PHAssetResourceManager.default().cancelDataRequest(request) }
    }
    AsyncFunction("assessPhotos") { (ids: [String], promise: Promise) in self.picks.assess(ids, promise: promise) }
    AsyncFunction("localAssetSize") { (id: String, promise: Promise) in self.review.localSize(id, promise: promise) }
    AsyncFunction("reviewFavorite") { (id: String) -> Bool in try PictopiaReview.asset(id).isFavorite }
    AsyncFunction("setReviewFavorite") { (id: String, value: Bool, promise: Promise) in self.review.favorite(id, value: value, promise: promise) }
    AsyncFunction("reviewDisplay") { (id: String, version: String, token: String, network: Bool, promise: Promise) in
      self.review.display(id, version: version, token: token, network: network, promise: promise)
    }.runOnQueue(.main)
    AsyncFunction("reviewVideoSource") { (id: String, token: String, promise: Promise) in self.review.videoSource(id, token: token, promise: promise) }.runOnQueue(.main)
    AsyncFunction("reviewVideoPlayback") { (id: String, token: String, network: Bool, promise: Promise) in self.review.videoPlayback(id, token: token, network: network, promise: promise) }.runOnQueue(.main)
    AsyncFunction("cancelReviewDisplay") { (token: String) in self.review.cancelDisplay(token) }.runOnQueue(.main)
    AsyncFunction("reviewThumbnail") { (id: String, version: String, promise: Promise) in self.review.thumbnail(id, version: version, promise: promise) }
    AsyncFunction("shareReviewAsset") { (id: String, promise: Promise) in
      self.review.share(id, presenter: self.appContext?.utilities?.currentViewController(), promise: promise)
    }.runOnQueue(.main)
    AsyncFunction("cancelReviewShare") { self.review.cancelShare() }.runOnQueue(.main)
    AsyncFunction("canScan") { () -> Bool in
      return !ProcessInfo.processInfo.isLowPowerModeEnabled && ProcessInfo.processInfo.thermalState.rawValue < ProcessInfo.ThermalState.serious.rawValue
    }
    AsyncFunction("getMetadata") { (ids: [String]) -> [[String: Any]] in
      let assets = PHAsset.fetchAssets(withLocalIdentifiers: ids, options: nil)
      var result: [[String: Any]] = []
      assets.enumerateObjects { asset, _, _ in
        result.append(["id": asset.localIdentifier, "favorite": asset.isFavorite, "screenshot": asset.mediaSubtypes.contains(.photoScreenshot)])
      }
      return result
    }
    // Developer diagnostics: every asset on one MM-DD calendar day (phone time zone), read with
    // the widest fetch options PhotoKit offers, so what the app's enumeration leaves out can be
    // named. Metadata only: no image bytes, no downloads, no changes.
    AsyncFunction("libraryCensus") { (monthDay: String, promise: Promise) in
      self.queue.async {
        let options = PHFetchOptions()
        options.includeHiddenAssets = true
        options.includeAllBurstAssets = true
        options.includeAssetSourceTypes = [.typeUserLibrary, .typeCloudShared, .typeiTunesSynced]
        let assets = PHAsset.fetchAssets(with: options)
        // Mirror Expo SDK 55's production fetch exactly, alongside the wider census.
        let indexedOptions = PHFetchOptions()
        indexedOptions.includeAssetSourceTypes = [.typeUserLibrary]
        indexedOptions.includeHiddenAssets = false
        indexedOptions.includeAllBurstAssets = false
        indexedOptions.predicate = NSPredicate(format: "mediaType == %d OR mediaType == %d", PHAssetMediaType.image.rawValue, PHAssetMediaType.video.rawValue)
        var enumerable = Set<String>()
        PHAsset.fetchAssets(with: indexedOptions).enumerateObjects { asset, _, _ in enumerable.insert(asset.localIdentifier) }
        let calendar = Calendar.current
        var onDate: [[String: Any]] = []
        var inventory: [[String: Any]] = []
        var undated = 0
        assets.enumerateObjects { asset, _, _ in
          let date = asset.creationDate
          if date == nil { undated += 1 }
          let source: String = asset.sourceType.contains(.typeCloudShared) ? "shared" : asset.sourceType.contains(.typeiTunesSynced) ? "synced" : "library"
          let type: String = asset.mediaType == .image ? "photo" : asset.mediaType == .video ? "video" : "other"
          let row: [String: Any] = [
            "id": asset.localIdentifier,
            "created": (date?.timeIntervalSince1970 ?? 0) * 1000,
            "type": type,
            "hidden": asset.isHidden,
            "burstFrame": asset.burstIdentifier != nil && !asset.representsBurst,
            "source": source,
            "screenshot": asset.mediaSubtypes.contains(.photoScreenshot),
            "livePhoto": asset.mediaSubtypes.contains(.photoLive),
            "enumerable": enumerable.contains(asset.localIdentifier)
          ]
          inventory.append(row)
          if let date = date {
            let parts = calendar.dateComponents([.month, .day], from: date)
            let key = String(format: "%02d-%02d", parts.month ?? 0, parts.day ?? 0)
            if key == monthDay { onDate.append(row) }
          }
        }
        promise.resolve(["total": assets.count, "undated": undated, "onDate": onDate, "inventory": inventory])
      }
    }
    AsyncFunction("analyze") { (id: String, uri: String, isVideo: Bool, promise: Promise) in
      self.queue.async {
        do {
          guard let asset = PHAsset.fetchAssets(withLocalIdentifiers: [id], options: nil).firstObject else { throw AnalysisError.unavailable }
          let resources = PHAssetResource.assetResources(for: asset)
          guard let primary = resources.first(where: { isVideo ? $0.type == .video : $0.type == .photo }) ?? resources.first else { throw AnalysisError.unavailable }
          var components = [primary]
          if asset.mediaSubtypes.contains(.photoLive) {
            guard let paired = resources.first(where: { $0.type == .pairedVideo }) else { throw AnalysisError.unavailable }
            components.append(paired)
          }
          // Callback state lives in a locked reference box so no captured `var` is mutated
          // inside Photos callbacks; this compiles whether or not the SDK marks them @Sendable.
          let state = AnalysisState()
          for resource in components {
            // Preserve the original digest boundary marker for cached Live Photo hashes.
            if components.count > 1 { state.update(Data("flickwell-resource-\(resource.type.rawValue)".utf8), counted: false) }
            let options = PHAssetResourceRequestOptions()
            options.isNetworkAccessAllowed = false
            let semaphore = DispatchSemaphore(value: 0)
            let request = PHAssetResourceManager.default().requestData(for: resource, options: options, dataReceivedHandler: { data in
              state.update(data, counted: true)
            }, completionHandler: { error in state.fail(error); semaphore.signal() })
            self.lock.lock(); self.currentRequest = request; self.lock.unlock()
            if semaphore.wait(timeout: .now() + 120) == .timedOut { PHAssetResourceManager.default().cancelDataRequest(request); throw AnalysisError.unavailable }
            self.lock.lock(); self.currentRequest = nil; self.lock.unlock()
            if let failure = state.failure { throw failure }
          }
          var result: [String: Any] = ["hash": state.hash(), "size": state.size]
          if !isVideo {
            let imageOptions = PHImageRequestOptions()
            imageOptions.isSynchronous = true
            imageOptions.isNetworkAccessAllowed = false
            imageOptions.deliveryMode = .highQualityFormat
            imageOptions.resizeMode = .exact
            let thumbnail = ImageBox()
            PHImageManager.default().requestImage(for: asset, targetSize: CGSize(width: 64, height: 64), contentMode: .aspectFit, options: imageOptions) { image, _ in thumbnail.set(image) }
            guard let cg = thumbnail.image?.cgImage else { throw AnalysisError.unavailable }
            var rgba = [UInt8](repeating: 0, count: 32 * 32 * 4)
            let rendered = rgba.withUnsafeMutableBytes { buffer -> Bool in
              guard let ctx = CGContext(data: buffer.baseAddress, width: 32, height: 32, bitsPerComponent: 8, bytesPerRow: 128, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return false }
              ctx.interpolationQuality = .high
              ctx.draw(cg, in: CGRect(x: 0, y: 0, width: 32, height: 32))
              return true
            }
            guard rendered else { throw AnalysisError.unavailable }
            let gray: [Double] = PictopiaPixelAnalysis.grayscale(rgba)
            result["perceptual"] = PictopiaPixelAnalysis.differenceHash(gray)
            result["sharpness"] = PictopiaPixelAnalysis.laplacianVariance(gray)
            result["exposure"] = PictopiaPixelAnalysis.meanBrightness(gray)
          }
          promise.resolve(result)
        } catch { promise.reject("ERR_LOCAL_ANALYSIS", "Original media could not be analyzed locally.") }
      }
    }
  }
}
private enum AnalysisError: Error { case unavailable }
private final class AnalysisState: @unchecked Sendable {
  private let review = PictopiaReview()
  private let lock = NSLock()
  private var digest = SHA256()
  private var bytes = 0
  private var error: Error?
  func update(_ data: Data, counted: Bool) {
    lock.lock(); defer { lock.unlock() }
    digest.update(data: data)
    if counted { bytes += data.count }
  }
  func fail(_ error: Error?) { lock.lock(); self.error = error; lock.unlock() }
  var failure: Error? { lock.lock(); defer { lock.unlock() }; return error }
  var size: Int { lock.lock(); defer { lock.unlock() }; return bytes }
  func hash() -> String {
    lock.lock(); defer { lock.unlock() }
    return digest.finalize().map { String(format: "%02x", $0) }.joined()
  }
}
private final class ImageBox: @unchecked Sendable {
  private let review = PictopiaReview()
  private let lock = NSLock()
  private var value: UIImage?
  func set(_ image: UIImage?) { lock.lock(); value = image; lock.unlock() }
  var image: UIImage? { lock.lock(); defer { lock.unlock() }; return value }
}
