import { localDate } from "./daily";

/** Approved guide notes; edit this local collection to add or revise messages. */
export const HOME_TIPS = [
  // Motivation
  "A few minutes today. A little less clutter tomorrow. Every adventure counts!",
  "Don't worry about the whole library. Just pick an adventure and see where it takes you.",
  "One adventure down? There's always another waiting!",
  "You don't need an hour. Even five minutes can make a difference.",
  "The hardest part is getting started. Good thing your next adventure is just a tap away!",
  // Practical guidance
  "No need to decide on every photo. Scroll past the keepers and swipe away the clutter!",
  "Not sure about a photo? Keep scrolling. You can always come back to it.",
  "Marked photos aren't deleted until you review and confirm them.",
  "You don't have to finish an adventure in one sitting. Pick up where you left off anytime.",
  // Discovery
  "Try a different adventure today. You never know what you'll find!",
  "Screenshots have a way of piling up. Maybe it's time for a little sweep?",
  // Playful encouragement
  "Those blurry shots and accidental photos? They don't have to come along for the journey.",
  "Your photo library called. It says there's an adventure waiting.",
  "A little scrolling, a little swiping, and suddenly you've made progress!",
] as const;

export interface HomeTipState { version: 1; day: string; index: number }
/** Advance once on a later local day, even after several days away. Clock rollback
 * never cycles through extra tips. This state is independent of allowance/activity. */
export function nextHomeTip(saved: HomeTipState | undefined, now: number): HomeTipState {
  const day = localDate(now);
  const valid = saved?.version === 1 && /^\d{4}-\d{2}-\d{2}$/.test(saved.day) &&
    Number.isInteger(saved.index) && saved.index >= 0 && saved.index < HOME_TIPS.length;
  if (!valid) return { version: 1, day, index: 0 };
  return day <= saved.day ? saved : { version: 1, day, index: (saved.index + 1) % HOME_TIPS.length };
}
