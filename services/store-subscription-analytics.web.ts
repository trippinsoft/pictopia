import type { StoreSubscriptionAnalytics } from "./store-subscription-analytics.types";
export const storeSubscriptionAnalytics: StoreSubscriptionAnalytics = {
  canVerifyTransactions: false,
  async history() { return null; },
  async snapshot() { return null; },
  async transaction() { return null; },
};
