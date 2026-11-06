import { lastExploreDiscard } from "./explore";
import type { DiscardDirection, ExploreAction, ExploreSession } from "./explore";

/** How a photo arrives in the shown slot: from a side (undo) or sliding in vertically. */
export interface FeedEntrance {
  id: string;
  from: DiscardDirection | "below" | "above";
}

type ActionBuilder = (current: ExploreSession) => ExploreAction;
interface FeedDependencies {
  read(): ExploreSession;
  /** Page IDs as last rendered by the pager; the final entry is the completion page. */
  pages(): readonly string[];
  /** Review feed also renders an end page when enabled by its UI. */
  completionPage?: boolean;
  save(action: ExploreAction | ActionBuilder): Promise<ExploreSession>;
  /** Moves the pager. Must not wait for, or depend on, scroll events. */
  scrollTo(page: number, animated: boolean): void;
  onPage(page: number): void;
  /** The user deliberately passed the last photo, or its discard finished landing. */
  onEnd?(): void;
  /** The final page is the daily-limit page, not completion: reaching it never finishes. */
  limited?(): boolean;
  onBusy(busy: boolean): void;
  onError(message: string): void;
  /** `departing` stays rendered even once saved as discarded; `hidden` is removed even
   * before its discard is saved. */
  onFeed(departing: ReadonlySet<string>, hidden: ReadonlySet<string>): void;
  /** Positions the arriving card (still off-screen) and resolves once that is painted. */
  prepare(entry: FeedEntrance): Promise<void>;
}
/** Vertical paging works like a social feed: the user's scroll owns which page is shown
 * and is never locked or pulled back by persistence. Each settled page is queued as a save
 * in order, built from the stored session at write time. Only a sideways discard holds input,
 * and only until its photo has flown out. The discarded card is then removed in place and the
 * next photo slides into its slot, so the pager never scrolls or shifts while a finger could
 * be on it. Discarding the last photo moves straight to the completion page.
 *
 * Identity is the stable photo ID. Pages are indexes into the rendered feed, which shrinks
 * and grows as photos are discarded and restored; `relayout` re-anchors on the active ID.
 */
export class ExploreFeedController {
  page: number;
  /** null is the completion page. */
  activeId: string | null;
  discarding = false;
  undoing = false;
  readonly departing = new Set<string>();
  readonly hidden = new Set<string>();
  private readonly restoredInFlight = new Set<string>();
  constructor(
    private readonly deps: FeedDependencies,
    activeId: string | null,
  ) {
    this.activeId = activeId;
    this.page = Math.max(0, this.indexOf(activeId));
  }
  /** The scroll came to rest on `page` (native momentum end, browser scroll quiet). */
  settle(page: number, availableIds: string[]) {
    const last = this.deps.pages().length - 1;
    if (this.busy || page === this.page || !Number.isInteger(page) || page < 0 || page > last)
      return;
    this.show(page, false);
    if (this.deps.read().review && this.activeId === null) { if (!this.deps.limited?.()) this.deps.onEnd?.(); }
    else void this.persist(availableIds);
  }
  jump(id: string, availableIds: string[]) {
    const page = this.deps.pages().indexOf(id);
    if (this.busy || page < 0) return;
    this.show(page, false);
    void this.persist(availableIds);
  }
  next(availableIds: string[]) {
    if (this.busy) return;
    const target = Math.min(this.page + 1, this.deps.pages().length - 1);
    if (target === this.page) return;
    this.show(target, true);
    if (this.deps.read().review && this.activeId === null) { if (!this.deps.limited?.()) this.deps.onEnd?.(); }
    else void this.persist(availableIds);
  }
  /** A sideways gesture or tap began on `page`, the photo the user can see, possibly before
   * the scroll reported coming to rest: iOS paging keeps creeping for a few hundred ms after it
   * looks still, and a touch that stops it may never get a momentum-end event. Catch up now,
   * snapping the last fraction of a page if needed, so the touch acts on that photo. */
  claim(page: number, availableIds: string[], snap: boolean) {
    const last = this.deps.pages().length - 1;
    if (this.busy || !Number.isInteger(page) || page < 0 || page > last || (this.hasCompletionPage && page === last)) return false;
    if (page !== this.page || this.activeId !== this.idAt(page)) {
      // Stop residual momentum immediately; an animated snap here competes with the
      // horizontal gesture that is already active.
      this.show(page, false);
      void this.persist(availableIds);
    } else if (snap) this.deps.scrollTo(page, false);
    return true;
  }
  /** A sideways gesture may start only on the photo that is shown. */
  canDiscard(id: string) {
    return !this.busy && this.activeId === id && (!this.deps.read().review || !this.deps.read().records[id]?.queued);
  }
  async discard(id: string, direction: DiscardDirection, animation: Promise<void>, landed?: Promise<void>) {
    if (!this.canDiscard(id)) throw Error("This photo is no longer ready for discard.");
    if (this.deps.read().review) return this.discardInReview(id, direction, animation, landed);
    this.setDiscarding(true);
    this.departing.add(id);
    this.publish();
    // Queued behind this page's own page save. The reducer rejects a photo that is
    // already discarded, and we resync below.
    const saved = this.deps
      .save((s) => ({ type: "discard", id, revision: s.revision, direction }))
      .catch(() => undefined);
    try {
      await animation;
      const page = this.survivor(id),
        survivor = this.idAt(page);
      if (survivor !== null) {
        await this.deps.prepare({ id: survivor, from: page > this.page ? "below" : "above" });
        // The last photo left: show the previous slot first (its photo is still out of
        // view), so removing the empty slot below never moves what is on screen.
        if (page < this.page) this.show(page, false);
      }
      this.activeId = survivor;
      this.departing.delete(id);
      this.hidden.add(id);
      this.publish();
    } finally {
      this.departing.delete(id);
      this.setDiscarding(false);
    }
    const result = await saved;
    this.hidden.delete(id);
    this.publish();
    if (!result?.records[id]?.discarded) {
      // It returns to its slot, back in from the side it left by.
      void this.deps.prepare({ id, from: direction });
      this.resync();
      throw Error("The discard wasn’t saved.");
    }
  }
  /** A review hands the photograph itself to the flight that carries it to the trash, so the
   * save and the flight both outlive this call: `animation` resolves the moment the flying
   * photograph has taken over from the card, and the next photograph is swipeable from there.
   * The final forward photograph holds input until it lands and its mark is saved, then
   * requests completion. The mark is still only ever a reversible queue decision. */
  private async discardInReview(id: string, direction: DiscardDirection, animation: Promise<void>, landed?: Promise<void>) {
    // The last photograph still in the sequence (not merely the snapshot's last id): marking
    // it moves on to the end card, or to the daily-limit page when the allowance cut is next.
    const finalPhoto = this.deps.completionPage === true && this.isLastLive(id);
    this.setDiscarding(true);
    this.departing.add(id);
    this.publish();
    // Queued in the store's own order; the reducer rejects a photo already marked.
    const saved = this.deps
      .save((s) => ({ type: "discard", id, revision: s.revision, direction }))
      .catch(() => undefined);
    try {
      await animation;
      if (this.restoredInFlight.delete(id)) {
        this.departing.delete(id);
        this.publish();
        return;
      }
      const pages = this.deps.pages();
      const target = finalPhoto ? null : this.reviewTarget(id);
      if (target !== null) {
        const page = pages.indexOf(target);
        await this.deps.prepare({ id: target, from: page > this.page ? "below" : "above" });
        // The last photograph left: show the earlier slot first, while its photo is still out
        // of view, so removing the empty slot below never moves what is on screen.
        if (page < this.page) this.show(page, false);
      }
      this.activeId = target;
      this.departing.delete(id);
      this.hidden.add(id);
      this.publish();
    } finally {
      this.departing.delete(id);
      if (!finalPhoto) this.setDiscarding(false);
    }
    const result = await saved;
    this.hidden.delete(id);
    this.publish();
    if (!result?.records[id]?.queued) {
      // It comes back in from the side it left by, and the flight is called off.
      if (finalPhoto) this.setDiscarding(false);
      void this.deps.prepare({ id, from: direction });
      this.resync();
      throw Error("The discard wasn’t saved.");
    }
    if (finalPhoto) {
      await landed;
      this.setDiscarding(false);
      if (this.deps.read().records[id]?.queued && this.activeId === null && !this.deps.limited?.()) this.deps.onEnd?.();
    }
  }
  private isLastLive(id: string) {
    const pages = this.deps.pages();
    const from = pages.indexOf(id);
    if (from < 0) return false;
    for (let page = from + 1; page < pages.length - 1; page++)
      if (!this.departing.has(pages[page]) && !this.hidden.has(pages[page])) return false;
    return true;
  }
  /** The photograph a review moves to once `id` is marked: the next one still in the
   * sequence, else the nearest earlier one, else nothing left to show. */
  private reviewTarget(id: string): string | null {
    const pages = this.deps.pages();
    const from = pages.indexOf(id);
    const live = (page: number) => {
      const other = pages[page];
      return (
        (!this.hasCompletionPage || page < pages.length - 1) && other !== undefined && other !== id && !this.departing.has(other) && !this.hidden.has(other)
      );
    };
    for (let page = from + 1; page < pages.length; page++) if (live(page)) return pages[page];
    for (let page = from - 1; page >= 0; page--) if (live(page)) return pages[page];
    return null;
  }
  /** Restores the latest outstanding discard into its original slot and shows it. */
  async undo() {
    if (this.undoing || (this.discarding && !this.deps.read().review) || (!this.discarding && !lastExploreDiscard(this.deps.read()))) return;
    this.undoing = true;
    this.deps.onBusy(true);
    let entry: ExploreSession["history"][number] | undefined;
    try {
      const saved = await this.deps.save((s) => {
        entry = lastExploreDiscard(s);
        return { type: "undo", id: entry?.id };
      });
      if (entry && saved.activeId === entry.id) {
        if (this.departing.has(entry.id)) this.restoredInFlight.add(entry.id);
        void this.deps.prepare({ id: entry.id, from: entry.direction });
        this.focus(entry.id);
        return entry.id;
      }
    } catch {
      this.resync();
    } finally {
      this.undoing = false;
      this.deps.onBusy(this.busy);
    }
  }
  /** Previous and similar buttons: save, then show wherever the session now is. */
  async action(action: ExploreAction) {
    if (this.busy) return;
    this.undoing = true;
    this.deps.onBusy(true);
    try {
      const saved = await this.deps.save(action);
      this.focus(saved.activeId);
    } catch {
      this.resync();
    } finally {
      this.undoing = false;
      this.deps.onBusy(false);
    }
  }
  /** The rendered feed changed (a discard left, a photo was restored). Keep showing the
   * same stable ID, now at its new index. */
  relayout() {
    // Nothing left in the sequence: every photograph is in the trash, waiting to be restored.
    if (!this.deps.pages().length) {
      this.page = 0;
      this.activeId = null;
      this.deps.onPage(0);
      return;
    }
    let page = this.indexOf(this.activeId);
    if (page < 0) page = this.indexOf(this.deps.read().activeId);
    if (page < 0) page = Math.min(this.page, this.deps.pages().length - 1);
    const moved = page !== this.page;
    this.page = page;
    this.activeId = this.idAt(page);
    this.deps.onPage(page);
    if (moved) this.deps.scrollTo(page, false);
  }
  get busy() {
    return this.discarding || this.undoing;
  }
  private indexOf(id: string | null) {
    const pages = this.deps.pages();
    if (id !== null) return pages.indexOf(id);
    return this.hasCompletionPage ? pages.length - 1 : -1;
  }
  private idAt(page: number) {
    const pages = this.deps.pages();
    return this.hasCompletionPage && page >= pages.length - 1 ? null : pages[page];
  }
  private get hasCompletionPage() {
    return !this.deps.read().review || this.deps.completionPage === true;
  }
  /** Next remaining photo, else completion. Mirrors the reducer. */
  private survivor(id: string) {
    const pages = this.deps.pages(),
      end = pages.length - 1,
      from = pages.indexOf(id);
    const live = (page: number) => !this.departing.has(pages[page]);
    for (let page = from + 1; page < end; page++) if (live(page)) return page;
    return end;
  }
  /** Shows `id` now if it is rendered; otherwise `relayout` shows it once it is. */
  private focus(id: string | null) {
    this.activeId = id;
    const page = this.indexOf(id);
    if (page >= 0) this.show(page, false);
  }
  /** Saves the shown photograph as the place. The result is checked, never assumed: a save
   * that throws is retried once, and only if the user is still on that photograph does a
   * final failure fall back to the saved place, so the screen and the store always agree. */
  private async persist(availableIds: string[], attempt = 0): Promise<void> {
    const toId = this.activeId;
    // A review's end card and daily-limit page are never saved places.
    if (toId === null && this.deps.read().review) return;
    let saved: ExploreSession | undefined;
    try {
      saved = await this.deps.save((s) => ({ type: "page", id: s.activeId, revision: s.revision, toId, availableIds }));
    } catch {
      saved = undefined;
    }
    if (saved?.activeId === toId) return;
    // The user has moved on: their newer page save is already queued and supersedes this.
    if (this.activeId !== toId) return;
    if (!saved && attempt === 0) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      if (this.activeId === toId) return this.persist(availableIds, 1);
      return;
    }
    // Saved but refused: the photograph left the sequence meanwhile (marked elsewhere).
    // Either way, show the place that is actually saved.
    this.resync(!saved);
  }
  private resync(failed = true) {
    if (failed) this.deps.onError("Couldn’t save your place. You’re back on your last saved photo.");
    this.focus(this.deps.read().activeId);
  }
  private show(page: number, animated: boolean) {
    this.page = page;
    this.activeId = this.idAt(page);
    this.deps.onPage(page);
    this.deps.scrollTo(page, animated);
  }
  private publish() {
    this.deps.onFeed(new Set(this.departing), new Set(this.hidden));
  }
  private setDiscarding(discarding: boolean) {
    this.discarding = discarding;
    this.deps.onBusy(discarding);
  }
}
