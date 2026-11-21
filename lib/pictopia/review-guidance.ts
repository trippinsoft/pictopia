/** The reviewer's coach: scroll to explore, swipe sideways to discard, then the heart. Every
 * tip always shows (no Skip). The heart tip exists only where the heart control does (the
 * native app), and it spotlights that real control. Anyone who already finished the first two
 * tips sees only the heart tip, once. Saved steps from the earlier five-step hints are ignored. */
export const REVIEW_STEPS = ["browse", "discard", "favorite"] as const;
export type ReviewStep = typeof REVIEW_STEPS[number];
export type ReviewGuidance = Partial<Record<ReviewStep, boolean>>;

/** The tips this platform shows: the heart tip only where the heart control exists. */
export function reviewSteps(favorites: boolean): readonly ReviewStep[] {
  return favorites ? REVIEW_STEPS : REVIEW_STEPS.filter(step => step !== "favorite");
}
export function nextReviewStep(done: ReviewGuidance, steps: readonly ReviewStep[] = REVIEW_STEPS): ReviewStep | undefined {
  return steps.find(step => !done[step]);
}

// Each sentence on its own line; the non-breaking space keeps "keep it." together so no word
// is left alone on a line.
export const REVIEW_HINTS: Record<ReviewStep, { title: string; body: string }> = {
  browse: { title: "Scroll up to explore", body: "Scroll past what you want to keep.\nSwipe away what you don’t." },
  discard: { title: "Swipe sideways to discard", body: "It waits in the trash.\nUndo brings it straight back." },
  favorite: { title: "Heart your favorites", body: "You don’t need to heart a photo to keep it.\nHeart the ones you especially love." },
};

/** The real control a tip spotlights (registered through `tour-targets.ts`). */
export const REVIEW_SPOTLIGHT: Partial<Record<ReviewStep, string>> = { favorite: "favorite" };
