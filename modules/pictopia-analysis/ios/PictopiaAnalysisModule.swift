import ExpoModulesCore
import Photos
import UIKit
import CryptoKit

public class PictopiaAnalysisModule: Module {
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
  private let lock = NSLock()
  private var value: UIImage?
  func set(_ image: UIImage?) { lock.lock(); value = image; lock.unlock() }
  var image: UIImage? { lock.lock(); defer { lock.unlock() }; return value }
}
