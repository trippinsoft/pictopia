/** Onboarding funnel analytics: fixed event names and a strict property allowlist, pure so it
 * is testable. Nothing here may carry photos, media IDs, dates or exact library counts; library
 * size leaves the device only as a coarse range. */

/** Bumped when the onboarding flow changes meaningfully, so funnels compare like with like. */
export const ONBOARDING_VERSION = "2026-11-trial-checkout";

export const ONBOARDING_STEPS = ["problem", "scroll", "swipe", "space", "access", "reveal", "plus_showcase", "trial_timeline", "trial_plans", "ready"] as const;
export type OnboardingStepName = (typeof ONBOARDING_STEPS)[number];

export type OnboardingEvent =
  | "onboarding_started"
  | "onboarding_step_viewed"
  | "onboarding_step_completed"
  | "onboarding_access_result"
  | "onboarding_planning_result"
  | "onboarding_showcase_progress"
  | "onboarding_offer_closed"
  | "onboarding_backgrounded"
  | "onboarding_completed"
  | "home_tour_started"
  | "home_tour_step_viewed"
  | "home_tour_step_completed"
  | "home_tour_skipped"
  | "home_tour_completed"
  | "home_tour_replayed";

const strings: Record<string, readonly string[]> = {
  step: ONBOARDING_STEPS,
  access: ["full", "limited", "denied", "empty", "error"],
  library_size: ["0", "1-99", "100-999", "1k-4.9k", "5k-19.9k", "20k-49.9k", "50k+"],
  scene: ["screenshots", "duplicates", "videos", "unlimited"],
  outcome: ["explore_home"],
  tour_step: ["adventures", "explore", "timeline", "progress"],
  source: ["onboarding", "settings"],
  closed_from: ["trial_timeline", "trial_plans", "plan_picker", "no_offers", "loading"],
  onboarding_version: [ONBOARDING_VERSION],
};
const booleans = ["replay", "resumed", "notifications", "picked", "pro", "purchased_in_onboarding", "trial_offered"];
const numbers = ["index", "seconds", "scenes_seen", "recommendations", "steps"];

export function sanitizeOnboardingProperties(input: Record<string, unknown>): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string" && strings[key]?.includes(value)) result[key] = value;
    else if (typeof value === "boolean" && booleans.includes(key)) result[key] = value;
    else if (typeof value === "number" && Number.isFinite(value) && value >= 0 && numbers.includes(key)) result[key] = Math.round(value);
  }
  return result;
}

/** Coarse library size for the access result, never the exact count. */
export function librarySizeBucket(total: number): string {
  if (!(total > 0)) return "0";
  if (total < 100) return "1-99";
  if (total < 1000) return "100-999";
  if (total < 5000) return "1k-4.9k";
  if (total < 20000) return "5k-19.9k";
  if (total < 50000) return "20k-49.9k";
  return "50k+";
}

/** Whole seconds spent on a step, capped at ten minutes so a phone left on a screen doesn't skew
 * averages. */
export function stepSeconds(since: number, now: number): number {
  return Math.min(600, Math.max(0, Math.round((now - since) / 1000)));
}
