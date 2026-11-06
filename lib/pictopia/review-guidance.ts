/** The two-step coach: scroll to explore, then swipe sideways to mark. Saved steps from the
 * earlier five-step hints are ignored; anyone who finished those two isn't coached again. */
export const REVIEW_STEPS = ["browse", "discard"] as const;
export type ReviewStep = typeof REVIEW_STEPS[number];
export type ReviewGuidance = Partial<Record<ReviewStep, boolean>>;
export function nextReviewStep(done: ReviewGuidance): ReviewStep | undefined { return REVIEW_STEPS.find(step => !done[step]); }
export const REVIEW_HINTS: Record<ReviewStep, { title: string; body: string }> = {
  browse: { title: "Scroll up to explore", body: "Looking never decides anything." },
  discard: { title: "Swipe sideways to mark", body: "It waits in the trash. Undo brings it straight back." },
};
