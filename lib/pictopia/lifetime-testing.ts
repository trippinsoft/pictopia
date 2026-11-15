import { qualifiesForLifetime } from "./lifetime-plus";
import type { LibraryProgress } from "@/services/storage.types";
export const TEST_SUBSCRIPTIONS = ["free", "trial", "paid", "canceled-active", "expired"] as const;
export const TEST_PERCENTAGES = [0, 50, 99, 100] as const;
export const TEST_COUNTS = [999, 1000, 9999, 10000, 15000] as const;
export const TEST_AWARDS = ["not-earned", "eligible", "earned"] as const;
export interface LifetimeTest {
  subscription: typeof TEST_SUBSCRIPTIONS[number];
  percent: typeof TEST_PERCENTAGES[number];
  count: typeof TEST_COUNTS[number];
  award: typeof TEST_AWARDS[number];
  awardedAt: number | null;
  acknowledged: boolean;
}
export const defaultLifetimeTest: LifetimeTest = { subscription: "free", percent: 0, count: 15000, award: "not-earned", awardedAt: null, acknowledged: false };
export const testPaid = (s: LifetimeTest) => s.subscription === "paid" || s.subscription === "canceled-active";
export const testAchievementVisible = (s: LifetimeTest) => s.award === "earned" || testPaid(s);
export function testProgress(s: LifetimeTest): LibraryProgress {
  const explored = Math.ceil(s.count * s.percent / 100);
  return { accessible: s.count, accessibleExplored: explored, explored, remaining: s.count - explored, pending: 0, deleted: 0, deletedBytes: 0, unknownSizes: 0 };
}
/** The same completion policy as real awards, with explicitly synthetic evidence. */
export function testQualifies(s: LifetimeTest, now = Date.now()) {
  return qualifiesForLifetime(testPaid(s) ? { paidAt: now - 60000, expiresAt: now + 60000 } : null,
    { eventId: "simulation-only", completedAt: now, distinctEligiblePhotos: s.count,
      remainingPhotos: testProgress(s).remaining, fullAccess: true, scanComplete: true,
      scanSkipped: 0, libraryReliable: true, verified: true }, now);
}
/** Memory only: no storage, purchase SDK, network, signatures or award database. */
export function createLifetimeTestStore(authorized: boolean) {
  let state: LifetimeTest | null = null;
  const listeners = new Set<() => void>();
  const publish = (next: LifetimeTest | null) => { state = next; listeners.forEach(fn => fn()); };
  return {
    authorized,
    snapshot: () => authorized ? state : null,
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    change(change: Partial<Pick<LifetimeTest, "subscription" | "percent" | "count" | "award">>) {
      if (!authorized) return;
      const next = { ...(state ?? defaultLifetimeTest), ...change };
      if (!TEST_SUBSCRIPTIONS.includes(next.subscription) || !TEST_PERCENTAGES.includes(next.percent) || !TEST_COUNTS.includes(next.count) || !TEST_AWARDS.includes(next.award)) return;
      if (change.award) { next.awardedAt = change.award === "earned" ? Date.now() : null; next.acknowledged = false; }
      publish(next);
    },
    complete() {
      if (!authorized || !state || !testQualifies(state)) return false;
      if (state.award !== "earned") publish({ ...state, award: "earned", awardedAt: Date.now(), acknowledged: false });
      return true;
    },
    scenario() {
      if (!authorized) return;
      publish({ ...defaultLifetimeTest, subscription: "paid", percent: 100, award: "eligible" });
      this.complete();
    },
    acknowledge() { if (authorized && state) publish({ ...state, acknowledged: true }); },
    reset() { publish(null); },
  };
}
