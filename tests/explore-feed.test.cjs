const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { makeLoader } = require("./loader.cjs");
const { DatabaseSync, media, platform, boot } = require("./native-harness.cjs");
const load = makeLoader();
const { createExplore, reduceExplore, exploreCounts } = load("lib/pictopia/explore.ts");
const { ExploreFeedController } = load("lib/pictopia/explore-feed-controller.ts");
const defer = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const flush = () => new Promise((resolve) => setImmediate(resolve));

const END = "explore-completion";
/** Mirrors ExploreFeed: the pager renders the feed (minus discards, plus departing cards)
 * and re-anchors in a layout effect that runs a tick after the session is published. */
function harness(count = 200, { render = "later" } = {}) {
  let session = createExplore(Array.from({ length: count }, (_, i) => `photo-${i}`));
  let saveGate,
    failSave = false,
    tail = Promise.resolve(),
    departing = new Set(),
    hidden = new Set(),
    rendered;
  const calls = [],
    scrolls = [],
    pages = [],
    busy = [],
    errors = [],
    entrances = [],
    arrivals = [];
  const build = () => [
    ...session.ids.filter(
      (id) => departing.has(id) || (!session.records[id]?.discarded && !hidden.has(id)),
    ),
    END,
  ];
  rendered = build();
  let controller;
  const commit = () => {
    const next = build();
    if (next.join() === rendered.join()) return;
    rendered = next;
    controller.relayout();
  };
  const schedule = () => (render === "now" ? commit() : setImmediate(commit));
  let prepareGate;
  controller = new ExploreFeedController(
    {
      read: () => session,
      pages: () => rendered,
      // Mirrors exploreStore.change: serialized, builders see the stored session.
      save: (action) => {
        const run = tail.then(async () => {
          if (saveGate) await saveGate.promise;
          if (failSave) throw Error("Disk full");
          const built = typeof action === "function" ? action(session) : action;
          calls.push(built);
          session = reduceExplore(session, built);
          schedule();
          return session;
        });
        tail = run.catch(() => {});
        return run;
      },
      scrollTo: (page, animated) => scrolls.push({ page, animated, id: rendered[page] }),
      onPage: (page) => pages.push(page),
      onBusy: (value) => busy.push(value),
      onError: (message) => errors.push(message),
      onFeed: (nextDeparting, nextHidden) => {
        departing = new Set(nextDeparting);
        hidden = new Set(nextHidden);
        schedule();
      },
      prepare: (entry) => {
        entrances.push(entry);
        arrivals.push(controller.page);
        return prepareGate ? prepareGate.promise : Promise.resolve();
      },
    },
    session.activeId,
  );
  return {
    controller,
    calls,
    scrolls,
    pages,
    busy,
    errors,
    entrances,
    arrivals,
    get session() {
      return session;
    },
    get rendered() {
      return rendered;
    },
    /** The ID the pager is showing. */
    get shown() {
      return rendered[controller.page];
    },
    idle: async () => {
      await tail;
      await flush();
      await flush();
    },
    holdSave: () => {
      saveGate = defer();
      return saveGate;
    },
    holdPrepare: () => {
      prepareGate = defer();
      return prepareGate;
    },
    failSave: (value = true) => {
      failSave = value;
    },
    up: () => controller.settle(controller.page + 1, session.ids),
    down: () => controller.settle(controller.page - 1, session.ids),
    discard: (direction, animation = Promise.resolve()) =>
      controller.discard(rendered[controller.page], direction, animation),
  };
}
const feedOf = (s) => s.ids.filter((id) => !s.records[id]?.discarded);
/** The pager and the saved session agree, and the pager shows exactly the feed. */
function consistent(h) {
  assert.deepEqual(h.rendered.slice(0, -1), feedOf(h.session), "no discarded or duplicate cards");
  assert.equal(h.controller.activeId, h.session.activeId);
  assert.equal(h.shown, h.session.activeId ?? END);
}

test("20 up, 5 down, left/right discards and 30 alternating actions keep stable IDs and order", async () => {
  const h = harness();
  const snapshot = [...h.session.ids];
  for (let i = 0; i < 20; i++) {
    h.up();
    await h.idle();
    assert.equal(h.shown, `photo-${i + 1}`);
  }
  assert.equal(exploreCounts(h.session).explored, 20);
  for (let i = 0; i < 5; i++) h.down();
  await h.idle();
  assert.equal(h.session.activeId, "photo-15");
  assert.equal(exploreCounts(h.session).explored, 20, "backward paging never clears encountered");
  await h.discard("left");
  await h.idle();
  assert.equal(h.session.records["photo-15"].discarded, true);
  assert.equal(h.shown, "photo-16", "the next remaining photo is shown");
  consistent(h);
  const pattern = ["up", "left", "up", "right", "up", "left"];
  for (let i = 0; i < 30; i++) {
    const expectedId = h.shown;
    const action = pattern[i % pattern.length];
    if (action === "up") h.up();
    else await h.discard(action);
    await h.idle();
    consistent(h);
    const last = h.calls.at(-1);
    assert.equal(last.type === "page" ? last.id : last.id, expectedId, "each action refers to the departing photo");
  }
  assert.deepEqual(h.session.ids, snapshot, "the snapshot never changes");
  const feed = feedOf(h.session);
  assert.deepEqual(
    feed,
    snapshot.filter((id) => feed.includes(id)),
    "the feed keeps original order",
  );
  // Scroll all the way back: no discarded photo appears.
  const seen = [];
  while (h.controller.page > 0) {
    h.down();
    await h.idle();
    seen.push(h.shown);
  }
  assert.ok(seen.every((id) => !h.session.records[id]?.discarded));
  assert.equal(seen.at(-1), "photo-0");
});

test("rapid flicks are never blocked or pulled back while saves are still in flight", async () => {
  const h = harness(),
    gate = h.holdSave();
  for (let i = 0; i < 6; i++) h.up();
  assert.equal(h.controller.page, 6, "the shown page follows the finger immediately");
  assert.equal(h.session.activeId, "photo-0", "nothing has been saved yet");
  assert.ok(
    h.scrolls.every((s) => s.animated === false),
    "settling never animates the pager away from where the user left it",
  );
  // A sideways swipe on the page the user is looking at queues behind those saves.
  const discard = h.discard("right");
  gate.resolve();
  await discard;
  await h.idle();
  assert.equal(h.session.records["photo-6"].discarded, true);
  assert.equal(h.session.activeId, "photo-7");
  assert.equal(h.shown, "photo-7");
  assert.equal(h.controller.page, 6, "photo-7 now sits in the departed photo's index");
  assert.equal(exploreCounts(h.session).explored, 7);
  assert.deepEqual(h.errors, []);
  consistent(h);
});

test("discard holds input only for the fly-out, then the next photo slides into the same slot", async () => {
  const h = harness(5),
    animation = defer(),
    prepared = h.holdPrepare();
  h.up();
  await h.idle();
  const transition = h.discard("left", animation.promise); // photo-1
  assert.deepEqual(h.busy, [true]);
  assert.equal(h.controller.canDiscard("photo-1"), false, "no double discard");
  h.controller.settle(3, h.session.ids); // Late scroll callback mid-discard is ignored.
  h.controller.next(h.session.ids);
  await h.controller.undo(); // Taps mid-discard are ignored too.
  assert.equal(h.controller.page, 1);
  await flush();
  await flush();
  await flush();
  assert.equal(h.session.records["photo-1"].discarded, true, "persistence runs in parallel");
  assert.equal(h.rendered[1], "photo-1", "the departing card stays rendered during the fly-out");
  animation.resolve();
  await flush();
  assert.deepEqual(h.entrances, [{ id: "photo-2", from: "below" }], "positioned while out of view");
  assert.equal(h.rendered[1], "photo-1", "nothing moves until the arriving card is positioned");
  prepared.resolve();
  await transition;
  await h.idle();
  assert.deepEqual(h.busy, [true, false], "input is free again as soon as the photo has flown out");
  assert.deepEqual(h.rendered, ["photo-0", "photo-2", "photo-3", "photo-4", END]);
  assert.equal(h.controller.page, 1, "same slot");
  assert.equal(h.shown, "photo-2");
  assert.ok(
    h.scrolls.every((s) => !(s.animated && s.page !== 1)),
    "the pager itself never scrolls for a discard",
  );
  // Flicking on immediately lands on the following photo.
  h.up();
  await h.idle();
  assert.equal(h.shown, "photo-3");
  await assert.rejects(h.controller.discard("photo-1", "right", Promise.resolve()));
  assert.deepEqual(
    h.calls.map((c) => c.type),
    ["page", "discard", "page"],
    "a stale photo id can never be discarded",
  );
  consistent(h);
});

test("the discarded card leaves at once even while its save is still queued", async () => {
  const h = harness(4);
  const gate = h.holdSave();
  const discard = h.discard("right"); // photo-0
  await flush();
  await flush();
  assert.deepEqual(h.rendered.slice(0, -1), ["photo-1", "photo-2", "photo-3"]);
  assert.equal(h.shown, "photo-1");
  assert.equal(h.session.records["photo-0"], undefined, "not saved yet");
  gate.resolve();
  await discard;
  await h.idle();
  assert.deepEqual(h.rendered.slice(0, -1), ["photo-1", "photo-2", "photo-3"]);
  consistent(h);
});

for (const render of ["now", "later"])
  test(`undo restores left and right discards from their side and activates them (render ${render})`, async () => {
    const h = harness(10, { render });
    h.up();
    await h.discard("left"); // photo-1
    await h.idle();
    await h.discard("right"); // photo-2
    await h.idle();
    assert.equal(h.shown, "photo-3");
    // Navigate five photos away.
    for (let i = 0; i < 5; i++) h.up();
    await h.idle();
    assert.equal(h.shown, "photo-8");
    await h.controller.undo();
    await h.idle();
    assert.deepEqual(h.entrances.at(-1), { id: "photo-2", from: "right" });
    assert.equal(h.shown, "photo-2", "the restored photo is shown wherever the user was");
    assert.equal(h.controller.page, 1, "in its original slot, after photo-0");
    consistent(h);
    await h.controller.undo();
    await h.idle();
    assert.deepEqual(h.entrances.at(-1), { id: "photo-1", from: "left" });
    assert.equal(h.shown, "photo-1");
    assert.deepEqual(h.rendered.slice(0, -1), h.session.ids);
    consistent(h);
    const before = h.entrances.length;
    await h.controller.undo();
    await h.idle();
    assert.equal(h.entrances.length, before, "nothing left to undo");
    // Undo then discard again.
    await h.discard("right");
    await h.idle();
    assert.equal(h.shown, "photo-2");
    assert.deepEqual(h.session.history, [{ id: "photo-1", direction: "right" }]);
    consistent(h);
  });

test("discarding the last photo goes straight to completion; earlier photos stay in the feed", async () => {
  const h = harness(3);
  h.up();
  h.up();
  await h.idle();
  assert.equal(h.shown, "photo-2");
  await h.discard("left");
  await h.idle();
  assert.equal(h.session.activeId, null, "completion, not the previous photo");
  assert.deepEqual(h.rendered, ["photo-0", "photo-1", END]);
  assert.equal(h.controller.page, 2);
  consistent(h);
  await h.controller.undo();
  await h.idle();
  assert.equal(h.shown, "photo-2");
  consistent(h);
});

test("rapid taps, scrolls and discards never duplicate cards or desync the saved place", async () => {
  const h = harness(30);
  const gate = h.holdSave();
  h.up();
  h.up();
  const d = h.discard("left").catch(() => {});
  h.controller.undo();
  h.up();
  gate.resolve();
  await d;
  await h.idle();
  consistent(h);
  for (let i = 0; i < 12; i++) {
    const step = i % 4;
    if (step === 0) await h.discard(i % 8 ? "left" : "right");
    else if (step === 1) h.up();
    else if (step === 2) {
      // Double tap: two undos queue in order; each restores one photo.
      const first = h.controller.undo();
      h.controller.undo();
      await first;
    } else h.down();
    await h.idle();
    consistent(h);
  }
  assert.equal(new Set(h.rendered).size, h.rendered.length);
  assert.deepEqual(h.errors, []);
});

test("a sideways swipe right after rapid scrolling discards the photo on screen, before the scroll reports rest", async () => {
  for (const direction of ["left", "right"]) {
    const h = harness(20);
    // Five fast flicks: the photos go by, but no settle has been reported yet (iOS paging
    // keeps creeping after it looks still; a touch that stops it may never report an end).
    assert.equal(h.controller.page, 0);
    // The finger lands on photo-5, which is what the user sees, and swipes sideways.
    assert.equal(h.controller.claim(5, h.session.ids, false), true);
    assert.equal(h.controller.canDiscard("photo-5"), true, "no preliminary swipe needed");
    assert.equal(h.controller.canDiscard("photo-0"), false, "never the stale page");
    await h.discard(direction);
    await h.idle();
    assert.equal(h.session.records["photo-5"].discarded, true);
    assert.deepEqual(
      Object.entries(h.session.records)
        .filter(([, r]) => r.discarded)
        .map(([id]) => id),
      ["photo-5"],
      "only the photo on screen is discarded",
    );
    assert.equal(h.shown, "photo-6");
    assert.equal(exploreCounts(h.session).explored, 6, "the photos scrolled past are recorded");
    // The late settle for the same page is a no-op.
    const writes = h.calls.length;
    h.controller.settle(h.controller.page, h.session.ids);
    await h.idle();
    assert.equal(h.calls.length, writes);
    consistent(h);
  }
});

test("a swipe caught a fraction off a page snaps onto that photo; claims never land on completion or mid-discard", async () => {
  const h = harness(4);
  assert.equal(h.controller.claim(2, h.session.ids, true), true);
  assert.deepEqual(h.scrolls.at(-1), { page: 2, animated: false, id: "photo-2" });
  assert.equal(h.controller.claim(2, h.session.ids, true), true);
  assert.deepEqual(h.scrolls.at(-1), { page: 2, animated: false, id: "photo-2" }, "same page: snap only");
  assert.equal(h.controller.claim(4, h.session.ids, false), false, "completion page");
  assert.equal(h.controller.claim(-1, h.session.ids, false), false);
  const animation = defer();
  const d = h.discard("left", animation.promise);
  assert.equal(h.controller.claim(1, h.session.ids, false), false, "busy discarding");
  animation.resolve();
  await d;
  await h.idle();
  consistent(h);
});

test("30 alternating scroll/discard turns, each swipe claimed before its scroll settles, never skip or misapply", async () => {
  const h = harness(120);
  let expectedDiscards = 0;
  for (let i = 0; i < 30; i++) {
    // Scroll 1-3 photos, sometimes backward, without a settle report.
    const step = (i % 3) + 1;
    const target = Math.max(0, Math.min(h.rendered.length - 2, h.controller.page + (i % 4 === 3 ? -step : step)));
    const id = h.rendered[target];
    assert.equal(h.controller.claim(target, h.session.ids, i % 2 === 0), true);
    await h.discard(i % 2 ? "left" : "right");
    await h.idle();
    expectedDiscards++;
    assert.equal(h.session.records[id].discarded, true, `turn ${i} discards ${id}`);
    assert.equal(exploreCounts(h.session).discarded, expectedDiscards);
    consistent(h);
  }
  assert.deepEqual(h.session.ids, Array.from({ length: 120 }, (_, i) => `photo-${i}`));
});

test("gesture wiring: sideways recognizer is live on every loaded photo, decided by the live offset", () => {
  const feed = fs.readFileSync("components/pictopia/explore-feed.tsx", "utf8");
  const card = fs.readFileSync("components/pictopia/explore-card.tsx", "utf8");
  const native = fs.readFileSync("components/pictopia/explore-gesture.native.tsx", "utf8");
  // Not gated on the trailing `active` prop, or the first swipe after scrolling is lost to
  // the scroll view (which only waits for an enabled recognizer).
  assert.match(card, /enabled=\{phase === "loaded"\}/);
  assert.doesNotMatch(card, /started\.current = [^;]*\bactive\b/);
  // Handlers are stable, so the recognizer isn't reconfigured as the shown photo changes.
  assert.match(card, /onStart=\{gestureStart\}/);
  assert.match(card, /onCommit=\{gestureCommit\}/);
  // The swipe's photo comes from the live offset, not a momentum flag or the last settle.
  assert.match(feed, /claim\(id, nativeOffset\) && controller\.canDiscard\(id\)/);
  // A tap is accepted like a swipe: a stale, slightly-off offset after paging is snapped,
  // not a reason to refuse every later tap (the tap-to-undo after scrolling bug).
  assert.match(feed, /TAP_AFTER_DRAG \|\| !claim\(id\)\) return;/);
  assert.doesNotMatch(feed, /aligned && off/);
  assert.match(feed, /Math\.round\(current \/ h\)/);
  assert.doesNotMatch(feed, /!momentum\.current &&/);
  // Thresholds unchanged: ±12 pt decides the axis; native recognizers coexist.
  assert.match(native, /activeOffsetX\(\[-12, 12\]\)/);
  assert.match(native, /failOffsetY\(\[-12, 12\]\)/);
  assert.match(native, /simultaneousWithExternalGesture\(nativeScroll\)/);
});

test("returning to the same page or a held peek writes nothing", async () => {
  const h = harness();
  h.controller.settle(0, h.session.ids);
  await h.idle();
  assert.equal(h.calls.length, 0);
  assert.deepEqual(h.scrolls, []);
  h.up();
  h.down();
  await h.idle();
  assert.equal(h.session.activeId, "photo-0");
  assert.deepEqual(exploreCounts(h.session), {
    explored: 1,
    discarded: 0,
    untouched: 1,
    unavailable: 0,
  });
});

test("Review Discards restore and Restore All put photos back exactly once in original order", async () => {
  const h = harness(6);
  await h.discard("left"); // 0
  await h.idle();
  h.up(); // 1 -> 2
  await h.discard("right"); // 2
  await h.idle();
  assert.equal(h.shown, "photo-3");
  await h.controller.action({ type: "restore", id: "photo-0" });
  await h.idle();
  assert.deepEqual(h.rendered.slice(0, -1), ["photo-0", "photo-1", "photo-3", "photo-4", "photo-5"]);
  assert.equal(h.shown, "photo-3", "restoring never moves your place");
  consistent(h);
  await h.controller.action({ type: "restoreAll" });
  await h.idle();
  assert.deepEqual(h.rendered.slice(0, -1), h.session.ids);
  assert.equal(h.shown, "photo-3");
  await h.controller.action({ type: "back" });
  await h.idle();
  assert.equal(h.shown, "photo-2");
  consistent(h);
});

test("a failed save returns to the last saved photo and a failed discard rejects so the card springs home", async () => {
  const h = harness();
  h.up();
  await h.idle();
  h.failSave();
  h.up();
  await flush();
  await flush();
  assert.equal(h.shown, "photo-2", "a failed save is retried once before anything moves");
  assert.equal(h.errors.length, 0);
  await new Promise((resolve) => setTimeout(resolve, 300));
  await h.idle();
  assert.equal(h.shown, "photo-1", "resynced to the saved photo");
  assert.deepEqual(h.scrolls.at(-1), { page: 1, animated: false, id: "photo-1" });
  assert.equal(h.errors.length, 1);
  await assert.rejects(h.discard("left"));
  await h.idle();
  assert.equal(h.shown, "photo-1");
  assert.deepEqual(h.entrances.at(-1), { id: "photo-1", from: "left" }, "back in from its side");
  assert.equal(h.controller.discarding, false);
  assert.deepEqual(h.rendered.slice(0, 3), ["photo-0", "photo-1", "photo-2"], "still in the feed");
  h.failSave(false);
  await h.discard("left");
  await h.idle();
  assert.equal(h.session.records["photo-1"].discarded, true);
  assert.equal(h.shown, "photo-2");
  consistent(h);
});

test("Next works at any time, reaches the completion page and stops there", async () => {
  const h = harness(2);
  h.controller.next([]);
  h.controller.next(h.session.ids);
  h.controller.next(h.session.ids);
  await h.idle();
  assert.equal(h.controller.page, 2);
  assert.equal(h.session.activeId, null);
  assert.equal(h.session.records["photo-0"].unavailable, true, "advanced before loading");
  assert.equal(h.session.records["photo-1"].encountered, true);
  assert.ok(h.scrolls.every((s) => s.animated));
});

test("multi-page native settlement records every crossed stable ID atomically, and duplicate event is stale", () => {
  const s = createExplore(["a", "b", "c", "d"]);
  const action = { type: "page", id: "a", revision: 0, toId: "d", availableIds: ["a", "c"] };
  const next = reduceExplore(s, action);
  assert.deepEqual(next.ids, s.ids);
  assert.equal(next.activeId, "d");
  assert.deepEqual(Object.keys(next.records), ["a", "b", "c"]);
  assert.deepEqual(exploreCounts(next), {
    explored: 2,
    discarded: 0,
    untouched: 2,
    unavailable: 1,
  });
  assert.equal(reduceExplore(next, action), next);
  for (const toId of ["missing", "a", undefined])
    assert.equal(reduceExplore(s, { ...action, toId }), s);
});

test("native SQLite mixed paging/discards survive relaunch and preserve originals and production queue", async () => {
  const db = new DatabaseSync(":memory:");
  const rows = Array.from({ length: 65 }, (_, i) => media(`id-${i}`, { created: 100 - i }));
  const p = platform({ library: rows.map((m) => m.id) });
  let app = await boot(db, p);
  await app.storage.put(rows, { session: { id: "production", position: 3 } });
  const getStore = () =>
    makeLoader({
      ...p.mocks,
      "./repository": { storage: app.storage, serialize: app.serialize },
      "./media": { mediaService: app.mediaService },
    })("services/explore.ts").exploreStore;
  let store = getStore(),
    s = await store.start();
  for (let i = 0; i < 50; i++) {
    const id = s.activeId;
    const feed = feedOf(s);
    s = await store.change(
      i % 3 === 0
        ? { type: "discard", id, revision: s.revision, direction: i % 2 ? "left" : "right" }
        : {
            type: "page",
            id,
            revision: s.revision,
            toId: feed[feed.indexOf(id) + 1] ?? null,
            availableIds: s.ids,
          },
    );
  }
  const saved = structuredClone(s);
  app = await boot(db, p);
  store = getStore();
  assert.deepEqual(await store.load(), saved);
  const back = feedOf(s)[10];
  s = await store.change({
    type: "page",
    id: s.activeId,
    revision: s.revision,
    toId: back,
    availableIds: s.ids,
  });
  assert.equal(s.activeId, back);
  assert.equal(s.records[back].discarded, false);
  s = await store.change({ type: "restoreAll" });
  assert.deepEqual(s.ids, saved.ids);
  assert.equal(exploreCounts(s).discarded, 0);
  assert.deepEqual(await app.storage.getValue("session"), { id: "production", position: 3 });
  for (const row of rows) assert.deepEqual(await app.storage.get(row.id), row);
  assert.deepEqual(p.requests, []);
  assert.equal(p.library.size, rows.length);
  db.close();
});

test("renderer regression: immutable ID-keyed list cells, fixed page bounds, X-only transforms, native axis arbitration", () => {
  const feed = fs.readFileSync("components/pictopia/explore-feed.tsx", "utf8");
  const card = fs.readFileSync("components/pictopia/explore-card.tsx", "utf8");
  const native = fs.readFileSync("components/pictopia/explore-gesture.native.tsx", "utf8");
  assert.match(feed, /keyExtractor=\{\(id\) => id\}/);
  assert.match(feed, /pagingEnabled/);
  assert.match(feed, /getItemLayout/);
  assert.match(feed, /windowSize=\{5\}/);
  assert.match(feed, /overflow: "hidden"/);
  assert.match(feed, /id !== controller\.activeId/, "resets must preserve the active photo's canceled-drag spring");
  assert.doesNotMatch(feed, /scrollEnabled=\{[^}]*pending/, "saving never disables scrolling");
  assert.doesNotMatch(card, /zIndex/);
  // Y only follows the thumb inside a sideways drag (native paging is blocked then) and
  // resets with X; it never positions pages.
  assert.match(card, /y\.value = 0;/);
  // The feed is derived from the snapshot by stable ID; nothing splices pages by index.
  assert.match(feed, /session\.ids\.filter\(/);
  assert.doesNotMatch(feed, /\.splice\(/);
  assert.match(feed, /useLayoutEffect/, "re-anchoring happens before paint");
  assert.match(native, /simultaneousWithExternalGesture\(nativeScroll\)/);
  assert.match(native, /activeOffsetX\(\[-12, 12\]\)/);
  assert.match(native, /failOffsetY\(\[-12, 12\]\)/);
  for (const file of [
    "components/pictopia/explore-feed.tsx",
    "lib/pictopia/explore-feed-controller.ts",
  ]) {
    assert.doesNotMatch(
      fs.readFileSync(file, "utf8"),
      /deleteQueue|deleteMarked|mediaService\.remove|deleteAssetsAsync/,
    );
  }
});
