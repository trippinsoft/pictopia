// Review progress accuracy under fast scrolling. Drives the real feed controller against the
// real review store on SQLite (native harness), with deliberately delayed, reordered and failing
// saves, and checks the persisted review records, not merely the displayed percentage.
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeLoader } = require("./loader.cjs");
const { DatabaseSync, media, platform, boot } = require("./native-harness.cjs");
const X = makeLoader()("lib/pictopia/explore.ts");
const { ExploreFeedController } = makeLoader()("lib/pictopia/explore-feed-controller.ts");

const END = "explore-completion";
const defer = () => {
  let resolve;
  const promise = new Promise((yes) => { resolve = yes; });
  return { promise, resolve };
};
const tick = () => new Promise((resolve) => setImmediate(resolve));

async function store(ids, key = "adventure:progress:explore", existing) {
  const db = existing?.db ?? new DatabaseSync(":memory:");
  const p = existing?.p ?? platform({ library: ids });
  const app = existing?.app ?? (await boot(db, p));
  for (const id of ids) p.library.add(id), p.selected.add(id);
  await app.storage.put(ids.map((id) => media(id)));
  await app.storage.setValue(key, { ...X.createExplore(ids, 1), review: true });
  const open = () => makeLoader({ ...p.mocks, "./repository": app, "./media": { mediaService: app.mediaService } })("services/explore.ts").exploreStoreFor(key);
  return { db, p, app, open, key };
}

/** Mirrors AdventureReview + ExploreFeed: every slot stays rendered, the last page is the end
 * card, saves are serialized by the store, and reaching the end card runs the screen's
 * `finish` (a boundary finish carrying the traversal the controller still holds). */
async function review(count = 20, opts = {}) {
  const ids = Array.from({ length: count }, (_, i) => `p${i}`);
  const s = opts.store ?? (await store(ids));
  const backing = s.open();
  let session = await backing.load();
  let gate, fail = false, finishFail = false;
  const errors = [], ends = [];
  let departing = new Set(), hidden = new Set(), rendered;
  const build = () => [...X.exploreFeed(session).filter((id) => departing.has(id) || !hidden.has(id)), END];
  rendered = build();
  let controller;
  const save = async (action) => {
    if (gate) await gate.promise;
    const next = await backing.change((current) => {
      const built = typeof action === "function" ? action(current) : action;
      if (fail || (finishFail && built.type === "finish")) throw Error("Disk full");
      return built;
    });
    session = next;
    const fresh = build();
    if (fresh.join() !== rendered.join()) { rendered = fresh; controller.relayout(); }
    return next;
  };
  let finishing;
  const finish = () => {
    const endpoint = X.exploreFeed(session).at(-1);
    finishing = save((saved) => controller.activeId !== null
      ? { type: "page", id: saved.activeId, revision: saved.revision, toId: saved.activeId, availableIds: [], passed: controller.traversal() }
      : { type: "finish", boundary: { startedAt: saved.startedAt, endpoint }, passed: controller.traversal() })
      .then(() => ends.push("finished"), () => errors.push("finish failed"));
    return finishing;
  };
  controller = new ExploreFeedController({
    read: () => session,
    pages: () => rendered,
    completionPage: true,
    save,
    scrollTo: () => {},
    onPage: () => {},
    onEnd: () => { void finish(); },
    limited: () => false,
    creditable: opts.creditable,
    onBusy: () => {},
    onError: (m) => errors.push(m),
    onFeed: (d, h) => { departing = new Set(d); hidden = new Set(h); const fresh = build(); if (fresh.join() !== rendered.join()) { rendered = fresh; controller.relayout(); } },
    prepare: () => Promise.resolve(),
  }, session.activeId);
  const page = (id) => rendered.indexOf(id);
  return {
    s, ids, controller, errors, ends, backing,
    get session() { return session; },
    /** The scroll came to rest (momentum end / quiet scroll) on this photo or the end card. */
    settle: (id) => controller.settle(id === END ? rendered.length - 1 : page(id), session.ids),
    /** ✕, Back or backgrounding: the feed flushes the page under the finger. */
    flush: (id) => controller.flushPosition(page(id), session.ids),
    flushEnd: () => controller.flushTraversal(),
    idle: async () => { for (let i = 0; i < 30; i++) await tick(); if (finishing && !gate) await finishing; for (let i = 0; i < 10; i++) await tick(); },
    hold: () => (gate = defer()),
    release: () => { const g = gate; gate = undefined; g?.resolve(); },
    fail: (value = true) => { fail = value; },
    failFinish: (value = true) => { finishFail = value; },
    retryFinish: finish,
    /** What a fresh visit reads back from storage. */
    persisted: () => s.open().load(),
  };
}
const counts = (session) => X.exploreCounts({ ...session, ids: X.exploreFeed(session) });
const credited = (session) => session.ids.filter((id) => session.records[id]?.encountered);

test("slowly scrolling through 20 photos persists 20/20 and finishes", async () => {
  const r = await review();
  for (let i = 1; i < 20; i++) { r.settle(`p${i}`); await r.idle(); }
  r.settle(END); await r.idle();
  const saved = await r.persisted();
  assert.equal(saved.finished, true);
  assert.equal(counts(saved).explored, 20);
});

test("rapidly scrolling straight to the end card credits all 20 (no intermediate settles)", async () => {
  const r = await review();
  // A run of flicks: each new drag cancels the previous quiet timer, so the only settle is
  // the end card. Every page between was physically scrolled through.
  r.settle(END); await r.idle();
  const saved = await r.persisted();
  assert.equal(saved.finished, true);
  assert.deepEqual(credited(saved), r.ids, "every traversed photo has a saved record");
});

test("rapid scrolling while persistence is delayed still persists 20/20", async () => {
  const r = await review();
  r.hold();
  r.settle("p4"); r.settle("p11"); r.settle("p19"); r.settle(END);
  await r.idle();
  assert.equal((await r.persisted()).finished, undefined, "nothing finishes while saves are held");
  r.release();
  await r.idle();
  const saved = await r.persisted();
  assert.equal(saved.finished, true);
  assert.equal(counts(saved).explored, 20);
});

test("completing immediately after reaching the final photo credits it", async () => {
  const r = await review();
  r.settle("p19");
  r.settle(END); // before p19's page save has even run
  await r.idle();
  const saved = await r.persisted();
  assert.equal(saved.records.p19?.encountered, true);
  assert.equal(counts(saved).explored, 20);
});

test("scrolling from photo 1 to photo 10 credits the nine passed; the shown one waits", async () => {
  const r = await review();
  r.settle("p9"); await r.idle();
  const saved = await r.persisted();
  assert.deepEqual(credited(saved), r.ids.slice(0, 9));
  assert.equal(saved.activeId, "p9");
});

test("scrolling backward through reviewed photos adds no credit and no duplicate activity", async () => {
  const r = await review();
  r.settle("p10"); await r.idle();
  const activity = async () => Object.values((await r.s.app.storage.getValue("dailyActivity:v1"))?.days ?? {})[0]?.photos;
  const before = await activity();
  r.settle("p3"); await r.idle();
  r.settle("p10"); await r.idle();
  const saved = await r.persisted();
  assert.equal(counts(saved).explored, 10);
  assert.equal(await activity(), before, "revisits are not counted again");
});

test("one unavailable photo: 19/20 reviewed and the unavailable one reported", async () => {
  const r = await review();
  await r.backing.change({ type: "unavailable", id: "p7" });
  r.settle(END); await r.idle();
  const saved = await r.persisted();
  assert.equal(saved.finished, true);
  assert.equal(counts(saved).explored, 19);
  assert.equal(counts(saved).unavailable, 1);
  assert.equal(saved.records.p7.encountered, false);
});

test("exiting after 12 reviewed photos retains 12/20 and does not finish", async () => {
  const r = await review();
  r.settle("p5");
  r.flush("p12"); // ✕ while still moving: the feed flushes the page under the finger
  await r.idle();
  const saved = await r.persisted();
  assert.equal(counts(saved).explored, 12);
  assert.notEqual(saved.finished, true);
  assert.equal(saved.activeId, "p12", "resumes on the photo that was shown");
});

test("backgrounding during rapid scrolling retains the traversed credit", async () => {
  const r = await review();
  r.hold();
  r.settle("p3");
  r.flush("p8"); // AppState background
  r.release();
  await r.idle();
  assert.deepEqual(credited(await r.persisted()), r.ids.slice(0, 8));
});

test("backgrounding on the end card before Finish saves the traversal without finishing", async () => {
  const r = await review();
  r.settle("p2"); await r.idle();
  r.failFinish();
  r.settle(END);
  await r.flushEnd();
  await r.idle();
  const saved = await r.persisted();
  assert.equal(counts(saved).explored, 20);
  assert.notEqual(saved.finished, true);
});

test("discarding several photos while scrolling: no missing or duplicate credit or queue entries", async () => {
  const r = await review();
  for (const id of ["p2", "p6", "p13"]) {
    r.settle(id);
    assert.equal(r.controller.claim(r.controller.page, r.ids, false), true);
    await r.controller.discard(id, "left", Promise.resolve(), Promise.resolve());
    await r.idle();
  }
  r.settle(END); await r.idle();
  const saved = await r.persisted();
  assert.equal(saved.finished, true);
  assert.equal(counts(saved).explored, 20);
  assert.equal(counts(saved).discarded, 3);
  assert.equal((await r.s.app.storage.stats()).pending, 3);
});

test("Undo and Restore keep review credit", async () => {
  const r = await review();
  r.settle("p4"); await r.idle();
  assert.equal(r.controller.claim(r.controller.page, r.ids, false), true);
  await r.controller.discard("p4", "left", Promise.resolve(), Promise.resolve());
  await r.idle();
  await r.controller.undo(); await r.idle();
  await r.backing.change((c) => ({ type: "discard", id: "p2", revision: c.revision, direction: "right" }));
  await r.backing.change({ type: "restore", id: "p2" });
  const saved = await r.persisted();
  assert.equal(saved.records.p4.encountered, true);
  assert.equal(saved.records.p2.encountered, true);
  assert.equal(counts(saved).explored, 5);
  assert.equal(counts(saved).discarded, 0);
});

test("reopening a completed adventure keeps its credit, and finishing again adds none", async () => {
  const r = await review();
  r.settle(END); await r.idle();
  const reopened = await review(20, { store: r.s });
  await reopened.backing.change({ type: "revisit" });
  const again = await review(20, { store: r.s });
  again.settle(END); await again.idle();
  const saved = await again.persisted();
  assert.equal(saved.finished, true);
  assert.equal(counts(saved).explored, 20);
});

test("a further segment starts from zero and leaves the earlier segment's credit unchanged", async () => {
  const first = await review();
  first.settle(END); await first.idle();
  const nextIds = Array.from({ length: 20 }, (_, i) => `q${i}`);
  const second = await store(nextIds, "adventure:progress2:explore", first.s);
  const s2 = await second.open().load();
  assert.equal(counts(s2).explored, 0);
  await second.open().change((c) => ({ type: "page", id: c.activeId, revision: c.revision, toId: "q5", availableIds: [], passed: ["q0", "q1", "q2", "q3", "q4"] }));
  assert.equal(counts(await second.open().load()).explored, 5);
  assert.equal(counts(await first.persisted()).explored, 20, "earlier segment unchanged");
});

test("a programmatic jump over photos credits none of the skipped ones", async () => {
  const r = await review();
  r.controller.jump("p10", r.ids); await r.idle();
  r.settle("p12"); await r.idle();
  const saved = await r.persisted();
  assert.deepEqual(credited(saved), ["p10", "p11"], "only photos actually scrolled past");
});

test("photos behind the daily-limit page are never credited", async () => {
  const r = await review(20, { creditable: (id) => Number(id.slice(1)) < 15 });
  r.settle("p18"); await r.idle();
  assert.deepEqual(credited(await r.persisted()), r.ids.slice(0, 15));
});

test("stale and reordered updates never erase legitimate credit", () => {
  let s = { ...X.createExplore(["a", "b", "c", "d", "e"], 1), review: true };
  const stale = { type: "page", id: "a", revision: s.revision, toId: "c", availableIds: [], passed: ["a", "b"] };
  s = X.reduceExplore(s, { type: "page", id: "a", revision: s.revision, toId: "d", availableIds: [], passed: ["a", "b", "c"] });
  // The superseded save lands late with an old revision: its cursor is refused, never the credit.
  s = X.reduceExplore(s, stale);
  assert.equal(s.activeId, "d");
  assert.deepEqual(["a", "b", "c"].map((id) => s.records[id].encountered), [true, true, true]);
  // A stale cursor carrying new credit keeps the credit and drops the cursor.
  s = X.reduceExplore(s, { type: "page", id: "b", revision: 0, toId: "e", availableIds: [], passed: ["d"] });
  assert.equal(s.activeId, "d");
  assert.equal(s.records.d.encountered, true);
  // A late failure report can't take credit back; a gone or unknown id gets none.
  s = X.reduceExplore(s, { type: "unavailable", id: "a" });
  assert.equal(s.records.a.encountered, true);
  assert.equal(X.reduceExplore(s, { type: "traverse", ids: ["zzz"] }), s);
});

test("a failed save shows a recoverable error, never a false completion, and a retry finishes", async () => {
  const r = await review();
  r.settle("p6"); await r.idle();
  r.failFinish();
  r.settle(END); await r.idle();
  assert.ok(r.errors.length > 0, "the user is told");
  let saved = await r.persisted();
  assert.notEqual(saved.finished, true, "no invented completion");
  r.failFinish(false);
  await r.retryFinish(); await r.idle();
  saved = await r.persisted();
  assert.equal(saved.finished, true);
  assert.equal(counts(saved).explored, 20);
});

test("a page save that fails keeps the traversal pending and the next save persists it", async () => {
  const r = await review();
  r.fail();
  r.settle("p9");
  await r.idle();
  await new Promise((resolve) => setTimeout(resolve, 300)); // the controller's one retry
  await r.idle();
  assert.equal(counts(await r.persisted()).explored, 0);
  r.fail(false);
  r.settle("p10"); await r.idle();
  assert.equal(counts(await r.persisted()).explored, 10);
});

test("legacy page actions without a traversal keep their range behaviour", () => {
  let s = { ...X.createExplore(["a", "b", "c"], 1), review: true };
  s = X.reduceExplore(s, { type: "page", id: "a", revision: s.revision, toId: "c", availableIds: [] });
  assert.deepEqual(credited(s), ["a", "b"]);
});
