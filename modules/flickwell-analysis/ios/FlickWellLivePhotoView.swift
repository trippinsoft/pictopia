import ExpoModulesCore
import Photos
import PhotosUI
import UIKit

final class FlickWellLivePhotoView: ExpoView {
  let onReady = EventDispatcher()
  let onUnavailable = EventDispatcher()
  private let photoView = PHLivePhotoView()
  private var assetID = ""
  private var requestID: PHImageRequestID = PHInvalidImageRequestID

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    photoView.contentMode = .scaleAspectFit
    addSubview(photoView)
    photoView.addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(replay)))
    photoView.isAccessibilityElement = true
    photoView.accessibilityLabel = "Live Photo. Activate to replay motion."
    photoView.accessibilityTraits = .button
  }
  override func layoutSubviews() { super.layoutSubviews(); photoView.frame = bounds }
  @objc private func replay() { photoView.startPlayback(with: .full) }
  func load(id: String) {
    guard id != assetID else { return }
    assetID = id
    if requestID != PHInvalidImageRequestID { PHImageManager.default().cancelImageRequest(requestID) }
    photoView.livePhoto = nil
    guard let asset = PHAsset.fetchAssets(withLocalIdentifiers: [id], options: nil).firstObject, asset.mediaSubtypes.contains(.photoLive) else {
      onUnavailable(["message": "This Live Photo is unavailable. You can still view its photo."])
      return
    }
    let options = PHLivePhotoRequestOptions()
    options.isNetworkAccessAllowed = false
    options.deliveryMode = .highQualityFormat
    requestID = PHImageManager.default().requestLivePhoto(for: asset, targetSize: CGSize(width: 1200, height: 1200), contentMode: .aspectFit, options: options) { [weak self] photo, info in
      DispatchQueue.main.async {
        guard let self = self, self.assetID == id else { return }
        if (info?[PHImageResultIsDegradedKey] as? Bool) == true { return }
        guard let photo = photo else {
          self.onUnavailable(["message": "Motion is not available locally. Download the Live Photo in Photos, or view the still image."])
          return
        }
        self.photoView.livePhoto = photo
        self.onReady([:])
        self.photoView.startPlayback(with: .full)
      }
    }
  }
  deinit {
    if requestID != PHInvalidImageRequestID { PHImageManager.default().cancelImageRequest(requestID) }
  }
}
