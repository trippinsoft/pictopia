import { reduceExplore, type ExploreAction, type ExploreSession } from "./explore";
export type ReviewIntent = ExploreAction | ((current: ExploreSession) => ExploreAction);
/** A durable snapshot plus ordered, not-yet-acknowledged user intents. Every review
 * surface reads this projection; storage acknowledgements cannot hide a later mark. */
export class ReviewState {
  private saved?: ExploreSession;
  private intents: { token: number; intent: ReviewIntent }[] = [];
  private serial = 0;
  private acknowledged = 0;
  value?: ExploreSession;
  load(saved: ExploreSession) {
    if (this.intents.length) return;
    this.saved = saved; this.value = saved;
  }
  enqueue(intent: ReviewIntent) {
    const token = ++this.serial;
    this.intents.push({ token, intent }); this.project();
    return token;
  }
  settle(token: number, saved?: ExploreSession) {
    // The repository serializes writes; a delayed caller must not publish an older ack.
    if (saved && token >= this.acknowledged) { this.saved = saved; this.acknowledged = token; }
    this.intents = this.intents.filter(entry => saved && token >= this.acknowledged ? entry.token > token : entry.token !== token);
    this.project();
  }
  private project() {
    let next = this.saved;
    for (const entry of this.intents) {
      if (!next?.review) continue;
      const action = typeof entry.intent === "function" ? entry.intent(next) : entry.intent;
      // Completion publishes only after its transaction, so scope totals are final.
      if (action.type === "finish") continue;
      next = reduceExplore(next, action.type === "page" ? { ...action, id: next.activeId, revision: next.revision }
        : action.type === "discard" ? { ...action, revision: next.revision } : action);
    }
    this.value = next;
  }
}
