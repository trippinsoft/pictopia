// Regression tests for review-state corruption found on a physical iPhone: marking the final
// photo saved "past the end" as the place, later page saves were silently refused, and the
// next mark was rejected and snapped the screen to the end card ("That's all 18" under
// "16 of 18"). These drive the real feed controller against the real session reducer, and
// the real store on SQLite, so the screen's photo and the saved place are checked together.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { makeLoader } = require("./loader.cjs");
const { DatabaseSync, media, platform, boot } = require("./native-harness.cjs");
const X = makeLoader()("lib/pictopia/explore.ts");
const { ExploreFeedController } = makeLoader()("lib/pictopia/explore-feed-controller.ts");
const END = "explore-completion";
const LIMIT = "explore-limit";
const ids18 = Array.from({ length: 18 }, (_, i) => `p${i + 1}`);
const flush = () => new Promise((resolve) => setImmediate(resolve));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Mirrors ExploreFeed + AdventureReview: the pager renders every slot (a marked photo leaves
 * only while it flies, then returns faded) and an end card (or the daily-limit page when
 * `stopBefore` cuts it). */
function review(ids = ids18, { stopBefore, session } = {}) {
  let s = session ?? { ...X.createExplore(ids, 1), review: true };
  let tail = Promise.resolve(), gate = null, failures = 0, rendered, controller;
  let departing = new Set(), hidden = new Set();
  const errors = [], ended = [];
  const build = () => {
    const live = s.ids.filter(id => departing.has(id) || !hidden.has(id));
    const cut = stopBefore ? live.indexOf(stopBefore) : -1;
    return [...(cut >= 0 ? live.slice(0, cut) : live), cut >= 0 ? LIMIT : END];
  };
  const commit = () => {
    const next = build();
    if (next.join() === rendered.join()) return;
    rendered = next;
    controller.relayout();
  };
  rendered = [...X.exploreFeed(s), END];
  controller = new ExploreFeedController({
    read: () => s,
    pages: () => rendered,
    completionPage: true,
    save: (action) => {
      const run = tail.then(async () => {
        if (gate) await gate;
        if (failures > 0) { failures--; throw Error("disk I/O error"); }
        s = X.reduceExplore(s, typeof action === "function" ? action(s) : action);
        commit();
        return s;
      });
      tail = run.catch(() => {});
      return run;
    },
    scrollTo: () => {},
    onPage: () => {},
    onEnd: () => ended.push(controller.page),
    limited: () => rendered.at(-1) === LIMIT,
    onBusy: () => {},
    onError: (message) => errors.push(message),
    onFeed: (nextDeparting, nextHidden) => { departing = new Set(nextDeparting); hidden = new Set(nextHidden); commit(); },
    prepare: async () => {},
  }, s.activeId);
  commit();
  const h = {
    controller, errors, ended,
    get session() { return s; },
    get rendered() { return rendered; },
    get shown() { return rendered[controller.page]; },
    settled: async () => { await tail; await flush(); await tail; },
    to: async (id) => { controller.settle(rendered.indexOf(id), s.ids); await h.settled(); },
    end: async () => { controller.settle(rendered.length - 1, s.ids); await h.settled(); },
    mark: async (id = h.shown, direction = "left") => {
      await controller.discard(id, direction, Promise.resolve(), Promise.resolve());
      await h.settled();
    },
    undo: async () => { await controller.undo(); await h.settled(); },
    fail: (n = 1) => { failures = n; },
    hold: () => { let release; gate = new Promise((resolve) => { release = resolve; }); return () => { gate = null; release(); }; },
    queued: () => s.ids.filter((id) => s.records[id]?.queued),
  };
  return h;
}
/** The invariant behind the bug: the photo on screen is the saved place, and the saved place
 * is always a photograph still in the sequence (never "past the end" while unfinished). */
function agrees(h, message = "") {
  if (h.controller.activeId !== null) assert.equal(h.session.activeId, h.controller.activeId, `screen and saved place agree ${message}`);
  if (!h.session.finished && h.queued().length < h.session.ids.length) {
    assert.notEqual(h.session.activeId, null, `an unfinished review always saves a photograph ${message}`);
    assert.ok(X.exploreFeed(h.session).includes(h.session.activeId), `the saved place is still in the sequence ${message}`);
  }
  assert.equal(h.shown, h.controller.activeId ?? h.rendered.at(-1));
}

test("the iPhone sequence: mark the last photo, scroll back, mark another — no error, no false end card", async () => {
  const h = review();
  for (const id of ids18.slice(1)) await h.to(id);
  await h.mark("p18");
  assert.equal(h.shown, END, "marking the last photo moves on to the end card");
  agrees(h, "after marking the last photo");
  assert.equal(h.session.activeId, "p18", "the marked last slot stays the resume point; the end card never is");
  await h.to("p16");
  agrees(h, "after scrolling back");
  await h.mark("p16");
  assert.deepEqual(h.errors, [], "no “Couldn’t save your place”");
  assert.equal(h.shown, "p17", "the next photo still in the sequence, not the end card");
  agrees(h, "after marking an earlier photo");
  assert.deepEqual(h.queued(), ["p16", "p18"]);
  assert.equal(h.ended.length, 1, "the end card was reached once, when the last photo was marked");
  assert.notEqual(h.session.finished, true, "and nothing completed: only Finish does");
});

test("repeatedly marking, undoing and re-marking the final photo keeps one mark and a real place", async () => {
  const h = review(ids18.slice(0, 5));
  for (const id of ["p2", "p3", "p4", "p5"]) await h.to(id);
  for (let round = 0; round < 4; round++) {
    await h.mark("p5");
    assert.equal(h.shown, END);
    agrees(h, `round ${round}, marked`);
    await h.undo();
    assert.equal(h.shown, "p5", "Undo brings the photo back and shows it");
    agrees(h, `round ${round}, undone`);
    assert.deepEqual(h.queued(), []);
  }
  await h.mark("p5");
  await assert.rejects(h.controller.discard("p5", "left", Promise.resolve()), "a photo already marked can't be marked again");
  assert.deepEqual(h.queued(), ["p5"], "one mark, never a duplicate");
  assert.equal(X.exploreCounts(h.session).discarded, 1);
  assert.deepEqual(h.errors, []);
});

test("navigating backward and forward after the end keeps the screen and the saved place together", async () => {
  const h = review(ids18.slice(0, 6));
  for (const id of ["p2", "p3", "p4", "p5", "p6"]) await h.to(id);
  await h.end();
  assert.equal(h.shown, END);
  assert.equal(h.session.activeId, "p6", "the end card is never saved as the place");
  for (const id of ["p5", "p3", "p1", "p4", "p6"]) { await h.to(id); agrees(h, `on ${id}`); }
  await h.end();
  await h.to("p2");
  await h.mark();
  assert.equal(h.shown, "p3");
  agrees(h);
  assert.deepEqual(h.errors, []);
});

test("rapid scrolling and marking without waiting for saves converges with no lost or duplicate marks", async () => {
  const h = review();
  const release = h.hold();
  const marks = [];
  for (const step of [2, 3, 4, "mark", 5, "mark", 6, 3, "mark", 9, 12, "mark", 17, "mark"]) {
    if (step === "mark") {
      const id = h.shown;
      if (id === END || h.controller.busy) continue;
      marks.push(id);
      // Flight hand-off is immediate; the save is still held.
      h.controller.discard(id, "right", Promise.resolve(), Promise.resolve()).catch(() => {});
      await flush();
    } else h.controller.settle(Math.min(step, h.rendered.length - 2), h.session.ids);
  }
  release();
  await h.settled(); await wait(10); await h.settled();
  assert.deepEqual(h.errors, []);
  assert.deepEqual(new Set(h.queued()), new Set(marks), "every visible mark saved once");
  assert.equal(h.queued().length, marks.length);
  agrees(h, "after the burst");
});

test("a delayed save never moves the screen; a failed save retries, and only a persistent failure returns to the saved place", async () => {
  const h = review(ids18.slice(0, 6));
  const release = h.hold();
  h.controller.settle(1, h.session.ids);
  h.controller.settle(2, h.session.ids);
  await flush();
  assert.equal(h.shown, "p3", "the scroll owns the screen while saves wait");
  release();
  await h.settled();
  agrees(h);
  h.fail(1);
  await h.to("p4");
  await wait(300); await h.settled();
  assert.deepEqual(h.errors, [], "one failure is retried quietly");
  agrees(h, "after a retried save");
  h.fail(2);
  h.controller.settle(4, h.session.ids);
  await wait(300); await h.settled();
  assert.equal(h.errors.length, 1, "a persistent failure says so once");
  assert.equal(h.shown, h.session.activeId, "and shows the place that is really saved");
  agrees(h, "after a persistent failure");
  await h.mark();
  assert.equal(h.errors.length, 1, "marking still works afterwards");
});

test("resuming a review an earlier build saved past the end opens on a photograph, not the end card", async () => {
  // What the bug left behind: place null, unfinished, final photo marked.
  let s = { ...X.createExplore(ids18.slice(0, 4), 1), review: true };
  s = X.reduceExplore(s, { type: "discard", id: "p4", revision: s.revision, direction: "left" });
  const corrupted = { ...s, activeId: null, finished: false };
  const repaired = X.reconcileReview(corrupted, ids18.slice(0, 4).map((id) => ({ ...media(id), decision: id === "p4" ? "delete" : undefined })));
  assert.equal(repaired.activeId, "p4", "the last slot, where that user was");
  assert.notEqual(repaired.finished, true);
  assert.deepEqual(repaired.ids.filter((id) => repaired.records[id]?.queued), ["p4"], "the pending deletion is kept");
  const h = review(undefined, { session: repaired });
  assert.equal(h.shown, "p4");
  await h.to("p1");
  await h.mark();
  assert.deepEqual(h.errors, []);
  agrees(h);
  // A truly finished older review is left finished.
  assert.notEqual(X.reconcileReview({ ...corrupted, finished: undefined }, []).finished, true, "an ambiguous legacy null position resumes instead of completing");
  assert.equal(X.reconcileReview({ ...corrupted, finished: true }, []).finished, true);
});

test("the daily limit page is never completion, and marking the last allowed photo stops at the limit", async () => {
  const h = review(ids18.slice(0, 8), { stopBefore: "p5" });
  for (const id of ["p2", "p3", "p4"]) await h.to(id);
  await h.end();
  assert.equal(h.shown, LIMIT);
  assert.equal(h.ended.length, 0, "reaching the limit page never completes");
  await h.to("p4");
  await h.mark("p4");
  assert.equal(h.shown, LIMIT, "the last allowed photo marked: the limit page, not the end card");
  assert.equal(h.ended.length, 0);
  assert.notEqual(h.session.finished, true);
  assert.equal(h.session.activeId, "p5", "the saved place is the next photograph, where the review resumes once allowed");
  agrees(h);
  // Reopened while still at the limit: the limit page, never the end card or a finish.
  const again = review(undefined, { session: h.session, stopBefore: "p5" });
  assert.equal(again.shown, LIMIT);
  assert.equal(again.ended.length, 0);
  // After Pro (no cut), the same review continues at that photograph.
  const pro = review(undefined, { session: h.session });
  assert.equal(pro.shown, "p5");
});

test("statistics: explored counts unique meaningful views, marked counts unique current marks, Undo corrects both", () => {
  let s = { ...X.createExplore(["a", "b", "c", "d"], 1), review: true };
  const at = 10_000;
  s = X.reduceExplore(s, { type: "seen", id: "a", displayedAt: at }, at + 1);
  s = X.reduceExplore(s, { type: "page", id: s.activeId, revision: s.revision, toId: "b", availableIds: s.ids });
  s = X.reduceExplore(s, { type: "page", id: s.activeId, revision: s.revision, toId: "a", availableIds: s.ids });
  s = X.reduceExplore(s, { type: "page", id: s.activeId, revision: s.revision, toId: "c", availableIds: s.ids });
  assert.equal(X.exploreCounts(s).explored, 2, "scrolling past a photo reviews it once; revisits don't add");
  s = X.reduceExplore(s, { type: "discard", id: "c", revision: s.revision, direction: "left" });
  s = X.reduceExplore(s, { type: "discard", id: "c", revision: s.revision, direction: "left" });
  assert.equal(X.exploreCounts(s).discarded, 1, "a repeated mark is refused");
  assert.equal(X.exploreCounts(s).explored, 3, "a mark is a meaningful review of that photo");
  s = X.reduceExplore(s, { type: "undo" });
  assert.equal(X.exploreCounts(s).discarded, 0, "Undo removes the mark");
  assert.equal(X.exploreCounts(s).explored, 3, "Undo never erases a meaningful encounter");
  assert.equal(s.activeId, "c");
});

async function store(ids) {
  const db = new DatabaseSync(":memory:");
  const p = platform({ library: ids });
  const app = await boot(db, p);
  await app.storage.put(ids.map((id) => media(id)));
  const key = "adventure:state:explore";
  await app.storage.setValue(key, { ...X.createExplore(ids, 1), review: true });
  const load = () => makeLoader({ ...p.mocks, "./repository": app, "./media": { mediaService: app.mediaService } })("services/explore.ts").exploreStoreFor(key);
  return { app, load, key };
}

test("on SQLite: re-marking never duplicates pending deletions, and the saved place survives leaving and returning", async () => {
  const { app, load } = await store(["a", "b", "c"]);
  let s = load();
  await s.change((c) => ({ type: "page", id: c.activeId, revision: c.revision, toId: "c", availableIds: ["a", "b", "c"] }));
  await s.change((c) => ({ type: "discard", id: "c", revision: c.revision, direction: "left" }));
  await s.change((c) => ({ type: "discard", id: "c", revision: c.revision, direction: "left" }));
  await s.change({ type: "undo" });
  await s.change((c) => ({ type: "discard", id: "c", revision: c.revision, direction: "left" }));
  assert.equal((await app.storage.stats()).pending, 1, "one pending deletion");
  assert.equal((await app.storage.query({ decision: "delete" })).length, 1);
  s = load(); // Back, then reopened
  const resumed = await s.load();
  assert.equal(resumed.activeId, "c", "resumes on the saved slot, the marked photo shown faded");
  assert.notEqual(resumed.finished, true);
  assert.equal((await app.storage.get("c")).deletedAt, undefined, "pending is never deleted");
});

test("on SQLite: finishing or opening an adventure never awards streak credit; ten views do", async () => {
  const ids = Array.from({ length: 12 }, (_, i) => `v${i}`);
  const { app, load } = await store(ids);
  const s = load();
  await s.change({ type: "finish" });
  const daily = () => app.storage.getValue("dailyActivity:v1");
  const today = async () => Object.values((await daily())?.days ?? {})[0];
  assert.equal(await today(), undefined, "finishing writes no activity");
  const now = Date.now();
  for (const id of ids.slice(0, 9)) await s.change({ type: "seen", id, displayedAt: now });
  assert.equal((await today()).photos, 9);
  const d = makeLoader()("lib/pictopia/daily.ts");
  assert.equal(d.streak(await daily(), [], Date.now()).todayDone, false, "nine views don't qualify");
  await s.change({ type: "seen", id: ids[9], displayedAt: now });
  await s.change({ type: "seen", id: ids[9], displayedAt: now });
  assert.equal((await today()).photos, 10, "a repeated view counts once");
  assert.equal(d.streak(await daily(), [], Date.now()).todayDone, true, "ten unique views qualify");
});

test("screen contracts: Back keeps the place, no running allowance counter, date top-right, completion inside the safe area", () => {
  const review = fs.readFileSync("components/pictopia/adventure-review.tsx", "utf8");
  assert.match(review, /const empty = !!session && !complete && !session.ids.length;/, "marking every photo cannot unmount the feed during the final flight");
  assert.match(review, /!sequence.length && !busy && flying === 0/, "all-marked resume waits for in-flight transitions before completion");
  assert.match(review, /<NavigationBack label="Back" onPress=\{exit\}/);
  assert.doesNotMatch(review, /left today/, "no running daily countdown in review");
  assert.match(review, /absolute right-3 top-2[^"]*"><Text[^>]*>\{label\}/, "the month and year sit top-right of the photo area");
  assert.match(review, /pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" className="absolute right-3 top-2/, "the date never takes touches");
  assert.doesNotMatch(review, /\{!!\(error \|\| loadError \|\| transitionError\) && <Pressable[^\n]*className="mx-4 mb-2/, "a save message overlays the photos instead of resizing the pages");
  const exit = review.slice(review.indexOf("const exit ="), review.indexOf("\n", review.indexOf("const exit =")));
  assert.doesNotMatch(exit, /change\(|finish|restart/, "going back saves nothing new and discards nothing");
  const finish = fs.readFileSync("components/pictopia/adventure-finish.tsx", "utf8");
  assert.match(finish, /edges=\{\["top", "bottom", "left", "right"\]\}/, "the artwork sits below the status bar");
  assert.doesNotMatch(finish, /marginTop: \d{2,}|top-\[\d+px\]/, "no model-specific offsets");
  assert.doesNotMatch(finish, /Review \$\{plural\(marked|Undo last mark|Back to the photos/, "completion does not compete with review controls");
  const m = makeLoader()("lib/pictopia/review-flow.ts");
  assert.equal(m.monthYear(new Date(2024, 9, 3).getTime()), "Oct 2024");
  assert.equal(m.monthYear(0), undefined);
});
