import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo-modules-core";
import { PRO_PRODUCT_IDS } from "@/lib/pictopia/store-entitlement";
import type { StoreSubscriptionAnalytics } from "./store-subscription-analytics.types";
const native = requireOptionalNativeModule<{
  subscriptionAnalyticsHistory?(ids: string[]): Promise<string[]>;
  subscriptionAnalyticsSnapshot?(ids: string[]): ReturnType<StoreSubscriptionAnalytics["snapshot"]>;
  subscriptionAnalyticsTransaction?(id: string, ids: string[]): ReturnType<StoreSubscriptionAnalytics["transaction"]>;
}>("PictopiaAnalysis");
export const storeSubscriptionAnalytics: StoreSubscriptionAnalytics = {
  canVerifyTransactions: !!native?.subscriptionAnalyticsTransaction && !!native?.subscriptionAnalyticsHistory,
  async history() {
    return Platform.OS === "ios" ? await native?.subscriptionAnalyticsHistory?.(PRO_PRODUCT_IDS) ?? null : null;
  },
  async snapshot() {
    return Platform.OS === "ios" ? await native?.subscriptionAnalyticsSnapshot?.(PRO_PRODUCT_IDS) ?? null : null;
  },
  async transaction(id) {
    return Platform.OS === "ios" ? await native?.subscriptionAnalyticsTransaction?.(id, PRO_PRODUCT_IDS) ?? null : null;
  },
};
