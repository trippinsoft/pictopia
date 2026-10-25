import ExpoModulesCore
import Photos
import UIKit
import CryptoKit

public class FlickWellAnalysisModule: Module {
  private let lock = NSLock()
  private var currentRequest: PHAssetResourceDataRequestID?
  private let queue = DispatchQueue(label: "flickwell.analysis", qos: .utility)
  public func definition() -> ModuleDefinition {
    Name("FlickWellAnalysis")
    View(FlickWellLivePhotoView.self) {
      Events("onReady", "onUnavailable")
      Prop("assetId") { (view: FlickWellLivePhotoView, id: String) in view.load(id: id) }
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
          var digest = SHA256()
          var size = 0
          for resource in components {
            if components.count > 1 { digest.update(data: Data("flickwell-resource-\(resource.type.rawValue)".utf8)) }
            let options = PHAssetResourceRequestOptions()
            options.isNetworkAccessAllowed = false
            let semaphore = DispatchSemaphore(value: 0)
            let dataLock = NSLock()
            var failure: Error?
            let request = PHAssetResourceManager.default().requestData(for: resource, options: options, dataReceivedHandler: { data in
              dataLock.lock(); digest.update(data: data); size += data.count; dataLock.unlock()
            }, completionHandler: { error in failure = error; semaphore.signal() })
            self.lock.lock(); self.currentRequest = request; self.lock.unlock()
            if semaphore.wait(timeout: .now() + 120) == .timedOut { PHAssetResourceManager.default().cancelDataRequest(request); throw AnalysisError.unavailable }
            self.lock.lock(); self.currentRequest = nil; self.lock.unlock()
            if let failure = failure { throw failure }
          }
          var result: [String: Any] = ["hash": digest.finalize().map { String(format: "%02x", $0) }.joined(), "size": size]
          if !isVideo {
            let imageOptions = PHImageRequestOptions()
            imageOptions.isSynchronous = true
            imageOptions.isNetworkAccessAllowed = false
            imageOptions.deliveryMode = .highQualityFormat
            imageOptions.resizeMode = .exact
            var thumbnail: UIImage?
            PHImageManager.default().requestImage(for: asset, targetSize: CGSize(width: 64, height: 64), contentMode: .aspectFit, options: imageOptions) { image, _ in thumbnail = image }
            guard let cg = thumbnail?.cgImage else { throw AnalysisError.unavailable }
            var rgba = [UInt8](repeating: 0, count: 32 * 32 * 4)
            let rendered = rgba.withUnsafeMutableBytes { buffer -> Bool in
              guard let ctx = CGContext(data: buffer.baseAddress, width: 32, height: 32, bitsPerComponent: 8, bytesPerRow: 128, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return false }
              ctx.interpolationQuality = .high
              ctx.draw(cg, in: CGRect(x: 0, y: 0, width: 32, height: 32))
              return true
            }
            guard rendered else { throw AnalysisError.unavailable }
            let gray = (0..<1024).map { i in 0.299 * Double(rgba[i*4]) + 0.587 * Double(rgba[i*4+1]) + 0.114 * Double(rgba[i*4+2]) }
            var perceptual = ""
            for y in 0..<8 { for x in 0..<8 { let yy = y*31/7, xx = x*30/7; perceptual += gray[yy*32+xx] > gray[yy*32+xx+1] ? "1" : "0" } }
            var sum = 0.0, squares = 0.0, count = 0.0
            for y in 1..<31 { for x in 1..<31 { let i = y*32+x; let value = gray[i-1]+gray[i+1]+gray[i-32]+gray[i+32]-4*gray[i]; sum += value; squares += value*value; count += 1 } }
            result["perceptual"] = perceptual
            result["sharpness"] = squares/count - pow(sum/count, 2)
            result["exposure"] = gray.reduce(0, +)/1024
          }
          promise.resolve(result)
        } catch { promise.reject("ERR_LOCAL_ANALYSIS", "Original media could not be analyzed locally.") }
      }
    }
  }
}
private enum AnalysisError: Error { case unavailable }
