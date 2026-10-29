import type { ExploreAction, ExploreSession } from "./explore";

type ActionBuilder = (current: ExploreSession) => ExploreAction;
interface FeedDependencies {
  read(): ExploreSession;
  save(action: ExploreAction | ActionBuilder): Promise<ExploreSession>;
  /** Moves the pager. Must not wait for, or depend on, scroll events. */
  scrollTo(page: number, animated: boolean): void;
  onPage(page: number): void;
  onBusy(busy: boolean): void;
  onError(message: string): void;
}
/** Vertical paging works like a social feed: the user's scroll owns which page is shown
 * and is never locked or pulled back by persistence. Each settled page is queued as a save
 * in order, built from the stored session at write time. Only a sideways discard holds input,
 * and only until its photo has flown out and the pager has moved to the next page.
 */
export class ExploreFeedController {
  page: number;
  discarding = false;
  constructor(
    private readonly deps: FeedDependencies,
    page: number,
  ) {
    this.page = page;
  }
  /** The scroll came to rest on `page` (native momentum end, browser scroll quiet). */
  settle(page: number, availableIds: string[]) {
    if (this.discarding || page === this.page) return;
    this.show(page, false);
    void this.persist(page, availableIds);
  }
  next(availableIds: string[]) {
    if (this.discarding) return;
    const target = Math.min(this.page + 1, this.deps.read().ids.length);
    if (target === this.page) return;
    this.show(target, true);
    void this.persist(target, availableIds);
  }
  /** A sideways gesture may start only on the page that is shown and at rest. */
  canDiscard(id: string) {
    return !this.discarding && this.deps.read().ids[this.page] === id;
  }
  async discard(id: string, direction: "left" | "right", animation: Promise<void>) {
    if (!this.canDiscard(id)) throw Error("This photo is no longer ready for discard.");
    const page = this.page;
    this.setDiscarding(true);
    // Saved in queue order behind this page's own page save, so the stored position is
    // this photo. The reducer rejects the advance if it isn't, and we resync below.
    const saved = this.deps
      .save((s) => ({ type: "advance", id, revision: s.revision, direction, available: true }))
      .catch(() => undefined);
    try {
      await animation;
      this.show(page + 1, true);
    } finally {
      this.setDiscarding(false);
    }
    const result = await saved;
    if (!result?.records[id]?.discarded) {
      // Back on the saved page; the rejection lets the card spring home.
      this.resync();
      throw Error("The discard wasn’t saved.");
    }
  }
  /** Undo, Previous and similar buttons: save, then show wherever the session now is. */
  async action(action: ExploreAction) {
    try {
      const saved = await this.deps.save(action);
      this.show(saved.position, true);
    } catch {
      this.resync();
    }
  }
  private async persist(target: number, availableIds: string[]) {
    try {
      await this.deps.save((s) => ({
        type: "page",
        id: s.ids[s.position],
        revision: s.revision,
        position: target,
        availableIds,
      }));
    } catch {
      this.resync();
    }
  }
  private resync() {
    this.deps.onError("Couldn’t save your place. You’re back on your last saved photo.");
    this.show(this.deps.read().position, false);
  }
  private show(page: number, animated: boolean) {
    this.page = page;
    this.deps.onPage(page);
    this.deps.scrollTo(page, animated);
  }
  private setDiscarding(discarding: boolean) {
    this.discarding = discarding;
    this.deps.onBusy(discarding);
  }
}
