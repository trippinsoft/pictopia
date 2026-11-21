/** Onboarding facts, pure so they're testable: the library reveal's per-year totals and the
 * free-trial timeline. Nothing here invents numbers — every figure comes from the library or
 * from what the store reports. */
import type { Month, Offer } from "./types";

export const TAGLINE = "The faster, more fun way to clean up your photo library";
/** The opening screen: the problem first, then the way out. */
export const PROBLEM_COPY = {
  kicker: "Thousands of photos. So many memories.",
  headline: "Where do you even start?",
  body: "Cleaning up your photo library shouldn’t feel like a chore.",
  action: "Get started",
} as const;
/** The Pictopia+ showcase's four scenes, in the order they play. */
export const PLUS_SCENES = [
  { key: "screenshots", label: "Screenshots", icon: "Smartphone" },
  { key: "duplicates", label: "Duplicates", icon: "Copy" },
  { key: "videos", label: "Big videos", icon: "Film" },
  { key: "unlimited", label: "Unlimited", icon: "Infinity" },
] as const;
export type PlusScene = (typeof PLUS_SCENES)[number]["key"];
export const PLUS_SCENE_MS = 3000;
const DAY = 86400000;
/** Three-day trials show a reminder on day two. Longer trials give two days' notice. */
export const trialReminderDaysBefore = (trialDays: number) => (trialDays <= 3 ? 1 : 2);

export type OnboardingStep = "welcome" | "scroll" | "swipe" | "space" | "access" | "reveal" | "trial" | "ready";
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
/** Today → reminder → first charge, as days and times from now. */
export function trialTimeline(trialDays: number, now: number) {
  const reminderDay = Math.max(1, trialDays - trialReminderDaysBefore(trialDays));
  return { reminderDay, reminderBefore: trialDays - reminderDay, reminderAt: now + reminderDay * DAY, chargeAt: now + trialDays * DAY };
}
/** Use the signed end date. Sandbox trials may run on an accelerated clock. */
export function trialReminderAt(trialDays: number, purchasedAt: number, expiresAt: number, sandbox: boolean, now: number): number | undefined {
  const duration = expiresAt - purchasedAt;
  if (trialDays <= 0 || !Number.isFinite(duration) || duration <= 0) return;
  const { reminderBefore } = trialTimeline(trialDays, 0);
  const day = sandbox ? Math.min(DAY, duration / trialDays) : DAY;
  const at = Math.round(expiresAt - reminderBefore * day);
  return at > Math.max(now, purchasedAt) && at < expiresAt ? at : undefined;
}
export function periodLabel(kind: Offer["kind"]) {
  return kind === "weekly" ? "week" : kind === "monthly" ? "month" : kind === "annual" ? "year" : "";
}
