import CryptoKit
import Darwin
import ExpoModulesCore
import Photos
import UIKit

/// Local, read-only and isolated from progress and review storage. All session and file ownership
/// lives on one utility queue. JS submits one small analysis batch at a time.
final class PictopiaMosaic {
  private static let edge = 48
  private static let rgbx = CGBitmapInfo.byteOrder32Big.rawValue | CGImageAlphaInfo.noneSkipLast.rawValue
  private let queue = DispatchQueue(label: "pictopia.mosaic", qos: .utility)
  private let manager = PHImageManager.default()
  private let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!
  private let tiles = NSCache<NSString, NSData>()
  private let cancellationLock = NSLock()
  private var canceled: [String] = []
  private let files = FileManager.default.temporaryDirectory.appendingPathComponent("pictopia-mosaic", isDirectory: true)
  private let cache = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
    .appendingPathComponent("pictopia-mosaic-colors-v1.json")

  private struct Profile: Codable {
    let changed: Double
    let rgb: [Int]
  }
  private struct Run {
    let token: String
    let assets: PHFetchResult<PHAsset>
    let scope: PHAuthorizationStatus
    let selected: Int
    let bits: Int
    var count = 0
    var sequence = 0
    var peakBytes: Double = 0
  }
  private var run: Run?
  private var profiles: [String: Profile]?
  private var dirty = false

  init() {
    tiles.totalCostLimit = 12 * 1024 * 1024
    tiles.countLimit = 1_200
  }

  func start(_ token: String, limit: Int, promise: Promise) {
    queue.async {
      guard !self.isCanceled(token) else { self.rejectAccess(promise); return }
      self.reset()
      let access = PHPhotoLibrary.authorizationStatus(for: .readWrite)
      guard access == .authorized || access == .limited else {
        promise.reject("MOSAIC_ACCESS", "Allow photo access in Settings to build a mosaic.")
        return
      }
      do {
        try FileManager.default.createDirectory(at: self.files, withIntermediateDirectories: true,
                                                attributes: [.protectionKey: FileProtectionType.complete])
        var directory = self.files
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try directory.setResourceValues(values)
      } catch {
        promise.reject("MOSAIC_STORAGE", "The temporary mosaic folder couldn’t be created.")
        return
      }
      let options = PHFetchOptions()
      options.includeAllBurstAssets = true
      options.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: true)]
      let assets = PHAsset.fetchAssets(with: .image, options: options)
      let count = limit == 0 ? assets.count : min(max(limit, 0), assets.count)
      let bits = Int.bitWidth - max(0, assets.count - 1).leadingZeroBitCount
      let memory = Self.residentBytes()
      self.run = Run(token: token, assets: assets, scope: access, selected: count, bits: bits, peakBytes: memory)
      if self.profiles == nil {
        self.profiles = (try? JSONDecoder().decode([String: Profile].self, from: Data(contentsOf: self.cache)))
          .map { $0.filter { $0.value.rgb.count == 3 && $0.value.rgb.allSatisfy { (0...255).contains($0) } } } ?? [:]
      }
      promise.resolve(["available": assets.count, "selected": count, "limited": access == .limited,
                       "startBytes": memory, "peakBytes": self.sampleMemory()])
    }
  }

  func scan(_ token: String, promise: Promise) {
    queue.async {
      guard var run = self.run, self.isCurrent(token) else { self.rejectAccess(promise); return }
      var found: [[String: Any]] = []
      var hits = 0
      let stop = min(run.count + 40, run.selected)
      while run.count < stop {
        guard self.isCurrent(token) else { self.rejectAccess(promise); return }
        // Bit reversal gives nested subsets spaced across the full library, without decade buckets.
        var index = 0
        for bit in 0..<run.bits { index = (index << 1) | ((run.sequence >> bit) & 1) }
        run.sequence += 1
        if index >= run.assets.count { continue }
        run.count += 1
        autoreleasepool {
          let asset = run.assets.object(at: index)
          let id = asset.localIdentifier
          let key = SHA256.hash(data: Data(id.utf8)).withUnsafeBytes { Data($0).base64EncodedString() }
          let changed = asset.modificationDate?.timeIntervalSinceReferenceDate
          if let changed = changed, let saved = self.profiles?[key], saved.changed == changed {
            hits += 1
            found.append(["id": id, "rgb": saved.rgb])
          } else if let image = self.thumbnail(asset, edge: Self.edge, crop: true),
                    let pixels = self.squarePixels(image) {
            let rgb = Self.average(pixels)
            if let changed = changed {
              self.profiles?[key] = Profile(changed: changed, rgb: rgb)
              self.dirty = true
            }
            found.append(["id": id, "rgb": rgb])
          }
        }
      }
      self.run = run
      guard self.isCurrent(token) else { self.rejectAccess(promise); return }
      if run.count == run.selected || (run.count > 0 && run.count % 2_000 == 0) { self.saveProfiles() }
      promise.resolve(["photos": found, "hits": hits, "processed": run.count, "peakBytes": self.sampleMemory()])
    }
  }

  func render(_ token: String, scene: Int, ids: [String], targets: [Int], columns: Int, promise: Promise) {
    queue.async {
      guard self.isCurrent(token) else { self.rejectAccess(promise); return }
      guard (0..<4).contains(scene), columns == 32, ids.count == 768,
            targets.count == ids.count * 3, targets.allSatisfy({ (0...255).contains($0) }) else {
        promise.reject("MOSAIC_LAYOUT", "The mosaic layout couldn’t be read.")
        return
      }
      let started = ProcessInfo.processInfo.systemUptime
      let edge = Self.edge
      let width = columns * edge
      let height = (ids.count / columns) * edge
      let size = CGSize(width: width, height: height)
      let options = PHFetchOptions()
      options.includeAllBurstAssets = true
      let assets = PHAsset.fetchAssets(withLocalIdentifiers: Array(Set(ids)), options: options)
      var byID: [String: PHAsset] = [:]
      assets.enumerateObjects { asset, _, _ in byID[asset.localIdentifier] = asset }

      // Two contiguous RGBX canvases. Individual images are cropped once into sRGB, and
      // painted into both treatments in the same pass. No target-art pixels are composited.
      var natural = [UInt8](repeating: 0, count: width * height * 4)
      var adjusted = natural
      var missing = 0
      var failed = Set<String>()
      let background = [UInt8](repeating: 122, count: edge * edge * 4)
      for (index, id) in ids.enumerated() {
        if index % 24 == 0 && !self.isCurrent(token) { self.rejectAccess(promise); return }
        autoreleasepool {
          let key = id as NSString
          var bytes = self.tiles.object(forKey: key).map { $0 as Data }
          if bytes == nil, !failed.contains(id), let asset = byID[id],
             let image = self.thumbnail(asset, edge: edge, crop: true),
             let pixels = self.squarePixels(image) {
            let data = Data(pixels)
            bytes = data
            self.tiles.setObject(data as NSData, forKey: key, cost: pixels.count)
          }
          let x = index % columns * edge
          let y = index / columns * edge
          guard let bytes = bytes else {
            missing += 1
            failed.insert(id)
            for row in 0..<edge {
              let dest = ((y + row) * width + x) * 4
              let source = row * edge * 4
              let range = dest..<(dest + edge * 4)
              natural.replaceSubrange(range, with: background[source..<(source + edge * 4)])
              adjusted.replaceSubrange(range, with: background[source..<(source + edge * 4)])
            }
            return
          }
          let pixels = [UInt8](bytes)
          let mean = Self.average(pixels)
          let shifts = (0..<3).map { c in max(-22, min(22, Int(Double(targets[index * 3 + c] - mean[c]) * 0.36))) }
          let maps = shifts.map { delta in
            (0..<256).map { pixel -> UInt8 in
              let headroom = delta > 0 ? 255 - pixel : pixel
              return UInt8(clamping: pixel + delta * headroom / 160)
            }
          }
          for row in 0..<edge {
            let dest = ((y + row) * width + x) * 4
            let source = row * edge * 4
            let range = dest..<(dest + edge * 4)
            natural.replaceSubrange(range, with: pixels[source..<(source + edge * 4)])
            for col in stride(from: 0, to: edge * 4, by: 4) {
              adjusted[dest + col] = maps[0][Int(pixels[source + col])]
              adjusted[dest + col + 1] = maps[1][Int(pixels[source + col + 1])]
              adjusted[dest + col + 2] = maps[2][Int(pixels[source + col + 2])]
            }
          }
        }
      }
      do {
        let a = try self.write(natural, size: size, name: "\(scene)-natural")
        let b = try self.write(adjusted, size: size, name: "\(scene)-adjusted")
        guard self.isCurrent(token) else { self.rejectAccess(promise); return }
        let peak = self.sampleMemory()
        promise.resolve(["natural": a.absoluteString, "adjusted": b.absoluteString, "missing": missing,
                         "renderMs": (ProcessInfo.processInfo.systemUptime - started) * 1_000,
                         "peakBytes": peak])
      } catch {
        promise.reject("MOSAIC_RENDER", "The mosaic couldn’t be rendered. Try again.")
      }
    }
  }

  func inspect(_ token: String, id: String, promise: Promise) {
    queue.async {
      guard self.isCurrent(token) else { self.rejectAccess(promise); return }
      do {
        let asset = try PictopiaReview.asset(id)
        guard asset.mediaType == .image, let image = self.thumbnail(asset, edge: 1_024, crop: false),
              let data = image.jpegData(compressionQuality: 0.9), self.isCurrent(token) else {
          promise.reject("MOSAIC_TILE", "This photo isn’t available at a larger size on this device.")
          return
        }
        if let old = try? FileManager.default.contentsOfDirectory(at: self.files, includingPropertiesForKeys: nil) {
          for url in old where url.lastPathComponent.hasPrefix("tile-") { try? FileManager.default.removeItem(at: url) }
        }
        let url = self.files.appendingPathComponent("tile-\(UUID().uuidString).jpg")
        try data.write(to: url, options: [.atomic, .completeFileProtection])
        promise.resolve(url.absoluteString)
      } catch {
        promise.reject("MOSAIC_TILE", "This photo isn’t available at a larger size on this device.")
      }
    }
  }

  func clear(_ token: String) {
    cancellationLock.lock()
    canceled.append(token)
    if canceled.count > 32 { canceled.removeFirst() }
    cancellationLock.unlock()
    queue.async {
      if self.run?.token == token { self.reset() }
    }
  }

  private func reset() {
    run = nil
    tiles.removeAllObjects()
    try? FileManager.default.removeItem(at: files)
    saveProfiles()
  }

  private func saveProfiles() {
    guard dirty, var profiles = profiles else { return }
    if profiles.count > 60_000 {
      let keep = profiles.sorted { $0.value.changed > $1.value.changed }.prefix(60_000)
      profiles = Dictionary(uniqueKeysWithValues: keep.map { ($0.key, $0.value) })
      self.profiles = profiles
    }
    if let data = try? JSONEncoder().encode(profiles),
       (try? data.write(to: cache, options: [.atomic, .completeFileProtection])) != nil { dirty = false }
  }

  private func isCurrent(_ token: String) -> Bool {
    guard let run = run, run.token == token, !isCanceled(token) else { return false }
    return PHPhotoLibrary.authorizationStatus(for: .readWrite) == run.scope
  }

  private func isCanceled(_ token: String) -> Bool {
    cancellationLock.lock()
    defer { cancellationLock.unlock() }
    return canceled.contains(token)
  }

  private func rejectAccess(_ promise: Promise) {
    promise.reject("MOSAIC_ACCESS", "Photo access changed. Build the mosaic again.")
  }

  private func thumbnail(_ asset: PHAsset, edge: Int, crop: Bool) -> UIImage? {
    let options = PHImageRequestOptions()
    options.isSynchronous = true
    options.isNetworkAccessAllowed = false
    options.version = .current
    options.deliveryMode = crop ? .fastFormat : .highQualityFormat
    options.resizeMode = crop ? .fast : .exact
    var result: UIImage?
    manager.requestImage(for: asset, targetSize: CGSize(width: edge, height: edge),
                         contentMode: crop ? .aspectFill : .aspectFit, options: options) { image, _ in
      if let image = image { result = image }
    }
    return result
  }

  private func squarePixels(_ image: UIImage) -> [UInt8]? {
    let edge = Self.edge
    let size = CGFloat(edge)
    guard image.size.width > 0, image.size.height > 0 else { return nil }
    let scale = max(size / image.size.width, size / image.size.height)
    let w = image.size.width * scale, h = image.size.height * scale
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    format.opaque = true
    format.preferredRange = .standard
    let renderer = UIGraphicsImageRenderer(size: CGSize(width: edge, height: edge), format: format)
    let square = renderer.image { _ in image.draw(in: CGRect(x: (size - w) / 2, y: (size - h) / 2, width: w, height: h)) }
    guard let cg = square.cgImage else { return nil }
    var pixels = [UInt8](repeating: 0, count: edge * edge * 4)
    let ok = pixels.withUnsafeMutableBytes { buffer -> Bool in
      guard let context = CGContext(data: buffer.baseAddress, width: edge, height: edge, bitsPerComponent: 8,
                                    bytesPerRow: edge * 4, space: colorSpace,
                                    bitmapInfo: Self.rgbx) else { return false }
      context.draw(cg, in: CGRect(x: 0, y: 0, width: edge, height: edge))
      return true
    }
    return ok ? pixels : nil
  }

  private static func average(_ pixels: [UInt8]) -> [Int] {
    var r = 0, g = 0, b = 0, samples = 0
    for y in stride(from: 2, to: edge, by: 4) {
      for x in stride(from: 2, to: edge, by: 4) {
        let i = (y * edge + x) * 4
        r += Int(pixels[i]); g += Int(pixels[i + 1]); b += Int(pixels[i + 2])
        samples += 1
      }
    }
    return [r / samples, g / samples, b / samples]
  }

  private func write(_ pixels: [UInt8], size: CGSize, name: String) throws -> URL {
    let width = Int(size.width), height = Int(size.height)
    guard let provider = CGDataProvider(data: Data(pixels) as CFData),
          let cg = CGImage(width: width, height: height, bitsPerComponent: 8, bitsPerPixel: 32,
                           bytesPerRow: width * 4, space: colorSpace,
                           bitmapInfo: CGBitmapInfo(rawValue: Self.rgbx),
                           provider: provider, decode: nil, shouldInterpolate: true, intent: .defaultIntent),
          let data = UIImage(cgImage: cg).jpegData(compressionQuality: 0.92) else {
      throw CocoaError(.fileWriteUnknown)
    }
    _ = sampleMemory()
    let url = files.appendingPathComponent(name + ".jpg")
    try data.write(to: url, options: [.atomic, .completeFileProtection])
    return url
  }

  private static func residentBytes() -> Double {
    var info = mach_task_basic_info()
    let words = MemoryLayout<mach_task_basic_info>.size / MemoryLayout<integer_t>.size
    var count = mach_msg_type_number_t(words)
    let result = withUnsafeMutablePointer(to: &info) { pointer in
      pointer.withMemoryRebound(to: integer_t.self, capacity: words) {
        task_info(mach_task_self_, task_flavor_t(MACH_TASK_BASIC_INFO), $0, &count)
      }
    }
    return result == KERN_SUCCESS ? Double(info.resident_size) : 0
  }

  private func sampleMemory() -> Double {
    let peak = max(run?.peakBytes ?? 0, Self.residentBytes())
    run?.peakBytes = peak
    return peak
  }
}
