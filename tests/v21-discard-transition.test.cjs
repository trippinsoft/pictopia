const test = require("node:test");
const assert = require("node:assert/strict");
const { makeLoader } = require("./loader.cjs");
const load = makeLoader();
const X = load("lib/pictopia/explore.ts");
const { ExploreFeedController } = load("lib/pictopia/explore-feed-controller.ts");
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }

test("v21 vertical arrival prepares before revealing the next photo in its slot and never waits for persistence", async () => {
  const ids = ["a", "b", "c"];
  let session = { ...X.createExplore(ids), review: true };
  let pages = [...ids, "end"];
  let departing = new Set(), hidden = new Set();
  const entrances = [], writes = [], scrolls = [];
  const render = () => { pages = [...ids.filter(id => departing.has(id) || (!session.records[id]?.queued && !hidden.has(id))), "end"]; };
  let preparation = deferred();
  const controller = new ExploreFeedController({
    read: () => session, pages: () => pages, completionPage: true,
    save(action) {
      session = X.reduceExplore(session, typeof action === "function" ? action(session) : action);
      render();
      const snapshot = session, gate = deferred(); writes.push(() => gate.resolve(snapshot)); return gate.promise;
    },
    prepare(entry) { entrances.push(entry); return preparation.promise; },
    scrollTo(page, animated) { scrolls.push({ page, animated }); },
    onPage() {}, onBusy() {}, onFeed(nextDeparting, nextHidden) { departing = new Set(nextDeparting); hidden = new Set(nextHidden); render(); controller.relayout(); }, onError(message) { assert.fail(message); },
  }, "a");
  const handoff = deferred();
  const first = controller.discard("a", "left", handoff.promise);
  assert.equal(session.records.a.queued, true, "mark is immediate while animation owns the photo");
  assert.equal(controller.canDiscard("a"), false, "duplicate gestures are locked");
  assert.deepEqual(entrances, [], "the departing photo hands off before the next arrival");
  handoff.resolve(); await tick();
  assert.deepEqual(entrances, [{ id: "b", from: "below" }]);
  assert.equal(controller.activeId, "a", "next slot is not revealed before its transform is painted");
  preparation.resolve(); await tick();
  assert.equal(controller.activeId, "b");
  assert.equal(controller.canDiscard("b"), true, "next gesture is independent of outstanding persistence");
  assert.equal(controller.page, 0, "the next photo slides into the departed photo’s slot");
  preparation = deferred();
  const second = controller.discard("b", "right", Promise.resolve());
  await tick();
  assert.deepEqual(entrances[1], { id: "c", from: "below" });
  preparation.resolve(); await tick();
  assert.equal(controller.activeId, "c");
  assert.deepEqual(session.ids, ids, "canonical snapshot order and denominator remain intact");
  assert.deepEqual(X.exploreFeed(session), ids, "a review keeps every slot; marked photos return faded once at rest");
  writes.forEach(resolve => resolve()); await Promise.all([first, second]);
  assert.equal(session.records.a.queued, true);
  assert.equal(controller.canDiscard("a"), false, "marks remain accessible through Undo/trash, not another discard");
});
