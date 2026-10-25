import Foundation

/// Thumbnail quality metrics on a 32×32 RGBA buffer. Every intermediate value is explicitly typed
/// and each expression is small, so the Swift type checker never has to solve long arithmetic
/// chains. Operation order matches `pixelAnalysis` in lib/pictopia/logic.ts, keeping results
/// identical to earlier scans and to the browser implementation.
enum PictopiaPixelAnalysis {
  static let side: Int = 32

  static func grayscale(_ rgba: [UInt8]) -> [Double] {
    let count: Int = side * side
    var gray: [Double] = [Double](repeating: 0, count: count)
    for i in 0..<count {
      let base: Int = i * 4
      let red: Double = 0.299 * Double(rgba[base])
      let green: Double = 0.587 * Double(rgba[base + 1])
      let blue: Double = 0.114 * Double(rgba[base + 2])
      let sum: Double = red + green
      gray[i] = sum + blue
    }
    return gray
  }

  /// 64-bit difference hash: compares horizontally adjacent samples on an 8×8 grid.
  static func differenceHash(_ gray: [Double]) -> String {
    var bits: String = ""
    for y in 0..<8 {
      for x in 0..<8 {
        let row: Int = (y * (side - 1)) / 7
        let column: Int = (x * (side - 2)) / 7
        let index: Int = row * side + column
        let left: Double = gray[index]
        let right: Double = gray[index + 1]
        bits += left > right ? "1" : "0"
      }
    }
    return bits
  }

  /// Variance of the 4-neighbour Laplacian over interior pixels; low values indicate blur.
  static func laplacianVariance(_ gray: [Double]) -> Double {
    var sum: Double = 0
    var squares: Double = 0
    var count: Double = 0
    for y in 1..<(side - 1) {
      for x in 1..<(side - 1) {
        let i: Int = y * side + x
        let value: Double = laplacian(gray, at: i)
        sum += value
        squares += value * value
        count += 1
      }
    }
    if count == 0 { return 0 }
    let mean: Double = sum / count
    let meanOfSquares: Double = squares / count
    return meanOfSquares - mean * mean
  }

  static func laplacian(_ gray: [Double], at i: Int) -> Double {
    let left: Double = gray[i - 1]
    let right: Double = gray[i + 1]
    let up: Double = gray[i - side]
    let down: Double = gray[i + side]
    let center: Double = gray[i]
    var value: Double = left + right
    value += up
    value += down
    let weighted: Double = 4 * center
    return value - weighted
  }

  static func meanBrightness(_ gray: [Double]) -> Double {
    var total: Double = 0
    for value in gray { total += value }
    let count: Double = Double(gray.count)
    return count > 0 ? total / count : 0
  }
}
