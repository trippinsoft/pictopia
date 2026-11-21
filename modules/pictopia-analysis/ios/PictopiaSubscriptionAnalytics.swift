import StoreKit
import CryptoKit
import Foundation

// Read-only analytics evidence. Never finishes transactions or grants an entitlement.
enum PictopiaSubscriptionAnalytics {
  static func metadata(_ transaction: Transaction, state: String? = nil) -> [String: Any] {
    let payload = (try? JSONSerialization.jsonObject(with: transaction.jsonRepresentation)) as? [String: Any] ?? [:]
    var kind = "unknown"
    if #available(iOS 17.2, *) {
      if let offer = transaction.offer {
        if offer.type == .introductory && offer.paymentMode == .freeTrial { kind = "trial" }
        else if let mode = offer.paymentMode, mode != .freeTrial { kind = "paid" }
      } else { kind = "paid" }
    } else if transaction.offerType == nil { kind = "paid" }
    // Older OS versions cannot always prove free-trial payment mode: keep unknown.
    let signedEnvironment = payload["environment"] as? String ?? ""
    var environment = signedEnvironment == "Production" ? "production" : signedEnvironment == "Sandbox" ? "sandbox" : signedEnvironment == "Xcode" ? "xcode" : "unknown"
    if #available(iOS 16.0, *) {
      switch transaction.environment {
      case .production: environment = "production"
      case .sandbox: environment = "sandbox"
      case .xcode: environment = "xcode"
      default: break
      }
    }
    var distribution = "unknown"
    #if DEBUG
    distribution = "development"
    #else
    if environment == "production" { distribution = "app_store" }
    else if environment == "sandbox",
      Bundle.main.appStoreReceiptURL?.lastPathComponent == "sandboxReceipt",
      Bundle.main.path(forResource: "embedded", ofType: "mobileprovision") == nil {
      distribution = "testflight_inferred"
    }
    #endif
    let reason = payload["transactionReason"] as? String ?? ""
    let activeState = kind == "trial" ? "trial" : kind == "paid" ? "active_paid" : "active_unknown"
    let inferredState = transaction.revocationDate != nil ? "revoked" :
      (transaction.expirationDate.map { $0 <= Date() } ?? true) ? "expired" : activeState
    // A fingerprint is kept in local analytics storage; never forwarded to Amplitude.
    let fingerprint = SHA256.hash(data: Data("\(environment):\(transaction.id)".utf8)).map { String(format: "%02x", $0) }.joined()
    var result: [String: Any] = [
      "verified": true, "fingerprint": fingerprint, "productId": transaction.productID,
      "state": state == "subscribed" ? inferredState : state ?? inferredState,
      "purchaseType": kind, "purchasedAt": transaction.purchaseDate.timeIntervalSince1970 * 1000,
      "reason": reason == "PURCHASE" ? "purchase" : reason == "RENEWAL" ? "renewal" : "unknown",
      "ownership": transaction.ownershipType == .purchased ? "purchased" : "family_shared",
      "storeEnvironment": environment, "distribution": distribution
    ]
    if let expiry = transaction.expirationDate {
      result["expiresAt"] = expiry.timeIntervalSince1970 * 1000
      // Actual verified period, including accelerated sandbox periods; never catalog inference.
      if kind == "trial" { result["trialDurationDays"] = expiry.timeIntervalSince(transaction.purchaseDate) / 86400 }
    }
    return result
  }

  static func transaction(_ id: String, ids: [String]) async -> [String: Any]? {
    for await result in Transaction.all {
      if case .verified(let transaction) = result,
        String(transaction.id) == id, ids.contains(transaction.productID), !transaction.isUpgraded {
        return metadata(transaction)
      }
    }
    return nil
  }

  static func history(_ ids: [String]) async throws -> [String] {
    var fingerprints: [String] = []
    for await result in Transaction.all {
      if case .unverified(let transaction, _) = result, ids.contains(transaction.productID) {
        throw NSError(domain: "PictopiaAnalytics", code: 4)
      }
      if case .verified(let transaction) = result, ids.contains(transaction.productID),
        let fingerprint = metadata(transaction)["fingerprint"] as? String {
        fingerprints.append(fingerprint)
      }
    }
    return fingerprints
  }

  static func snapshot(_ ids: [String]) async throws -> [String: Any] {
    let products = try await Product.products(for: ids)
    // Missing products is an unavailable store, not a verified loss of access.
    guard !products.isEmpty else { throw NSError(domain: "PictopiaAnalytics", code: 1) }
    var groups = Set<String>()
    var candidates: [[String: Any]] = []
    for product in products {
      guard let subscription = product.subscription, groups.insert(subscription.subscriptionGroupID).inserted else { continue }
      for status in try await subscription.status {
        guard case .verified(let transaction) = status.transaction,
          case .verified = status.renewalInfo else { throw NSError(domain: "PictopiaAnalytics", code: 2) }
        guard ids.contains(transaction.productID), !transaction.isUpgraded else { continue }
        let state: String
        switch status.state {
        case .subscribed: state = "subscribed"
        case .expired: state = "expired"
        case .inGracePeriod: state = "grace_period"
        case .inBillingRetryPeriod: state = "billing_retry"
        case .revoked: state = "revoked"
        default: throw NSError(domain: "PictopiaAnalytics", code: 3)
        }
        candidates.append(metadata(transaction, state: state))
      }
    }
    let active = ["trial", "active_paid", "active_unknown", "grace_period"]
    let current = candidates.sorted {
      let a = active.contains($0["state"] as? String ?? "")
      let b = active.contains($1["state"] as? String ?? "")
      if a != b { return a }
      return ($0["purchasedAt"] as? Double ?? 0) > ($1["purchasedAt"] as? Double ?? 0)
    }.first
    if let current = current { return ["verified": true, "current": current] }
    return ["verified": true, "current": NSNull()]
  }
}
