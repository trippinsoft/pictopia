/** Onboarding facts, pure so they're testable: the library reveal's per-year totals and the
 * free-trial timeline. Nothing here invents numbers — every figure comes from the library or
 * from what the store reports. */
import type { Month, Offer } from "./types";

export const TAGLINE = "The fast, fun way to sort your photos";
const DAY = 86400000;
/** How long before a trial converts the reminder arrives. */
export const TRIAL_REMINDER_DAYS_BEFORE = 2;

export type OnboardingStep = "welcome" | "scroll" | "swipe" | "space" | "access" | "reveal" | "planning" | "trial" | "ready";
export const STORY_STEPS: OnboardingStep[] = ["scroll", "swipe", "space"];

export interface YearTotal { year: number; photos: number }
/** Photos per calendar year, oldest first. Undated photos and videos are left out. */
export function yearTotals(months: readonly Month[]): YearTotal[] {
  const totals = new Map<number, number>();
  for (const m of months) {
    const year = Number(m.key.slice(0, 4));
    if (!Number.isInteger(year) || m.key === "unknown") continue;
    const photos = m.photos ?? m.count;
    if (photos > 0) totals.set(year, (totals.get(year) ?? 0) + photos);
  }
  return [...totals].sort((a, b) => a[0] - b[0]).map(([year, photos]) => ({ year, photos }));
}
/** The reveal shows each year in turn: roughly four seconds overall, never frantic. */
export function revealInterval(years: number) {
  return Math.max(380, Math.min(900, Math.round(4200 / Math.max(1, years))));
}

/** The offer onboarding leads with: the one with a free trial (weekly first, like the
 * leaders), otherwise the yearly plan. */
export function leadOffer(offers: readonly Offer[]) {
  const order: Offer["kind"][] = ["weekly", "annual", "monthly"];
  const sorted = [...offers].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  return sorted.find(o => o.trialDays) ?? offers.find(o => o.kind === "annual") ?? sorted[0];
}
/** Today → reminder → first charge, as calendar dates from now. */
export function trialTimeline(trialDays: number, now: number) {
  const reminderDay = Math.max(1, trialDays - TRIAL_REMINDER_DAYS_BEFORE);
  return { reminderDay, reminderAt: now + reminderDay * DAY, chargeAt: now + trialDays * DAY };
}
export function periodLabel(kind: Offer["kind"]) {
  return kind === "weekly" ? "week" : kind === "monthly" ? "month" : kind === "annual" ? "year" : "";
}
