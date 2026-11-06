import AVFoundation
import ExpoModulesCore
import Photos
import UIKit
import CryptoKit

/** Native review operations share the existing module; never save copies to Photos. */
final class PictopiaReview {
  private let queue = DispatchQueue(label: "pictopia.review.thumbnails", qos: .userInitiated)
  private var shareGeneration = 0 // main queue only
  private var sharing = false

  static func asset(_ id: String) throws -> PHAsset {
    let access = PHPhotoLibrary.authorizationStatus(for: .readWrite)
    guard access == .authorized || access == .limited,
      let asset = PHAsset.fetchAssets(withLocalIdentifiers: [id], options: nil).firstObject else {
      throw NSError(domain: "Pictopia", code: 1, userInfo: [NSLocalizedDescriptionKey: "This photo is unavailable. Check Photos access."])
    }
    return asset
  }
  // Public PhotoKit file URLs, local only. No private fileSize KVC, data streaming or download.
  func localSize(_ id: String, promise: Promise) {
    queue.async {
      do {
        let asset = try Self.asset(id)
        // A still URL alone cannot represent the paired motion resource of a Live Photo.
        guard !asset.mediaSubtypes.contains(.photoLive) else { promise.resolve(nil); return }
        let options = PHContentEditingInputRequestOptions()
        options.isNetworkAccessAllowed = false
        asset.requestContentEditingInput(with: options) { input, _ in
          let url = asset.mediaType == .video ? (input?.audiovisualAsset as? AVURLAsset)?.url : input?.fullSizeImageURL
          guard let url = url, url.isFileURL,
            let values = try? url.resourceValues(forKeys: [.fileSizeKey]),
            let size = values.fileSize, size > 0 else { promise.resolve(nil); return }
          promise.resolve(Double(size))
        }
      } catch { promise.resolve(nil) }
    }
  }
  func favorite(_ id: String, value: Bool, promise: Promise) {
    do {
      let asset = try Self.asset(id)
      PHPhotoLibrary.shared().performChanges({ PHAssetChangeRequest(for: asset).isFavorite = value }) { success, error in
        guard success else { promise.reject("FAVORITE_NOT_SAVED", "Photos did not save the favorite change. It may have been canceled or denied."); return }
        do { promise.resolve(try Self.asset(id).isFavorite) } catch { promise.reject("FAVORITE_UNAVAILABLE", "The saved favorite could not be checked.") }
      }
    } catch { promise.reject("PHOTO_UNAVAILABLE", error.localizedDescription) }
  }
  func thumbnail(_ id: String, version: String, promise: Promise) {
    queue.async {
      do {
        let asset = try Self.asset(id) // permission is checked even for cached files
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("pictopia-thumbnails", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let key = SHA256.hash(data: Data("\(id):\(version)".utf8)).map { String(format: "%02x", $0) }.joined()
        let file = directory.appendingPathComponent(key + ".jpg")
        if !FileManager.default.fileExists(atPath: file.path) {
          let options = PHImageRequestOptions()
          options.isSynchronous = true
          options.isNetworkAccessAllowed = false
          options.deliveryMode = .highQualityFormat
          options.resizeMode = .exact
          var bytes: Data?
          PHImageManager.default().requestImage(for: asset, targetSize: CGSize(width: 160, height: 160), contentMode: .aspectFill, options: options) { image, _ in bytes = image?.jpegData(compressionQuality: 0.78) }
          guard let bytes = bytes else { throw NSError(domain: "Pictopia", code: 2, userInfo: [NSLocalizedDescriptionKey: "Thumbnail is not available locally."]) }
          try bytes.write(to: file, options: .atomic)
          let cached = (try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: [.contentModificationDateKey])) ?? []
          let oldest = cached.sorted { ((try? $0.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast) < ((try? $1.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast) }
          for old in oldest.prefix(max(0, cached.count - 128)) where old != file { try? FileManager.default.removeItem(at: old) }
        }
        promise.resolve(file.absoluteString)
      } catch { promise.reject("THUMBNAIL_UNAVAILABLE", error.localizedDescription) }
    }
  }
  func cancelShare() { shareGeneration += 1 }
  func share(_ id: String, presenter: UIViewController?, promise: Promise) {
    guard !sharing else { promise.reject("SHARE_BUSY", "A share is already open."); return }
    guard let presenter = presenter else { promise.reject("SHARE_UNAVAILABLE", "Sharing is not available right now."); return }
    do {
      let asset = try Self.asset(id)
      let resources = PHAssetResource.assetResources(for: asset)
      let preferred: PHAssetResourceType = asset.mediaType == .video ? .fullSizeVideo : .fullSizePhoto
      let original: PHAssetResourceType = asset.mediaType == .video ? .video : .photo
      guard let resource = resources.first(where: { $0.type == preferred }) ?? resources.first(where: { $0.type == original }) else { promise.reject("SHARE_UNAVAILABLE", "The original is unavailable."); return }
      let base = FileManager.default.temporaryDirectory.appendingPathComponent("pictopia-share", isDirectory: true)
      try FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
      // Remove exports left by a terminated process, never an active share.
      for old in (try? FileManager.default.contentsOfDirectory(at: base, includingPropertiesForKeys: nil)) ?? [] { try? FileManager.default.removeItem(at: old) }
      let folder = base.appendingPathComponent(UUID().uuidString, isDirectory: true)
      try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
      let file = folder.appendingPathComponent((resource.originalFilename as NSString).lastPathComponent)
      let token = shareGeneration
      sharing = true
      let options = PHAssetResourceRequestOptions(); options.isNetworkAccessAllowed = true
      PHAssetResourceManager.default().writeData(for: resource, toFile: file, options: options) { error in
        DispatchQueue.main.async {
          guard error == nil, token == self.shareGeneration, presenter.viewIfLoaded?.window != nil else {
            try? FileManager.default.removeItem(at: folder); self.sharing = false
            if error != nil { promise.reject("SHARE_UNAVAILABLE", "The original could not be downloaded for sharing.") } else { promise.resolve("cancelled") }
            return
          }
          let sheet = UIActivityViewController(activityItems: [file], applicationActivities: nil)
          sheet.popoverPresentationController?.sourceView = presenter.view
          sheet.popoverPresentationController?.sourceRect = CGRect(x: presenter.view.bounds.midX, y: presenter.view.bounds.maxY - 1, width: 1, height: 1)
          sheet.completionWithItemsHandler = { _, completed, _, error in
            try? FileManager.default.removeItem(at: folder); self.sharing = false
            if error != nil { promise.reject("SHARE_FAILED", "Sharing could not finish.") } else { promise.resolve(completed ? "shared" : "cancelled") }
          }
          presenter.present(sheet, animated: true)
        }
      }
    } catch { sharing = false; promise.reject("SHARE_UNAVAILABLE", error.localizedDescription) }
  }
}
