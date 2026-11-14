import { storage, serialize, DAILY_ACTIVITY, deletionActivityValues } from "./repository";
import {
  DEFAULT_FREE_SWIPES,
  applyRestore,
  currentAllowance,
  presentAsset,
  streak,
  type Activity,
  type Allowance,
  type StreakRestore,
} from "@/lib/pictopia/daily";
import { effectiveReviewLimit } from "@/lib/pictopia/entitlement";
import { devOverrideStore } from "./entitlement";

export { DAILY_ACTIVITY };
export const STREAK_RESTORES = "streakRestores:v1";
export const SWIPE_ALLOWANCE = "swipeAllowance:v1";

export const dailyStore = {
  async streak(now = Date.now()) {
    const [activity, restores] = await Promise.all([
      storage.getValue<Activity>(DAILY_ACTIVITY),
      storage.getValue<StreakRestore[]>(STREAK_RESTORES),
    ]);
    return streak(activity, restores ?? [], now);
  },
  /** Uses the offered restore, if the rules still allow it at this moment. */
  async restore(now = Date.now()) {
    return serialize(async () => {
      const activity = await storage.getValue<Activity>(DAILY_ACTIVITY);
      const next = applyRestore(activity, (await storage.getValue<StreakRestore[]>(STREAK_RESTORES)) ?? [], now);
      if (!next) throw Error("This streak can’t be restored any more.");
      await storage.setValue(STREAK_RESTORES, next);
      return streak(activity, next, now);
    });
  },
  async activity() {
    return storage.getValue<Activity>(DAILY_ACTIVITY);
  },
  async restores() {
    return (await storage.getValue<StreakRestore[]>(STREAK_RESTORES)) ?? [];
  },
};

export const allowanceStore = {
  /** The approved business rule is fixed at 100 distinct displayed items per local day. Only an
   * authorized developer build can substitute a testing limit (see `effectiveReviewLimit`). */
  async limit() { return effectiveReviewLimit(DEFAULT_FREE_SWIPES, await devOverrideStore.load(), devOverrideStore.authorized); },
  async refreshLimit(_fetcher?: typeof fetch) { return this.limit(); },
  async state(now = Date.now()) {
    return currentAllowance(await storage.getValue<Allowance>(SWIPE_ALLOWANCE), now);
  },
  /** Counts a newly presented asset (once per day). Returns whether it may be shown. */
  async present(id: string, pro: boolean, now = Date.now()) {
    return serialize(async () => {
      const limit = await this.limit();
      const result = presentAsset(await storage.getValue<Allowance>(SWIPE_ALLOWANCE), id, limit, pro, now);
      if (result.changed) await storage.setValue(SWIPE_ALLOWANCE, result.state);
      return { allowed: result.allowed, left: Math.max(0, limit - result.state.counted.length), limit, counted: result.state.counted };
    });
  },
  /** Developer tools only: starts today's free allowance over. Touches nothing but the
   * allowance record — no photos, decisions, streak activity or deletion records. */
  async resetToday(now = Date.now()) {
    if (!devOverrideStore.authorized) throw Error("Developer tools aren’t available in this build.");
    await serialize(async () => {
      const state = currentAllowance(await storage.getValue<Allowance>(SWIPE_ALLOWANCE), now);
      await storage.setValue(SWIPE_ALLOWANCE, { ...state, counted: [] });
    });
    devOverrideStore.notify();
  },
};

/** Confirmed deletions count toward today's streak (one is enough to qualify the day). */
export async function recordDeletions(count: number, at = Date.now()) {
  return serialize(async () => {
    const values = await deletionActivityValues(count, at);
    for (const [key, value] of Object.entries(values)) await storage.setValue(key, value);
  });
}
