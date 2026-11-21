import { storage } from "./storage";
import { trackSubscriptionAnalytics } from "./analytics";
import { storeSubscriptionAnalytics } from "./store-subscription-analytics";
import { devOverrideStore } from "./entitlement";
import { lifetimeTestStore } from "./lifetime-testing";
import { completionEvents, transactionProperties, type SubscriptionAnalyticsLedger } from "@/lib/pictopia/subscription-analytics";
import { offerKind } from "@/lib/pictopia/store-entitlement";

const KEY = "subscriptionAnalytics:v1";
let tail = Promise.resolve();
// Delivery ledger only: failures never change purchases or access.
function serialized(work: () => Promise<void>): Promise<void> {
  const next = tail.then(work).catch(() => {});
  tail = next;
  return next;
}
const read = async () => await storage.getValue<SubscriptionAnalyticsLedger>(KEY) ?? { completed: {} };
export const subscriptionAnalytics = {
  async enabled() {
    try {
      return !lifetimeTestStore.snapshot() && (await devOverrideStore.load()).mode === "auto";
    } catch { return false; }
  },
  async prepare() {
    try { return await storeSubscriptionAnalytics.history(); } catch { return null; }
  },
  observe() {
    return serialized(async () => {
      if (!await subscriptionAnalytics.enabled()) return;
      const snapshot = await storeSubscriptionAnalytics.snapshot();
      if (!snapshot?.verified || snapshot.current?.storeEnvironment === "xcode") return;
      const ledger = await read();
      const state = snapshot.current?.state ?? "none";
      if (ledger.status === state) return;
      const previous = ledger.status;
      await storage.setValue(KEY, { ...ledger, status: state });
      // First verified observation is a baseline; cached access is never a transition.
      if (previous !== undefined) trackSubscriptionAnalytics("subscription_status_changed", {
        previous_status: previous, status: state,
        ...(snapshot.current ? transactionProperties(snapshot.current) : {}),
      });
    });
  },
  completed(transactionId: string, productId: string, baseline: readonly string[] | null) {
    return serialized(async () => {
      if (!await subscriptionAnalytics.enabled()) return;
      // Without a pre-purchase baseline, redelivery cannot be distinguished safely.
      if (!baseline) return;
      const t = await storeSubscriptionAnalytics.transaction(transactionId).catch(() => null);
      if (!t?.verified || t.productId !== productId) {
        trackSubscriptionAnalytics("purchase_failed", { product_id: productId, plan: offerKind(productId) ?? "unknown", error_reason: "verification_failed", user_cancelled: false });
        return;
      }
      const ledger = await read();
      const events = completionEvents(ledger, t, baseline);
      if (!events.length) return;
      await storage.setValue(KEY, { ...ledger, completed: { ...ledger.completed, [t.fingerprint]: true } });
      for (const event of events) trackSubscriptionAnalytics(event, {
        ...transactionProperties(t),
        ...(event === "trial_started" && t.trialDurationDays !== undefined ? { trial_duration_days: t.trialDurationDays } : {}),
      });
    });
  },
  restored() {
    return serialized(async () => {
      if (!await subscriptionAnalytics.enabled()) return;
      const snapshot = await storeSubscriptionAnalytics.snapshot();
      const t = snapshot?.verified ? snapshot.current : null;
      if (!t || t.storeEnvironment === "xcode" || !["trial", "active_paid", "active_unknown", "grace_period"].includes(t.state)) return;
      trackSubscriptionAnalytics("subscription_restored", {
        ...transactionProperties(t), entitlement_type: t.ownership === "family_shared" ? "family_shared" : "apple_subscription",
      });
    });
  },
};
