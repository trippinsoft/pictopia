import Purchases, { CustomerInfo, PurchasesPackage } from "react-native-purchases";
import { Platform } from "react-native";
import { PurchaseService } from "./purchases.types";
import { Entitlement, Offer } from "@/lib/flickwell/types";
const key =
  Platform.OS === "ios"
    ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY
    : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;
let packages: PurchasesPackage[] = [];
let configured = false;
function entitlement(info: CustomerInfo): Entitlement {
  const e = info.entitlements.active.pro;
  return {
    active: !!e,
    expires: e?.expirationDate ? new Date(e.expirationDate).getTime() : null,
    verifiedAt: Date.now(),
    managementURL: info.managementURL,
  };
}
function check() {
  if (!configured)
    throw Error(
      "Store purchases are not configured yet. RevenueCat public keys and store products are required.",
    );
}
export const purchaseService: PurchaseService = {
  async init(listener) {
    if (!key) return () => {};
    Purchases.configure({ apiKey: key });
    configured = true;
    const callback = (info: CustomerInfo) => listener(entitlement(info));
    Purchases.addCustomerInfoUpdateListener(callback);
    try {
      callback(await Purchases.getCustomerInfo());
    } catch {
      /* Retain only the previously verified, unexpired local entitlement. */
    }
    return () => Purchases.removeCustomerInfoUpdateListener(callback);
  },
  async offers() {
    check();
    const offering = (await Purchases.getOfferings()).current;
    packages = offering?.availablePackages ?? [];
    return packages.flatMap((p) => {
      const kind =
        p.packageType === "MONTHLY"
          ? "monthly"
          : p.packageType === "ANNUAL"
            ? "annual"
            : p.packageType === "LIFETIME"
              ? "lifetime"
              : null;
      return kind
        ? [
            {
              id: p.identifier,
              kind,
              price: p.product.priceString,
              amount: p.product.price,
              currency: p.product.currencyCode,
            } as Offer,
          ]
        : [];
    });
  },
  async refresh() {
    check();
    return entitlement(await Purchases.getCustomerInfo());
  },
  async purchase(id) {
    check();
    const p = packages.find((p) => p.identifier === id);
    if (!p) throw Error("This store product is unavailable. Refresh the plans and try again.");
    try {
      return entitlement((await Purchases.purchasePackage(p)).customerInfo);
    } catch (e) {
      const error = e as { userCancelled?: boolean; code?: string };
      if (error.userCancelled) throw Error("Purchase cancelled. You have not been charged.");
      if (error.code === "20")
        throw Error("Purchase is pending store approval. Pro will unlock after approval.");
      throw Error("The store could not complete this purchase. Please try again.");
    }
  },
  async restore() {
    check();
    return entitlement(await Purchases.restorePurchases());
  },
};
