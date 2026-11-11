import { Platform } from "react-native";
import {
  initConnection,
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
import type { Entitlement, Offer } from "@/lib/pictopia/types";
import {
  PRO_PRODUCT_IDS,
  entitlementFrom,
  freeTrialDays,
  managementURL,
  offerKind,
} from "@/lib/pictopia/store-entitlement";

// Apple StoreKit 2 and Google Play Billing directly, with no server and no account. The stores
// only report active, unrefunded subscriptions, so each refresh is the entitlement check.
const os = Platform.OS === "ios" ? "ios" : "android";
const PACKAGE = "com.trippinsoft.pictopia";
let connection: Promise<boolean> | null = null;
let products: ProductSubscription[] = [];
const waiting = new Map<string, { resolve(): void; reject(e: Error): void }>();

function connect() {
  connection ??= initConnection().catch((e: unknown) => {
    connection = null;
    throw e;
  });
  return connection;
}
const owned = (p: Purchase) => PRO_PRODUCT_IDS.includes(p.productId);

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
  return entitlementFrom(
    subscriptions,
    os,
    Date.now(),
    managementURL(os, PACKAGE, current?.productId),
  );
}

export const purchaseService: PurchaseService = {
  async init(listener) {
    const updated = purchaseUpdatedListener((purchase) => {
      if (!owned(purchase)) return;
      const pending = waiting.get(purchase.productId);
      if (purchase.purchaseState === "pending") {
        waiting.delete(purchase.productId);
        pending?.reject(
          Error(
            "Your purchase is waiting for approval. Pro unlocks as soon as the store confirms it.",
          ),
        );
        return;
      }
      void settle(purchase)
        .then(check)
        .then((e) => {
          listener(e);
          waiting.delete(purchase.productId);
          pending?.resolve();
        })
        .catch(() => pending?.resolve());
    });
    const failed = purchaseErrorListener((error) => {
      const id = error.productId ?? [...waiting.keys()][0];
      const pending = id ? waiting.get(id) : undefined;
      if (!id || !pending) return;
      waiting.delete(id);
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
    const eligible = new Map<string, boolean>();
    if (os === "ios")
      for (const group of new Set(products.map((p) => ("subscriptionGroupIdIOS" in p ? p.subscriptionGroupIdIOS : null)).filter((g): g is string => !!g)))
        eligible.set(group, await isEligibleForIntroOfferIOS(group).catch(() => false));
    return products.flatMap((p) => {
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
              ...(trial ? { trialDays: trial } : {}),
            } satisfies Offer,
          ]
        : [];
    });
  },
  refresh: check,
  async purchase(id) {
    await connect();
    if (!PRO_PRODUCT_IDS.includes(id)) throw Error("This plan is unavailable.");
    const product = products.find((p) => p.id === id);
    if (!product) throw Error("This plan is unavailable. Refresh the plans and try again.");
    const done = new Promise<void>((resolve, reject) => waiting.set(id, { resolve, reject }));
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
    return check();
  },
};
