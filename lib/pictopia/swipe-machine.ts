import { Decision } from "./types";
/**
 * Deterministic interaction model for the swipe deck. All inputs are events tagged with the
 * photo id they belong to, so late events for an earlier photo can never unlock or block the
 * current one. Readiness is remembered per id and is never discarded by unrelated refreshes.
 *
 * Phases: browsing (top card waiting for media) → ready → committing (fly-out animation and
 * save run in parallel) → next card. A failed save returns to ready on the same photo.
 */
export interface DeckState {
  /** The photo on top of the deck. Follows the session except while a commit is in flight. */
  top?: string;
  /** Photo ids whose media has settled: displayed, failed with a visible placeholder, or timed out. */
  settled: string[];
  committing?: {
    id: string;
    decision: Decision;
    animated: boolean;
    saved: boolean;
    /** The session's current photo after the save, once known. */
    next?: string;
  };
}
export type DeckEvent =
  | { type: "sync"; current?: string }
  | { type: "settled"; id: string }
  | { type: "commit"; id: string; decision: Decision }
  | { type: "animated"; id: string }
  | { type: "saved"; id: string; current?: string }
  | { type: "failed"; id: string };
export const initialDeck: DeckState = { settled: [] };
const MAX_SETTLED = 12;
export function canCommit(s: DeckState, id: string | undefined) {
  return !!id && !s.committing && s.top === id && s.settled.includes(id);
}
/** True while a usable photo is in front of the user, including the brief save between photos. */
export function isReviewing(s: DeckState) {
  return !!s.committing || (!!s.top && s.settled.includes(s.top));
}
function finish(s: DeckState): DeckState {
  const c = s.committing;
  if (!c?.animated || !c.saved) return s;
  return { ...s, top: c.next, committing: undefined };
}
export function deckReducer(s: DeckState, e: DeckEvent): DeckState {
  switch (e.type) {
    case "sync":
      // While a commit is in flight the save result decides what comes next.
      if (s.committing || s.top === e.current) return s;
      return { ...s, top: e.current };
    case "settled":
      if (s.settled.includes(e.id)) return s;
      return { ...s, settled: [...s.settled, e.id].slice(-MAX_SETTLED) };
    case "commit":
      if (!canCommit(s, e.id)) return s;
      return {
        ...s,
        committing: { id: e.id, decision: e.decision, animated: false, saved: false },
      };
    case "animated":
      if (s.committing?.id !== e.id || s.committing.animated) return s;
      return finish({ ...s, committing: { ...s.committing, animated: true } });
    case "saved":
      if (s.committing?.id !== e.id || s.committing.saved) return s;
      return finish({ ...s, committing: { ...s.committing, saved: true, next: e.current } });
    case "failed":
      // Once this photo's decision is recorded, a later rejection (a retry losing the race to
      // the original save) must not roll the card back.
      if (s.committing?.id !== e.id || s.committing.saved) return s;
      return { ...s, top: e.id, committing: undefined };
  }
}
