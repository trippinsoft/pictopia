import type { Entitlement, Offer } from "./types";

/** Store product IDs, identical in App Store Connect and Google Play Console. */
export const PRO_PRODUCTS = { monthly: "pictopia.pro.monthly", annual: "pictopia.pro.annual" } as const;
export const PRO_PRODUCT_IDS: string[] = Object.values(PRO_PRODUCTS);
/** Google Play does not report an expiry on the device, so a verified Android result is trusted
 * offline for this long before the store must confirm it again. */
export const ANDROID_OFFLINE_DAYS = 3;
const DAY = 86400000;

export interface StoreSubscription {
  productId: string;
  isActive: boolean;
  /** iOS only: StoreKit expiry in ms. */
  expirationDateIOS?: number | null;
}

/** Pro is active when the store reports an active subscription to one of Pictopia's products.
 * Refunded, revoked and expired subscriptions are not reported by either store. */
export function entitlementFrom(
  subscriptions: readonly StoreSubscription[],
  os: "ios" | "android",
  now = Date.now(),
  managementURL: string | null = null,
): Entitlement {
  const active = subscriptions.filter(
    (s) => s.isActive && PRO_PRODUCT_IDS.includes(s.productId) && !(s.expirationDateIOS && s.expirationDateIOS <= now),
  );
  if (!active.length) return { active: false, expires: null, verifiedAt: now, managementURL };
  const expires =
    os === "ios"
      ? Math.max(...active.map((s) => s.expirationDateIOS ?? now + ANDROID_OFFLINE_DAYS * DAY))
      : now + ANDROID_OFFLINE_DAYS * DAY;
  return { active: true, expires, verifiedAt: now, managementURL };
}

export function offerKind(productId: string): Offer["kind"] | undefined {
  return productId === PRO_PRODUCTS.monthly ? "monthly" : productId === PRO_PRODUCTS.annual ? "annual" : undefined;
}

export function managementURL(os: "ios" | "android", packageName: string, productId?: string) {
  return os === "ios"
    ? "https://apps.apple.com/account/subscriptions"
    : `https://play.google.com/store/account/subscriptions?package=${packageName}${productId ? `&sku=${productId}` : ""}`;
}
