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
  // Every resource the asset owns (original, edits, a Live Photo's motion), including ones
  // stored only in iCloud. PhotoKit reports each resource's `fileSize` from its metadata, so
  // nothing is downloaded. It is undocumented: when it is missing, callers estimate instead.
  func localSize(_ id: String, promise: Promise) {
    queue.async {
      do {
        let asset = try Self.asset(id)
        var total: Int64 = 0
        for resource in PHAssetResource.assetResources(for: asset) {
          if let size = (resource.value(forKey: "fileSize") as? NSNumber)?.int64Value, size > 0 { total += size }
        }
        promise.resolve(total > 0 ? Double(total) : nil)
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
  // Main-queue ownership: cancellation rejects once and late PhotoKit callbacks are inert.
  private struct DisplayRequest { var id: PHImageRequestID; let promise: Promise }
  private var displays: [String: DisplayRequest] = [:]
  func cancelDisplay(_ token: String) {
    if let video = videos.removeValue(forKey: token) {
      if video.id != PHInvalidImageRequestID { PHImageManager.default().cancelImageRequest(video.id) }
      video.export?.cancelExport()
      video.promise.reject("VIDEO_CANCELLED", "Video loading cancelled.")
      return
    }
    guard let request = displays.removeValue(forKey: token) else { return }
    PHImageManager.default().cancelImageRequest(request.id)
    request.promise.reject("DISPLAY_CANCELLED", "Photo loading cancelled.")
  }
  func display(_ id: String, version: String, token: String, network: Bool, promise: Promise) {
    do {
      let asset = try Self.asset(id)
      let directory = FileManager.default.temporaryDirectory.appendingPathComponent("pictopia-display", isDirectory: true)
      try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
      let hash = SHA256.hash(data: Data("\(id):\(version)".utf8)).map { String(format: "%02x", $0) }.joined()
      let file = directory.appendingPathComponent("\(hash).jpg")
      if FileManager.default.fileExists(atPath: file.path) { promise.resolve(file.absoluteString); return }
      let options = PHImageRequestOptions()
      options.isSynchronous = false
      options.isNetworkAccessAllowed = network
      options.deliveryMode = .highQualityFormat
      options.resizeMode = .exact
      // Aspect fit within 2048 pixels; Photos chooses the representation without exporting
      // an original. This is a temporary display cache, never bytes recovered by deletion.
      displays[token] = DisplayRequest(id: PHInvalidImageRequestID, promise: promise)
      let request = PHImageManager.default().requestImage(for: asset, targetSize: CGSize(width: 2048, height: 2048), contentMode: .aspectFit, options: options) { image, info in
        DispatchQueue.main.async {
          guard self.displays[token] != nil else { return }
          if (info?[PHImageResultIsDegradedKey] as? Bool) == true { return }
          if (info?[PHImageCancelledKey] as? Bool) == true {
            self.displays.removeValue(forKey: token)
            promise.reject("DISPLAY_CANCELLED", "Photo loading cancelled."); return
          }
          guard info?[PHImageErrorKey] == nil, let image = image else {
            self.displays.removeValue(forKey: token)
            promise.reject("DISPLAY_UNAVAILABLE", network ? "Photo couldn’t load. Check your connection and photo access, then try again." : "Photo is not available locally.")
            return
          }
          // JPEG preparation and cache maintenance never occupy the gesture/UI thread.
          self.queue.async {
            do {
              guard let data = image.jpegData(compressionQuality: 0.9) else { throw NSError(domain: "Pictopia", code: 3) }
              try data.write(to: file, options: .atomic)
              let cached = (try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: [.contentModificationDateKey])) ?? []
              let sorted = cached.sorted { ((try? $0.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast) < ((try? $1.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast) }
              for old in sorted.prefix(max(0, sorted.count - 64)) where old != file { try? FileManager.default.removeItem(at: old) }
              DispatchQueue.main.async {
                guard self.displays.removeValue(forKey: token) != nil else { return }
                promise.resolve(file.absoluteString)
              }
            } catch {
              DispatchQueue.main.async {
                guard self.displays.removeValue(forKey: token) != nil else { return }
                promise.reject("DISPLAY_UNAVAILABLE", "Photo display could not be prepared. Try again.")
              }
            }
          }
        }
      }
      displays[token]?.id = request
    } catch { promise.reject("DISPLAY_UNAVAILABLE", error.localizedDescription) }
  }
  // Earlier JS asked only for iCloud playback through this entry point.
  func videoSource(_ id: String, token: String, promise: Promise) { videoPlayback(id, token: token, network: true, promise: promise) }
  // Main-queue ownership, like displays. Local playback never touches the network; only an
  // explicit tap (`network`) streams or downloads from iCloud. Slow-motion and other composed
  // videos (AVComposition) have no single file, so they get one bounded 720p display export.
  private struct VideoRequest { var id: PHImageRequestID; var export: AVAssetExportSession?; let promise: Promise }
  private var videos: [String: VideoRequest] = [:]
  private static let cloudOnly = "This item is in iCloud. Download it to review it." // services/media-errors.ts CLOUD_ONLY
  private func finishVideo(_ token: String, _ settle: (Promise) -> Void) {
    guard let request = videos.removeValue(forKey: token) else { return }
    settle(request.promise)
  }
  func videoPlayback(_ id: String, token: String, network: Bool, promise: Promise) {
    do {
      let asset = try Self.asset(id)
      guard asset.mediaType == .video else { promise.reject("VIDEO_UNAVAILABLE", "This item is not a video."); return }
      let options = PHVideoRequestOptions()
      options.isNetworkAccessAllowed = network
      options.deliveryMode = network ? .mediumQualityFormat : .automatic
      options.version = .current
      videos[token] = VideoRequest(id: PHInvalidImageRequestID, export: nil, promise: promise)
      let request = PHImageManager.default().requestAVAsset(forVideo: asset, options: options) { value, _, info in
        DispatchQueue.main.async {
          guard self.videos[token] != nil else { return }
          if (info?[PHImageCancelledKey] as? Bool) == true {
            self.finishVideo(token) { $0.reject("VIDEO_CANCELLED", "Video loading cancelled.") }; return
          }
          if let source = value as? AVURLAsset { self.finishVideo(token) { $0.resolve(source.url.absoluteString) }; return }
          if let composed = value { self.exportVideo(composed, asset: asset, token: token); return }
          let inCloud = (info?[PHImageResultIsInCloudKey] as? Bool) == true
          let detail = (info?[PHImageErrorKey] as? NSError).map { "\($0.domain) \($0.code)" } ?? "no asset"
          self.finishVideo(token) { pending in
            if !network && inCloud { pending.reject("VIDEO_CLOUD", Self.cloudOnly) }
            else if network { pending.reject("VIDEO_DOWNLOAD_FAILED", "Video couldn’t download from iCloud. Check your connection, then try again. (\(detail))") }
            else { pending.reject("VIDEO_UNREADABLE", "Video couldn’t be read from your library. (\(detail))") }
          }
        }
      }
      videos[token]?.id = request
    } catch { promise.reject("VIDEO_UNAVAILABLE", error.localizedDescription) }
  }
  private func exportVideo(_ source: AVAsset, asset: PHAsset, token: String) {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent("pictopia-video", isDirectory: true)
    let version = "\(asset.localIdentifier):\(asset.modificationDate?.timeIntervalSince1970 ?? 0)"
    let key = SHA256.hash(data: Data(version.utf8)).map { String(format: "%02x", $0) }.joined()
    let file = directory.appendingPathComponent(key + ".mov")
    if FileManager.default.fileExists(atPath: file.path) {
      try? FileManager.default.setAttributes([.modificationDate: Date()], ofItemAtPath: file.path)
      finishVideo(token) { $0.resolve(file.absoluteString) }; return
    }
    let partial = directory.appendingPathComponent("\(key)-\(UUID().uuidString).partial.mov")
    guard (try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)) != nil,
      let export = AVAssetExportSession(asset: source, presetName: AVAssetExportPreset1280x720)
        ?? AVAssetExportSession(asset: source, presetName: AVAssetExportPresetMediumQuality) else {
      finishVideo(token) { $0.reject("VIDEO_UNSUPPORTED", "This video couldn’t be prepared for playback.") }; return
    }
    export.outputURL = partial
    export.outputFileType = .mov
    videos[token]?.export = export
    export.exportAsynchronously {
      DispatchQueue.main.async {
        guard export.status == .completed else {
          try? FileManager.default.removeItem(at: partial)
          let detail = (export.error as NSError?).map { "\($0.domain) \($0.code)" } ?? "status \(export.status.rawValue)"
          self.finishVideo(token) { $0.reject("VIDEO_UNSUPPORTED", "This video couldn’t be prepared for playback. (\(detail))") }
          return
        }
        do {
          try? FileManager.default.removeItem(at: file)
          try FileManager.default.moveItem(at: partial, to: file)
          // Keep a few recent display copies; never the in-flight exports of other requests.
          let active = Set(self.videos.values.compactMap { $0.export?.outputURL?.lastPathComponent })
          let cached = (try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: [.contentModificationDateKey])) ?? []
          let stale = cached.filter { $0 != file && !active.contains($0.lastPathComponent) }
            .sorted { ((try? $0.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast) < ((try? $1.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast) }
          for old in stale.prefix(max(0, stale.count - 3)) { try? FileManager.default.removeItem(at: old) }
          self.finishVideo(token) { $0.resolve(file.absoluteString) }
        } catch {
          try? FileManager.default.removeItem(at: partial)
          self.finishVideo(token) { $0.reject("VIDEO_UNSUPPORTED", "This video couldn’t be prepared for playback.") }
        }
      }
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
