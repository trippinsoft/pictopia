export const REVIEW_STEPS = ["browse", "discard", "trash", "restore", "actions"] as const;
export type ReviewStep = typeof REVIEW_STEPS[number];
export type ReviewGuidance = Partial<Record<ReviewStep, boolean>>;
export function nextReviewStep(done: ReviewGuidance): ReviewStep | undefined { return REVIEW_STEPS.find(step => !done[step]); }
export const REVIEW_HINTS: Record<ReviewStep, string> = {
  browse: "Scroll to explore. No decisions required.",
  discard: "Don’t want it? Swipe it away.",
  trash: "It’s in the trash, not deleted. Tap to look.",
  restore: "Changed your mind? Restore it from the trash.",
  actions: "Love it? Favorite it. Want to send it? Share it.",
};
