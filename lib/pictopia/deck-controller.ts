import { Decision } from "./types";
import { DeckEvent, DeckState, canCommit, deckReducer, initialDeck } from "./swipe-machine";
/** A photo that hasn't reported in by then is treated as settled so controls never stay locked. */
export const SETTLE_TIMEOUT_MS = 6000;
/** Upper bound for the fly-out; covers animations interrupted by unmounting or backgrounding. */
export const ANIMATION_TIMEOUT_MS = 700;
/**
 * A save that hasn't answered by then returns the photo to ready. If it lands later, the
 * provider's session update moves the deck on; a retry on the old photo is rejected by the
 * repository's current-item check, so nothing is recorded twice.
 */
export const SAVE_TIMEOUT_MS = 8000;
type Cancel = () => void;
export interface DeckControllerOptions {
  /** Persists a decision bound to `id`; resolves with the session's next current photo. */
  decide: (decision: Decision, id: string) => Promise<string | undefined>;
  onChange: (state: DeckState) => void;
  onError: (message: string) => void;
  setTimer?: (fn: () => void, ms: number) => Cancel;
  settleTimeout?: number;
  animationTimeout?: number;
  saveTimeout?: number;
}
/**
 * Side-effect owner for the swipe deck. Every transition goes through `deckReducer` synchronously,
 * so two presses in the same frame cannot both commit, and every wait is bounded by a timer.
 */
export class DeckController {
  state: DeckState = initialDeck;
  private readonly setTimer: (fn: () => void, ms: number) => Cancel;
  private watch?: { id: string; cancel: Cancel };
  constructor(private readonly opts: DeckControllerOptions) {
    this.setTimer =
      opts.setTimer ??
      ((fn, ms) => {
        const t = setTimeout(fn, ms);
        return () => clearTimeout(t);
      });
  }
  dispatch(event: DeckEvent) {
    const next = deckReducer(this.state, event);
    if (next === this.state) return;
    this.state = next;
    this.opts.onChange(next);
  }
  sync(current: string | undefined) {
    this.dispatch({ type: "sync", current });
  }
  /** Call whenever the top photo or its availability changes. */
  watchTop(id: string | undefined, unavailable: boolean) {
    if (this.watch && this.watch.id !== id) {
      this.watch.cancel();
      this.watch = undefined;
    }
    if (!id || this.state.settled.includes(id)) return;
    if (unavailable) {
      this.watch?.cancel();
      this.watch = undefined;
      this.dispatch({ type: "settled", id });
      return;
    }
    if (this.watch) return;
    const cancel = this.setTimer(() => {
      this.watch = undefined;
      this.dispatch({ type: "settled", id });
    }, this.opts.settleTimeout ?? SETTLE_TIMEOUT_MS);
    this.watch = { id, cancel };
  }
  settled(id: string) {
    if (this.watch?.id === id) {
      this.watch.cancel();
      this.watch = undefined;
    }
    this.dispatch({ type: "settled", id });
  }
  animated(id: string) {
    this.dispatch({ type: "animated", id });
  }
  /** Returns false (and changes nothing) unless the top photo can take a decision right now. */
  commit(decision: Decision, available = true): boolean {
    const id = this.state.top;
    if (!id || !available || !canCommit(this.state, id)) return false;
    this.dispatch({ type: "commit", id, decision });
    this.setTimer(() => this.animated(id), this.opts.animationTimeout ?? ANIMATION_TIMEOUT_MS);
    let answered = false;
    const fail = (message: string) => {
      const c = this.state.committing;
      if (c?.id !== id || c.saved) return;
      this.dispatch({ type: "failed", id });
      this.opts.onError(message);
    };
    const cancelSaveTimer = this.setTimer(() => {
      if (!answered) fail("Saving is taking longer than usual. Try again in a moment.");
    }, this.opts.saveTimeout ?? SAVE_TIMEOUT_MS);
    this.opts.decide(decision, id).then(
      (current) => {
        answered = true;
        cancelSaveTimer();
        this.dispatch({ type: "saved", id, current });
      },
      (e: unknown) => {
        answered = true;
        cancelSaveTimer();
        fail(e instanceof Error ? e.message : "Your decision couldn’t be saved. Try again.");
      },
    );
    return true;
  }
  dispose() {
    this.watch?.cancel();
    this.watch = undefined;
  }
}
