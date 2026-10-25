import { PurchaseService } from "./purchases.types";
const unavailable = () =>
  Promise.reject(
    Error(
      "Purchases and restoration are available in the native app through the App Store or Google Play.",
    ),
  );
export const purchaseService: PurchaseService = {
  async init() {
    return () => {};
  },
  async offers() {
    return [];
  },
  async refresh() {
    return { active: false, expires: null, verifiedAt: Date.now() };
  },
  purchase: unavailable,
  restore: unavailable,
};
