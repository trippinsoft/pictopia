import ExpoModulesCore
import UIKit

/// Native pinch, pan and focal double-tap keep the entire mosaic to one image view.
final class PictopiaMosaicView: ExpoView, UIScrollViewDelegate {
  let onTile = EventDispatcher()
  private let scroll = UIScrollView()
  private let preview = UIImageView()
  private var imageUri = ""
  private var lastSize = CGSize.zero

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    scroll.delegate = self
    scroll.minimumZoomScale = 1
    scroll.maximumZoomScale = 24
    scroll.contentInsetAdjustmentBehavior = .never
    scroll.showsHorizontalScrollIndicator = false
    scroll.showsVerticalScrollIndicator = false
    preview.contentMode = .scaleToFill
    addSubview(scroll)
    scroll.addSubview(preview)
    let double = UITapGestureRecognizer(target: self, action: #selector(doubleTap))
    double.numberOfTapsRequired = 2
    let single = UITapGestureRecognizer(target: self, action: #selector(singleTap))
    single.require(toFail: double)
    scroll.addGestureRecognizer(double)
    scroll.addGestureRecognizer(single)
    isAccessibilityElement = true
    accessibilityLabel = "Photo mosaic"
    accessibilityTraits = .image
    accessibilityHint = "Activate to inspect the tile at the center."
  }

  func load(_ uri: String) {
    guard uri != imageUri else { return }
    imageUri = uri
    guard let url = URL(string: uri), url.isFileURL else { preview.image = nil; return }
    preview.image = UIImage(contentsOfFile: url.path)
    setNeedsLayout()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    guard bounds.width > 0, bounds.height > 0, lastSize != bounds.size else { return }
    lastSize = bounds.size
    scroll.frame = bounds
    scroll.zoomScale = 1
    let width = min(bounds.width, bounds.height * 4 / 3)
    let size = CGSize(width: width, height: width * 3 / 4)
    preview.frame = CGRect(origin: .zero, size: size)
    scroll.contentSize = size
    centerImage()
    scroll.contentOffset = CGPoint(x: -scroll.contentInset.left, y: -scroll.contentInset.top)
  }

  func viewForZooming(in scrollView: UIScrollView) -> UIView? { preview }
  func scrollViewDidZoom(_ scrollView: UIScrollView) { centerImage() }

  private func centerImage() {
    let x = max(0, (scroll.bounds.width - scroll.contentSize.width) / 2)
    let y = max(0, (scroll.bounds.height - scroll.contentSize.height) / 2)
    scroll.contentInset = UIEdgeInsets(top: y, left: x, bottom: y, right: x)
  }

  @objc private func doubleTap(_ tap: UITapGestureRecognizer) {
    let point = tap.location(in: preview)
    guard preview.bounds.contains(point) else { return }
    let scale: CGFloat = scroll.zoomScale > 1.01 ? 1 : 10
    let w = scroll.bounds.width / scale, h = scroll.bounds.height / scale
    scroll.zoom(to: CGRect(x: point.x - w / 2, y: point.y - h / 2, width: w, height: h),
                animated: !UIAccessibility.isReduceMotionEnabled)
  }

  @objc private func singleTap(_ tap: UITapGestureRecognizer) { select(tap.location(in: preview)) }

  override func accessibilityActivate() -> Bool {
    select(scroll.convert(CGPoint(x: scroll.bounds.midX, y: scroll.bounds.midY), to: preview))
    return true
  }

  private func select(_ point: CGPoint) {
    guard preview.image != nil, preview.bounds.contains(point) else { return }
    let x = point.x / preview.bounds.width
    let y = point.y / preview.bounds.height
    onTile(["x": Double(x), "y": Double(y)])
  }
}
