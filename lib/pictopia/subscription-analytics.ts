import { offerKind, PRO_PRODUCT_IDS } from "./store-entitlement";
import type { Offer } from "./types";

export type SubscriptionEvent = "paywall_viewed" | "subscription_selected" | "purchase_started" | "trial_started" | "purchase_completed" | "purchase_failed" | "subscription_restored" | "subscription_status_changed";
export type SubscriptionState = "none" | "trial" | "active_paid" | "active_unknown" | "expired" | "grace_period" | "billing_retry" | "revoked";
export type FailureReason = "user_cancelled" | "store_error" | "network_error" | "unavailable" | "pending_approval" | "verification_failed";
export const PAYWALL_ENTRIES = ["Home", "Settings", "daily_limit", "Adventure", "Explore", "Smart Clean", "Duplicates", "Statistics", "Onboarding", "unknown"] as const;
export function paywallEntry(value: unknown): string {
  return PAYWALL_ENTRIES.includes(value as typeof PAYWALL_ENTRIES[number]) ? value as string : "unknown";
}
export function offerProperties(offer: Offer) {
  return {
    product_id: offer.id, plan: offer.kind, localized_price: offer.price,
    price_amount: offer.amount, currency: offer.currency,
    free_trial_available: offer.freeTrialAvailable ?? (offer.trialDays ? true : "unknown"),
    trial_eligibility: offer.trialEligible === undefined ? "unknown" : offer.trialEligible,
  };
}
// Strict boundary: never forward transaction IDs, tokens, receipts or arbitrary error text.
const stringValues: Record<string, readonly string[]> = {
  product_id: PRO_PRODUCT_IDS, plan: ["weekly", "monthly", "annual"], entry_point: PAYWALL_ENTRIES,
  store_environment: ["production", "sandbox", "xcode", "unknown"],
  distribution: ["development", "testflight_inferred", "app_store", "unknown"],
  purchase_type: ["trial", "paid", "unknown"], entitlement_type: ["apple_subscription", "family_shared"],
  previous_status: ["none", "trial", "active_paid", "active_unknown", "expired", "grace_period", "billing_retry", "revoked"],
  status: ["none", "trial", "active_paid", "active_unknown", "expired", "grace_period", "billing_retry", "revoked"],
  error_reason: ["user_cancelled", "store_error", "network_error", "unavailable", "pending_approval", "verification_failed"],
  selection_source: ["default", "user"], trial_eligibility: ["unknown"],
  free_trial_available: ["unknown"],
};
export function sanitizeSubscriptionProperties(input: Record<string, unknown>): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string" && stringValues[key]?.includes(value)) result[key] = value;
    else if (typeof value === "boolean" && ["premium_access", "free_trial_available", "trial_eligibility", "user_cancelled"].includes(key)) result[key] = value;
    else if (typeof value === "number" && Number.isFinite(value) && value >= 0 && ["price_amount", "trial_duration_days", "expires_at", "next_billing_at"].includes(key)) result[key] = value;
    else if (typeof value === "string" && key === "currency" && /^[A-Z]{3}$/.test(value)) result[key] = value;
    else if (typeof value === "string" && key === "localized_price" && value.length <= 64) result[key] = value;
  }
  return result;
}
/** Authoritative metadata only; never used to grant access. Fingerprints stay on device. */
export interface VerifiedSubscription {
  verified: true;
  fingerprint: string;
  productId: string;
  state: SubscriptionState;
  purchaseType: "trial" | "paid" | "unknown";
  purchasedAt: number;
  expiresAt?: number;
  trialDurationDays?: number;
  reason: "purchase" | "renewal" | "unknown";
  ownership: "purchased" | "family_shared";
  storeEnvironment: "production" | "sandbox" | "xcode" | "unknown";
  distribution: "development" | "testflight_inferred" | "app_store" | "unknown";
}
export interface VerifiedSnapshot { verified: true; current: VerifiedSubscription | null; }
export function transactionProperties(t: VerifiedSubscription) {
  return {
    product_id: t.productId, plan: offerKind(t.productId) ?? "unknown",
    store_environment: t.storeEnvironment, distribution: t.distribution, purchase_type: t.purchaseType,
    ...(t.expiresAt ? { expires_at: t.expiresAt } : {}),
  };
}
export interface SubscriptionAnalyticsLedger { completed: Record<string, true>; status?: SubscriptionState; }
/** Save before delivery for at-most-once invocation, including concurrent listeners/relaunch. */
export function completionEvents(ledger: SubscriptionAnalyticsLedger, t: VerifiedSubscription, baseline: readonly string[]): SubscriptionEvent[] {
  if (!t.verified || !PRO_PRODUCT_IDS.includes(t.productId) || !t.fingerprint ||
      t.ownership !== "purchased" || t.reason !== "purchase" || baseline.includes(t.fingerprint) ||
      !["trial", "active_paid", "active_unknown"].includes(t.state) || t.storeEnvironment === "xcode" || ledger.completed[t.fingerprint]) return [];
  return t.purchaseType === "trial" ? ["trial_started", "purchase_completed"] : ["purchase_completed"];
}
