import { Platform } from "react-native";
import {
  initConnection,
  verifyAppOwnership,
  fetchProducts,
  requestPurchase,
  finishTransaction,
  getActiveSubscriptions,
  getAvailablePurchases,
  restorePurchases,
  purchaseUpdatedListener,
  purchaseErrorListener,
  isUserCancelledError,
  isEligibleForIntroOfferIOS,
  type Purchase,
  type ProductSubscription,
} from "expo-iap";
import { PurchaseService } from "./purchases.types";
import { subscriptionAnalytics } from "./subscription-analytics";
import { trackSubscriptionAnalytics } from "./analytics";
import { notificationService } from "./notifications";
import { storeSubscriptionAnalytics } from "./store-subscription-analytics";
import { trialReminderAt } from "@/lib/pictopia/onboarding";
import { offerProperties, type FailureReason } from "@/lib/pictopia/subscription-analytics";
import type { Entitlement, Offer } from "@/lib/pictopia/types";
import {
  PRO_PRODUCT_IDS,
  entitlementFrom,
  freeTrialDays,
  managementURL,
  offerKind,
} from "@/lib/pictopia/store-entitlement";

// Subscription access stays direct StoreKit 2 / Play Billing, without accounts.
// Separate lifetime eligibility sends store evidence to the existing Supabase verifier.
const os = Platform.OS === "ios" ? "ios" : "android";
const [osMajor, osMinor = 0] = String(Platform.Version).split(".").map(Number);
const supportsTrialReminders = os === "ios" && (osMajor > 17 || (osMajor === 17 && osMinor >= 2)) && storeSubscriptionAnalytics.canVerifyTransactions;
const PACKAGE = "com.trippinsoft.pictopia";
let connection: Promise<boolean> | null = null;
let products: ProductSubscription[] = [];
type Pending = { resolve(): void; reject(e: Error): void; baseline: string[] | null; analytics: boolean; reminderTrialDays?: number; failed?: boolean; handling?: boolean };
const waiting = new Map<string, Pending>();
let offers: Offer[] = [];
function failure(id: string, reason: FailureReason, pending?: Pending) {
  if (!pending?.analytics || pending.failed) return;
  pending.failed = true;
  trackSubscriptionAnalytics("purchase_failed", {
    product_id: id, plan: offerKind(id) ?? "unknown", error_reason: reason, user_cancelled: reason === "user_cancelled",
  });
}
function errorReason(error: unknown): FailureReason {
  if (isUserCancelledError(error)) return "user_cancelled";
  const code = (error as { code?: string } | null)?.code;
  if (code === "network-error") return "network_error";
  if (code === "item-unavailable" || code === "iap-not-available" || code === "service-unavailable") return "unavailable";
  return "store_error";
}

function connect() {
  connection ??= initConnection().catch((e: unknown) => {
    connection = null;
    throw e;
  });
  return connection;
}
const owned = (p: Purchase) => PRO_PRODUCT_IDS.includes(p.productId);

async function scheduleTrialReminder(purchase: Purchase, pending: Pending) {
  const { baseline, reminderTrialDays } = pending;
  if (!baseline || !reminderTrialDays || await notificationService.permission() !== "granted") return;
  const trial = await storeSubscriptionAnalytics.transaction(purchase.transactionId || purchase.id);
  if (!trial?.verified || trial.productId !== purchase.productId || !trial.fingerprint || baseline.includes(trial.fingerprint) ||
      trial.state !== "trial" || trial.purchaseType !== "trial" || trial.ownership !== "purchased" || trial.reason === "renewal" ||
      (trial.storeEnvironment !== "production" && trial.storeEnvironment !== "sandbox") || !trial.expiresAt) return;
  const at = trialReminderAt(reminderTrialDays, trial.purchasedAt, trial.expiresAt, trial.storeEnvironment === "sandbox", Date.now());
  if (at === undefined) return;
  await notificationService.scheduleOnce({
    id: "pictopia-plus-trial-ending",
    at,
    title: "Your Pictopia+ trial ends soon",
    body: "Check your App Store subscription before your trial ends.",
    url: "/settings",
  });
}

/** Finish (and on Android, acknowledge within Google's three days) every completed purchase.
 * Pending purchases grant nothing until the store reports them purchased. */
async function settle(purchase: Purchase) {
  if (!owned(purchase) || purchase.purchaseState !== "purchased") return;
  try {
    await finishTransaction({ purchase, isConsumable: false });
  } catch {
    /* Already finished: StoreKit and Play redeliver finished purchases harmlessly. */
  }
}

async function check(): Promise<Entitlement> {
  await connect();
  const subscriptions = await getActiveSubscriptions(PRO_PRODUCT_IDS);
  const current = subscriptions.find((s) => s.isActive && PRO_PRODUCT_IDS.includes(s.productId));
  void subscriptionAnalytics.observe();
  return entitlementFrom(
    subscriptions,
    os,
    Date.now(),
    managementURL(os, PACKAGE, current?.productId),
  );
}

export const purchaseService: PurchaseService = {
  supportsTrialReminders,
  async init(listener) {
    const updated = purchaseUpdatedListener((purchase) => {
      if (!owned(purchase)) return;
      const pending = waiting.get(purchase.productId);
      if (pending?.handling) return;
      if (purchase.purchaseState === "pending") {
        failure(purchase.productId, "pending_approval", pending);
        waiting.delete(purchase.productId);
        pending?.reject(
          Error(
            "Your purchase is waiting for approval. Pro unlocks as soon as the store confirms it.",
          ),
        );
        return;
      }
      if (purchase.purchaseState !== "purchased") return;
      if (pending) pending.handling = true;
      void settle(purchase)
        .then(check)
        .then(async (e) => {
          if (pending?.analytics && os === "ios") {
            if (e.active) void subscriptionAnalytics.completed(purchase.transactionId || purchase.id, purchase.productId, pending.baseline);
            else failure(purchase.productId, "verification_failed", pending);
          }
          listener(e);
          if (e.active && pending?.reminderTrialDays) await scheduleTrialReminder(purchase, pending).catch(() => {});
          waiting.delete(purchase.productId);
          pending?.resolve();
        })
        .catch(() => {
          failure(purchase.productId, "verification_failed", pending);
          waiting.delete(purchase.productId);
          pending?.resolve();
        });
    });
    const failed = purchaseErrorListener((error) => {
      const id = error.productId ?? [...waiting.keys()][0];
      const pending = id ? waiting.get(id) : undefined;
      if (!id || !pending) return;
      waiting.delete(id);
      failure(id, errorReason(error), pending);
      pending.reject(
        Error(
          isUserCancelledError(error)
            ? "Purchase cancelled. You have not been charged."
            : "The store couldn’t complete this purchase. Please try again.",
        ),
      );
    });
    try {
      await connect();
      for (const purchase of await getAvailablePurchases()) await settle(purchase);
      listener(await check());
    } catch {
      /* Offline or store unavailable: the cached, unexpired entitlement stays in effect. */
    }
    return () => {
      updated.remove();
      failed.remove();
    };
  },
  async offers() {
    await connect();
    const result = await fetchProducts({ skus: PRO_PRODUCT_IDS, type: "subs" });
    products = (result ?? []).filter(
      (p): p is ProductSubscription => PRO_PRODUCT_IDS.includes(p.id) && p.type === "subs",
    );
    // Google Play lists only the offers this person is eligible for; StoreKit lists the
    // introductory offer to everyone, so iOS also asks whether this Apple ID can still use it.
    const eligible = new Map<string, boolean | undefined>();
    if (os === "ios")
      for (const group of new Set(products.map((p) => ("subscriptionGroupIdIOS" in p ? p.subscriptionGroupIdIOS : null)).filter((g): g is string => !!g)))
        eligible.set(group, await isEligibleForIntroOfferIOS(group).catch(() => undefined));
    offers = products.flatMap((p) => {
      const kind = offerKind(p.id);
      const group = "subscriptionGroupIdIOS" in p ? p.subscriptionGroupIdIOS : null;
      const trial = os === "ios" && (!group || !eligible.get(group)) ? undefined : freeTrialDays(p.subscriptionOffers);
      return kind
        ? [
            {
              id: p.id,
              kind,
              price: p.displayPrice,
              amount: p.price ?? 0,
              currency: p.currency,
              freeTrialAvailable: !freeTrialDays(p.subscriptionOffers) ? false : os === "ios" ? group ? eligible.get(group) : undefined : true,
              trialEligible: os === "ios" ? group ? eligible.get(group) : undefined : !!freeTrialDays(p.subscriptionOffers),
              ...(trial ? { trialDays: trial } : {}),
            } satisfies Offer,
          ]
        : [];
    });
    return offers;
  },
  refresh: check,
  async evidence(refreshOwnership = false) {
    await connect();
    const available = await getAvailablePurchases(os === "ios" ? { onlyIncludeActiveItemsIOS: false, alsoPublishToEventListenerIOS: false } : undefined);
    const tokens = [...new Set(available.filter(p => owned(p) && p.purchaseState === "purchased").map(p => p.purchaseToken).filter((t): t is string => !!t))].slice(0, 6);
    if (os === "android") return { platform: "android", tokens };
    // iOS 16+ exposes signed app ownership even after all subscriptions expire.
    // Older binaries/OS versions can still provide signed subscription transactions.
    let appJws: string | undefined;
    try {
      const ownership = await verifyAppOwnership({ apple: { refresh: refreshOwnership } });
      appJws = ownership.signedAppTransactionIOS ?? undefined;
    } catch { /* Missing native support is not paid evidence. */ }
    return { platform: "ios", transactions: tokens, ...(appJws ? { appJws } : {}) };
  },
  async purchase(id, options) {
    await connect();
    if (!PRO_PRODUCT_IDS.includes(id)) throw Error("This plan is unavailable.");
    const product = products.find((p) => p.id === id);
    if (!product) throw Error("This plan is unavailable. Refresh the plans and try again.");
    if (waiting.has(id)) throw Error("A purchase is already in progress.");
    const analytics = await subscriptionAnalytics.enabled();
    const offer = offers.find(o => o.id === id);
    const reminderTrialDays = supportsTrialReminders && options?.remindBeforeTrialEnds ? offer?.trialDays : undefined;
    const baseline = os === "ios" && (analytics || reminderTrialDays) ? await subscriptionAnalytics.prepare() : null;
    if (waiting.has(id)) throw Error("A purchase is already in progress.");
    if (analytics) trackSubscriptionAnalytics("purchase_started", { product_id: id, plan: offerKind(id) ?? "unknown", trial_eligibility: "unknown", ...(offer ? offerProperties(offer) : {}) });
    let pending!: Pending;
    const done = new Promise<void>((resolve, reject) => { pending = { resolve, reject, baseline, analytics, reminderTrialDays }; waiting.set(id, pending); });
    // Store listeners may reject before requestPurchase settles; attach a handler immediately.
    void done.catch(() => {});
    try {
      if (os === "ios") await requestPurchase({ request: { apple: { sku: id } }, type: "subs" });
      else {
        // Play requires an offer token: the free-trial offer when this person is eligible for
        // one, otherwise the base plan's token.
        const tokens = "subscriptionOffers" in product ? (product.subscriptionOffers ?? []).filter((o) => o.offerTokenAndroid) : [];
        const offer = tokens.find((o) => o.paymentMode === "free-trial") ?? tokens[0];
        if (!offer?.offerTokenAndroid) {
          waiting.delete(id);
          throw Error("This plan isn’t available from Google Play yet.");
        }
        await requestPurchase({
          request: {
            google: {
              skus: [id],
              subscriptionOffers: [{ sku: id, offerToken: offer.offerTokenAndroid }],
            },
          },
          type: "subs",
        });
      }
    } catch (e) {
      failure(id, errorReason(e), pending);
      waiting.delete(id);
      throw Error(
        isUserCancelledError(e)
          ? "Purchase cancelled. You have not been charged."
          : e instanceof Error && /available/.test(e.message)
            ? e.message
            : "The store couldn’t complete this purchase. Please try again.",
      );
    }
    await done;
    return check();
  },
  async restore() {
    await connect();
    await restorePurchases();
    for (const purchase of await getAvailablePurchases()) await settle(purchase);
    const entitlement = await check();
    if (entitlement.active && os === "ios") void subscriptionAnalytics.restored();
    return entitlement;
  },
};
