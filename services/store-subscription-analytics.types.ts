import type { VerifiedSnapshot, VerifiedSubscription } from "@/lib/pictopia/subscription-analytics";
export interface StoreSubscriptionAnalytics {
  history(): Promise<string[] | null>;
  snapshot(): Promise<VerifiedSnapshot | null>;
  transaction(id: string): Promise<VerifiedSubscription | null>;
}
