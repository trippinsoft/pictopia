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

function harness(count = 200) {
  let session = createExplore(Array.from({ length: count }, (_, i) => `photo-${i}`));
  let saveGate,
    failSave = false,
    tail = Promise.resolve();
  const calls = [],
    scrolls = [],
    pages = [],
    busy = [],
    errors = [];
  const controller = new ExploreFeedController(
    {
      read: () => session,
      // Mirrors exploreStore.change: serialized, builders see the stored session.
      save: (action) => {
        const run = tail.then(async () => {
          if (saveGate) await saveGate.promise;
          if (failSave) throw Error("Disk full");
          const built = typeof action === "function" ? action(session) : action;
          calls.push(built);
          session = reduceExplore(session, built);
          return session;
        });
        tail = run.catch(() => {});
        return run;
      },
      scrollTo: (page, animated) => scrolls.push({ page, animated }),
      onPage: (page) => pages.push(page),
      onBusy: (value) => busy.push(value),
      onError: (message) => errors.push(message),
    },
    session.position,
  );
  return {
    controller,
    calls,
    scrolls,
    pages,
    busy,
    errors,
    get session() {
      return session;
    },
    idle: () => tail,
    holdSave: () => {
      saveGate = defer();
      return saveGate;
    },
    failSave: (value = true) => {
      failSave = value;
    },
    up: () => controller.settle(controller.page + 1, session.ids),
    down: () => controller.settle(controller.page - 1, session.ids),
    discard: (direction, animation = Promise.resolve()) =>
      controller.discard(session.ids[controller.page], direction, animation),
  };
}

test("20 up pages, 5 down pages, left/right discards and 30 alternating actions preserve fixed ID/page mapping", async () => {
  const h = harness();
  const snapshot = [...h.session.ids];
  for (let i = 0; i < 20; i++) {
    h.up();
    await h.idle();
    assert.equal(h.session.ids[h.controller.page], `photo-${i + 1}`);
  }
  assert.equal(exploreCounts(h.session).explored, 20);
  for (let i = 0; i < 5; i++) h.down();
  await h.idle();
  assert.equal(h.session.position, 15);
  assert.equal(exploreCounts(h.session).explored, 20, "backward paging never clears encountered");
  await h.discard("left");
  h.up();
  await h.idle();
  assert.equal(h.session.records["photo-15"].discarded, true);
  assert.equal(h.session.position, 17);
  const pattern = ["up", "left", "up", "right", "up", "left"];
  for (let i = 0; i < 30; i++) {
    const expectedId = snapshot[h.controller.page];
    const action = pattern[i % pattern.length];
    if (action === "up") h.up();
    else await h.discard(action);
    await h.idle();
    assert.equal(h.session.position, h.controller.page);
    assert.equal(h.calls.at(-1).id, expectedId, "each action refers to the departing photo");
  }
  assert.deepEqual(h.session.ids, snapshot);
  assert.equal(h.session.position, 47);
});

test("rapid flicks are never blocked or pulled back while saves are still in flight", async () => {
  const h = harness(),
    gate = h.holdSave();
  for (let i = 0; i < 6; i++) h.up();
  assert.equal(h.controller.page, 6, "the shown page follows the finger immediately");
  assert.equal(h.session.position, 0, "nothing has been saved yet");
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
  assert.equal(h.session.position, 7);
  assert.equal(h.controller.page, 7);
  assert.equal(exploreCounts(h.session).explored, 7);
  assert.deepEqual(h.errors, []);
});

test("discard holds input only until the photo has flown out, then shows the next page", async () => {
  const h = harness(5),
    animation = defer();
  const transition = h.discard("left", animation.promise);
  assert.deepEqual(h.busy, [true]);
  assert.equal(h.controller.canDiscard("photo-0"), false, "no double discard");
  h.controller.settle(3, h.session.ids); // Late scroll callback mid-discard is ignored.
  h.controller.next(h.session.ids);
  assert.equal(h.controller.page, 0);
  await flush();
  assert.equal(h.session.records["photo-0"].discarded, true, "persistence runs in parallel");
  assert.equal(h.controller.page, 0, "the pager waits for the fly-out");
  animation.resolve();
  await transition;
  assert.deepEqual(h.busy, [true, false]);
  assert.deepEqual(h.scrolls.at(-1), { page: 1, animated: true });
  assert.equal(h.session.position, 1);
  assert.equal(h.calls.length, 1);
  await assert.rejects(h.controller.discard("photo-0", "right", Promise.resolve()));
  assert.equal(h.calls.length, 1, "a stale photo id can never be discarded");
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
  assert.equal(h.session.position, 0);
  assert.deepEqual(exploreCounts(h.session), {
    explored: 1,
    discarded: 0,
    untouched: 1,
    unavailable: 0,
  });
});

test("undo returns to the discarded photo's slot; restore and restore-all keep the feed order", async () => {
  const h = harness();
  h.up();
  await h.discard("left");
  await h.controller.action({ type: "undo" });
  assert.equal(h.controller.page, 1);
  assert.equal(h.session.ids[h.controller.page], "photo-1");
  assert.equal(h.session.records["photo-1"], undefined);
  await h.discard("right");
  const snapshot = [...h.session.ids];
  await h.controller.action({ type: "restore", id: "photo-1" });
  assert.equal(h.session.records["photo-1"].discarded, false);
  assert.equal(h.controller.page, 2);
  await h.controller.action({ type: "restoreAll" });
  assert.deepEqual(h.session.ids, snapshot);
  h.down();
  await h.idle();
  assert.equal(h.session.ids[h.session.position], "photo-1");
  await h.controller.action({ type: "back" });
  assert.equal(h.controller.page, 0);
});

test("a failed save returns to the last saved photo and a failed discard rejects so the card springs home", async () => {
  const h = harness();
  h.up();
  await h.idle();
  h.failSave();
  h.up();
  await flush();
  await flush();
  assert.equal(h.controller.page, 1, "resynced to the saved page");
  assert.deepEqual(h.scrolls.at(-1), { page: 1, animated: false });
  assert.equal(h.errors.length, 1);
  await assert.rejects(h.discard("left"));
  assert.equal(h.controller.page, 1);
  assert.equal(h.controller.discarding, false);
  h.failSave(false);
  await h.discard("left");
  assert.equal(h.session.records["photo-1"].discarded, true);
  assert.equal(h.controller.page, 2);
});

test("Next works at any time, reaches the completion page and stops there", async () => {
  const h = harness(2);
  h.controller.next([]);
  h.controller.next(h.session.ids);
  h.controller.next(h.session.ids);
  await h.idle();
  assert.equal(h.controller.page, 2);
  assert.equal(h.session.position, 2);
  assert.equal(h.session.records["photo-0"].unavailable, true, "advanced before loading");
  assert.equal(h.session.records["photo-1"].encountered, true);
  assert.ok(h.scrolls.every((s) => s.animated));
});

test("multi-page native settlement records every crossed stable ID atomically, and duplicate event is stale", () => {
  const s = createExplore(["a", "b", "c", "d"]);
  const action = { type: "page", id: "a", revision: 0, position: 3, availableIds: ["a", "c"] };
  const next = reduceExplore(s, action);
  assert.deepEqual(next.ids, s.ids);
  assert.equal(next.position, 3);
  assert.deepEqual(Object.keys(next.records), ["a", "b", "c"]);
  assert.deepEqual(exploreCounts(next), {
    explored: 2,
    discarded: 0,
    untouched: 2,
    unavailable: 1,
  });
  assert.equal(reduceExplore(next, action), next);
  for (const position of [-1, 5, NaN, 0.5])
    assert.equal(reduceExplore(s, { ...action, position }), s);
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
    const id = s.ids[s.position];
    s = await store.change(
      i % 3 === 0
        ? {
            type: "advance",
            id,
            revision: s.revision,
            direction: i % 2 ? "left" : "right",
            available: true,
          }
        : { type: "page", id, revision: s.revision, position: s.position + 1, availableIds: s.ids },
    );
  }
  const saved = structuredClone(s);
  app = await boot(db, p);
  store = getStore();
  assert.deepEqual(await store.load(), saved);
  s = await store.change({
    type: "page",
    id: s.ids[s.position],
    revision: s.revision,
    position: 45,
    availableIds: s.ids,
  });
  assert.equal(s.position, 45);
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
  assert.match(feed, /id !== activeId/, "resets must preserve the active photo's canceled-drag spring");
  assert.doesNotMatch(feed, /scrollEnabled=\{[^}]*pending/, "saving never disables scrolling");
  assert.doesNotMatch(card, /translateY|zIndex/);
  assert.doesNotMatch(feed, /\.filter\([^\n]*discarded|\.splice\(/);
  assert.match(native, /blocksExternalGesture\(nativeScroll\)/);
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
