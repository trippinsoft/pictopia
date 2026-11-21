/** Home's first-visit tour: four stops on the real Home UI. Pure so copy, order and targets are
 * testable. Tab order on screen stays Home → Explore → Timeline → Progress. */
export const HOME_TOUR_STEPS = ["adventures", "explore", "timeline", "progress"] as const;
export type HomeTourStep = (typeof HOME_TOUR_STEPS)[number];

/** Saved as `homeTour:v1`. `pending` is set when first-time onboarding ends (or by Replay app
 * tour); the tour shows on the next Home visit. It's marked done as soon as it appears, so
 * closing the app mid-tour never brings it back uninvited. A missing value means "don't show",
 * so people who onboarded before the tour existed aren't interrupted. */
export interface HomeTourState { pending?: boolean; source?: "onboarding" | "settings"; startedAt?: number; doneAt?: number; outcome?: "completed" | "skipped" }

/** The real elements each stop spotlights (registered through `tour-targets.ts`). */
export const HOME_TOUR_TARGETS: Record<HomeTourStep, readonly string[]> = {
  adventures: ["adventures"],
  explore: ["explore"],
  timeline: ["timeline"],
  progress: ["percent", "progress"],
};

export function homeTourCopy(step: HomeTourStep, adventures = 2): { title: string; body: string } {
  switch (step) {
    case "adventures":
      return adventures >= 2
        ? { title: "Adventures picked for you", body: "We’ve picked adventures from your photo library to help you get started. Just tap whichever looks fun!" }
        : { title: "An adventure picked for you", body: "We’ve picked an adventure from your photo library to help you get started. Just tap it when you’re ready!" };
    case "explore":
      return { title: "Find the clutter faster", body: "Want to clean up something specific? Jump straight to screenshots, large videos, duplicates, and more." };
    case "timeline":
      return { title: "Take a trip through time", body: "Browse your photos by year or month. Rediscover old memories and decide what to keep." };
    case "progress":
      return { title: "Watch your progress grow", body: "See how much of your library you’ve explored right here. Tap Progress to track your achievements and celebrate your journey!" };
  }
}

/** The stops to show: the adventures stop only when Home actually has recommendations. */
export function homeTourSteps(adventures: number): HomeTourStep[] {
  return HOME_TOUR_STEPS.filter(step => step !== "adventures" || adventures > 0);
}

export type TourBox = { x: number; y: number; width: number; height: number };
/** Where the explanation card goes so it never covers a spotlight: just below the lowest
 * spotlight in the upper part of the screen when the card fits there, otherwise just above the
 * highest spotlight. `top`/`bottom` are distances from the window's top/bottom edges. */
export function placeCard(holes: readonly TourBox[], card: { height: number }, screen: { height: number; top: number; bottom: number }, gap = 14): { top: number } | { bottom: number } {
  const upper = holes.filter(h => h.y + h.height / 2 < screen.height / 2);
  const lower = holes.filter(h => h.y + h.height / 2 >= screen.height / 2);
  const ceiling = Math.min(screen.height - screen.bottom, ...lower.map(h => h.y)) - gap;
  if (upper.length) {
    const top = Math.max(...upper.map(h => h.y + h.height)) + gap;
    if (top + card.height <= ceiling) return { top };
  }
  const anchor = Math.min(...holes.map(h => h.y));
  const bottom = screen.height - anchor + gap;
  return { bottom: Math.min(bottom, screen.height - screen.top - gap - card.height) };
}
