import { storage, serialize, DAILY_ACTIVITY, deletionActivityValues } from "./repository";
import {
  applyRestore,
  currentAllowance,
  streak,
  streakAllowance,
  type Activity,
  type Allowance,
  type StreakRestore,
} from "@/lib/pictopia/daily";
import { effectiveReviewLimit } from "@/lib/pictopia/entitlement";
import { devOverrideStore } from "./entitlement";
import { REFERRAL_WALLET, walletAllowance, chargeReview, refundReview, type ReferralWallet } from "@/lib/pictopia/referral-wallet";

export { DAILY_ACTIVITY };
export const STREAK_RESTORES = "streakRestores:v1";
export const SWIPE_ALLOWANCE = "swipeAllowance:v1";

/** Inside the repository serializer: commit these values with the Undo's session/media. */
export async function reviewRefundValues(id: string, now = Date.now()) {
  const result = refundReview(await storage.getValue<Allowance>(SWIPE_ALLOWANCE), await storage.getValue<ReferralWallet>(REFERRAL_WALLET), id, await allowanceStore.limit(now), now);
  return { [SWIPE_ALLOWANCE]: result.state, [REFERRAL_WALLET]: result.wallet };
}

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
  /** Completed days establish today's 100–200 allowance. Developer testing limits still win. */
  async limit(now = Date.now()) {
    const [activity, restores, override] = await Promise.all([
      storage.getValue<Activity>(DAILY_ACTIVITY), storage.getValue<StreakRestore[]>(STREAK_RESTORES), devOverrideStore.load(),
    ]);
    return effectiveReviewLimit(streakAllowance(activity, restores ?? [], now), override, devOverrideStore.authorized);
  },
  async refreshLimit(_fetcher?: typeof fetch) { return this.limit(); },
  async state(now = Date.now()) {
    return currentAllowance(await storage.getValue<Allowance>(SWIPE_ALLOWANCE), now);
  },
  async snapshot(now = Date.now()) {
    return serialize(async () => {
      const [state, wallet, limit] = await Promise.all([
        storage.getValue<Allowance>(SWIPE_ALLOWANCE), storage.getValue<ReferralWallet>(REFERRAL_WALLET), this.limit(now),
      ]);
      const result = walletAllowance(state, wallet, limit, now);
      if (JSON.stringify(state) !== JSON.stringify(result.state) || JSON.stringify(wallet) !== JSON.stringify(result.wallet)) {
        await storage.put([], { [SWIPE_ALLOWANCE]: result.state, [REFERRAL_WALLET]: result.wallet });
      }
      return { ...result, date: result.state.date };
    });
  },
  /** Counts a newly presented asset (once per day). Returns whether it may be shown. */
  async present(id: string, pro: boolean, now = Date.now()) {
    return serialize(async () => {
      const limit = await this.limit(now);
      const result = chargeReview(await storage.getValue<Allowance>(SWIPE_ALLOWANCE), await storage.getValue<ReferralWallet>(REFERRAL_WALLET), id, limit, pro, now);
      await storage.put([], { [SWIPE_ALLOWANCE]: result.state, [REFERRAL_WALLET]: result.wallet });
      return { ...result, date: result.state.date };
    });
  },
  /** Undo gives the discarded photo's free review back for today. */
  async refund(id: string, now = Date.now()) {
    return serialize(async () => {
      const limit = await this.limit(now);
      const result = refundReview(await storage.getValue<Allowance>(SWIPE_ALLOWANCE), await storage.getValue<ReferralWallet>(REFERRAL_WALLET), id, limit, now);
      await storage.put([], { [SWIPE_ALLOWANCE]: result.state, [REFERRAL_WALLET]: result.wallet });
      return { ...result, date: result.state.date };
    });
  },
  /** Developer tools only: starts today's free allowance over. Touches nothing but the
   * allowance record — no photos, decisions, streak activity or deletion records. */
  async resetToday(now = Date.now()) {
    if (!devOverrideStore.authorized) throw Error("Developer tools aren’t available in this build.");
    await serialize(async () => {
      const state = currentAllowance(await storage.getValue<Allowance>(SWIPE_ALLOWANCE), now);
      // Developer reset touches today's usage only; it never mints referral credits.
      await storage.setValue(SWIPE_ALLOWANCE, { ...state, counted: [], referralCounted: [] });
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
