const test = require("node:test");
const assert = require("node:assert/strict");
const { makeLoader } = require("./loader.cjs");
const load = makeLoader();
const X = load("lib/pictopia/explore.ts");
const { ExploreFeedController } = load("lib/pictopia/explore-feed-controller.ts");
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }

test("a review discard scrolls the pager on to the next photo once it is drawn, and never waits for persistence", async () => {
  const ids = ["a", "b", "c"];
  let session = { ...X.createExplore(ids), review: true };
  const pages = [...ids, "end"];
  const entrances = [], writes = [], scrolls = [], waits = [];
  let drawn = deferred();
  const controller = new ExploreFeedController({
    read: () => session, pages: () => pages, completionPage: true,
    save(action) {
      session = X.reduceExplore(session, typeof action === "function" ? action(session) : action);
      const snapshot = session, gate = deferred(); writes.push(() => gate.resolve(snapshot)); return gate.promise;
    },
    prepare(entry) { entrances.push(entry); return Promise.resolve(); },
    ready(id) { waits.push(id); return drawn.promise; },
    scrollTo(page, animated) { scrolls.push({ page, animated }); },
    onPage() {}, onBusy() {}, onFeed() {}, onError(message) { assert.fail(message); },
  }, "a");
  const handoff = deferred();
  const first = controller.discard("a", "left", handoff.promise);
  assert.equal(session.records.a.queued, true, "mark is immediate while animation owns the photo");
  assert.equal(controller.canDiscard("a"), false, "duplicate gestures are locked");
  assert.deepEqual(waits, [], "the departing photo hands off before the pager moves");
  handoff.resolve(); await tick();
  assert.deepEqual(waits, ["b"]);
  assert.deepEqual(scrolls, [], "the pager waits for the next photo to be drawn");
  assert.equal(controller.activeId, "a");
  drawn.resolve(); await tick();
  assert.deepEqual(scrolls, [{ page: 1, animated: true }], "it scrolls in, animated");
  assert.equal(controller.activeId, "b");
  assert.equal(controller.canDiscard("b"), true, "next gesture is independent of outstanding persistence");
  drawn = deferred();
  const second = controller.discard("b", "right", Promise.resolve());
  await tick();
  drawn.resolve(); await tick();
  assert.deepEqual(scrolls.at(-1), { page: 2, animated: true });
  assert.equal(controller.activeId, "c");
  assert.deepEqual(entrances, [], "no card is slid in or re-anchored");
  assert.deepEqual(session.ids, ids, "canonical snapshot order and denominator remain intact");
  assert.deepEqual(X.exploreFeed(session), ids, "a review keeps every slot; marked photos stay faded in place");
  writes.forEach(resolve => resolve()); await Promise.all([first, second]);
  assert.equal(session.records.a.queued, true);
  assert.equal(controller.canDiscard("a"), false, "marks remain accessible through Undo/trash, not another discard");
});
