const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { makeLoader } = require("./loader.cjs");
const { DatabaseSync, media, platform, boot } = require("./native-harness.cjs");
const {
  createExplore,
  reduceExplore,
  exploreCounts,
  exploreFeed,
  migrateExplore,
  selectExploreIds,
  exploreDirection,
} = makeLoader()("lib/pictopia/explore.ts");
const feedOf = (s) => s.ids.filter((id) => !s.records[id]?.discarded);
// Up pages to the next photo still in the feed; sideways discards the shown photo.
const advance = (s, direction = "up", available = true) => {
  if (direction !== "up")
    return { type: "discard", id: s.activeId, revision: s.revision, direction };
  const feed = feedOf(s);
  const i = s.activeId === null ? feed.length : feed.indexOf(s.activeId);
  return {
    type: "page",
    id: s.activeId,
    revision: s.revision,
    toId: feed[i + 1] ?? null,
    availableIds: available && s.activeId ? [s.activeId] : [],
  };
};
const goTo = (s, toId) => ({ type: "page", id: s.activeId, revision: s.revision, toId, availableIds: s.ids });

test("snapshot is unique, deterministic, <=200 and only active still photos outside production discards", () => {
  const rows = Array.from({ length: 260 }, (_, i) => media(String(i), { created: i }));
  rows.push(
    media("video", { type: "video" }),
    media("gone", { active: false }),
    media("deleted", { deletedAt: 1 }),
    media("queue", { decision: "delete" }),
    rows[0],
  );
  const ids = selectExploreIds(rows);
  assert.equal(ids.length, 200);
  assert.deepEqual(ids, selectExploreIds([...rows].reverse()));
  assert.deepEqual(ids.slice(0, 3), ["259", "258", "257"]);
  assert.equal(new Set(ids).size, 200);
  assert.deepEqual(createExplore(["a", "a", "b"]).ids, ["a", "b"]);
  assert.equal(createExplore(["a", "b"]).activeId, "a");
  assert.equal(createExplore([]).activeId, null);
});

for (const direction of ["left", "right"]) {
  test(`${direction} discard leaves the feed, keeps original order, and undo restores it from that side`, () => {
    const initial = createExplore(["a", "b", "c"], 1);
    const moved = reduceExplore(initial, advance(initial, direction), 2);
    assert.equal(moved.activeId, "b");
    assert.equal(moved.records.a.discarded, true);
    assert.deepEqual(moved.ids, ["a", "b", "c"], "the snapshot itself never changes");
    assert.deepEqual(exploreFeed(moved), ["b", "c"]);
    assert.deepEqual(moved.history, [{ id: "a", direction }]);
    const undone = reduceExplore(moved, { type: "undo" });
    assert.equal(undone.activeId, "a");
    assert.deepEqual(undone.records, initial.records);
    assert.deepEqual(undone.history, []);
    assert.deepEqual(exploreFeed(undone), ["a", "b", "c"]);
  });
}

test("backward exploration never shows discarded photos; up/back walk only the remaining feed", () => {
  let s = createExplore(["a", "b", "c", "d", "e"]);
  s = reduceExplore(s, advance(s)); // a -> b
  s = reduceExplore(s, advance(s, "left")); // b out -> c
  s = reduceExplore(s, advance(s)); // c -> d
  s = reduceExplore(s, advance(s, "right")); // d out -> e
  assert.equal(s.activeId, "e");
  const seen = [s.activeId];
  for (let i = 0; i < 5; i++) {
    const before = s;
    s = reduceExplore(s, { type: "back" });
    if (s === before) break;
    seen.push(s.activeId);
  }
  assert.deepEqual(seen, ["e", "c", "a"]);
  assert.deepEqual(exploreFeed(s), ["a", "c", "e"]);
  // Paging to a discarded photo is refused.
  assert.equal(reduceExplore(s, goTo(s, "b")), s);
  assert.equal(exploreCounts(s).explored, 4);
});

test("multiple discards undo latest first, each back in its original slot with its own side", () => {
  let s = createExplore(["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]);
  s = reduceExplore(s, advance(s, "left")); // a
  s = reduceExplore(s, advance(s)); // b -> c
  s = reduceExplore(s, advance(s, "right")); // c
  s = reduceExplore(s, advance(s, "left")); // d
  assert.equal(s.activeId, "e");
  // Navigate five photos away before undoing.
  for (let i = 0; i < 5; i++) s = reduceExplore(s, advance(s));
  assert.equal(s.activeId, "j");
  assert.deepEqual(exploreFeed(s), ["b", "e", "f", "g", "h", "i", "j"]);
  assert.deepEqual(
    s.history.map((h) => [h.id, h.direction]),
    [
      ["a", "left"],
      ["c", "right"],
      ["d", "left"],
    ],
  );
  s = reduceExplore(s, { type: "undo" });
  assert.equal(s.activeId, "d", "undo activates the restored photo wherever the user was");
  assert.deepEqual(exploreFeed(s), ["b", "d", "e", "f", "g", "h", "i", "j"]);
  s = reduceExplore(s, { type: "undo", id: "a" });
  assert.equal(s.activeId, "d", "a stale undo for a different photo is refused");
  s = reduceExplore(s, { type: "undo", id: "c" });
  assert.equal(s.activeId, "c");
  s = reduceExplore(s, { type: "undo" });
  assert.equal(s.activeId, "a");
  assert.deepEqual(exploreFeed(s), s.ids);
  const same = reduceExplore(s, { type: "undo" });
  assert.equal(same, s, "nothing left to undo");
  // Undo then discard again works like the first time.
  s = reduceExplore(s, advance(s, "right"));
  assert.equal(s.activeId, "b");
  assert.deepEqual(s.history, [{ id: "a", direction: "right" }]);
  assert.equal(new Set(exploreFeed(s)).size, exploreFeed(s).length, "no duplicates");
});

test("discarding the last photo ends the exploration and never falls back to an earlier one", () => {
  let s = createExplore(["a", "b", "c"]);
  s = reduceExplore(s, goTo(s, "c"));
  s = reduceExplore(s, advance(s, "left"));
  assert.equal(s.activeId, null, "nothing follows: completion, not the preceding photo");
  assert.deepEqual(exploreFeed(s), ["a", "b"]);
  assert.equal(s.ids.length, 3, "the snapshot (and its total) never shrinks");
  s = reduceExplore(s, { type: "undo" });
  assert.equal(s.activeId, "c");
  // A middle discard still shows the next photo; discarding every photo completes.
  s = createExplore(["a", "b", "c"]);
  s = reduceExplore(s, advance(s, "left"));
  assert.equal(s.activeId, "b");
  s = reduceExplore(s, advance(s, "right"));
  assert.equal(s.activeId, "c");
  s = reduceExplore(s, advance(s, "left"));
  assert.equal(s.activeId, null);
  assert.deepEqual(exploreFeed(s), []);
  assert.equal(reduceExplore(s, { type: "back" }), s);
  s = reduceExplore(s, { type: "undo" });
  assert.equal(s.activeId, "c");
  // Paging past the last photo still reaches completion, and Previous returns.
  s = reduceExplore(s, advance(s));
  assert.equal(s.activeId, null);
  assert.equal(reduceExplore(s, { type: "back" }).activeId, "c");
});

test("a discarded photo can't be discarded twice; Review Discards restore reappears exactly once and voids its undo", () => {
  let s = createExplore(["a", "b", "c"]);
  s = reduceExplore(s, advance(s, "right"));
  const stale = { type: "discard", id: "a", revision: s.revision, direction: "left" };
  assert.equal(reduceExplore(s, stale), s);
  s = reduceExplore(s, advance(s, "left")); // b
  s = reduceExplore(s, { type: "restore", id: "a" });
  assert.equal(s.records.a.discarded, false);
  assert.equal(s.records.a.encountered, true);
  assert.deepEqual(exploreFeed(s), ["a", "c"]);
  assert.deepEqual(
    s.history.map((h) => h.id),
    ["b"],
    "the restored photo's undo entry is gone",
  );
  assert.equal(s.activeId, "c", "restoring never moves your place");
  s = reduceExplore(s, { type: "undo" });
  assert.deepEqual(exploreFeed(s), ["a", "b", "c"]);
  assert.equal(reduceExplore(s, { type: "undo" }), s, "the restored photo can't be undone again");
});

test("missing/loading photos can advance without being counted as explored, and can be retried", () => {
  let s = createExplore(["missing", "cloud", "ok"]);
  s = reduceExplore(s, advance(s, "up", false));
  s = reduceExplore(s, advance(s, "up", false));
  s = reduceExplore(s, advance(s, "right"));
  assert.equal(s.activeId, null, "the last photo left, so the exploration is complete");
  assert.deepEqual(exploreCounts(s), { explored: 1, discarded: 1, untouched: 0, unavailable: 2 });
  s = reduceExplore(s, { type: "back" });
  assert.equal(s.activeId, "cloud");
  s = reduceExplore(s, { type: "back" });
  s = reduceExplore(s, advance(s, "up", true));
  s = reduceExplore(s, advance(s, "up", true));
  assert.equal(s.activeId, null);
  assert.deepEqual(exploreCounts(s), { explored: 3, discarded: 1, untouched: 2, unavailable: 0 });
});

test("older saved sessions migrate to stable IDs with only outstanding discards undoable", () => {
  const record = (discarded) => ({ encountered: true, unavailable: false, discarded, changedAt: 1 });
  const v1 = {
    version: 1,
    ids: ["a", "b", "c", "d"],
    position: 1,
    revision: 7,
    startedAt: 1,
    instructionsDismissed: true,
    records: { a: record(true), b: record(true), c: record(false) },
    history: [
      { id: "a", position: 0 },
      { id: "b", position: 1 },
      { id: "c", position: 2 },
      { id: "b", position: 1, previous: record(true) },
    ],
  };
  const s = migrateExplore(v1);
  assert.equal(s.version, 2);
  assert.equal(s.activeId, "c", "the saved slot was discarded; the next remaining photo is shown");
  assert.deepEqual(s.history, [
    { id: "a", direction: "left" },
    { id: "b", direction: "left" },
  ]);
  assert.equal("position" in s, false);
  assert.equal(migrateExplore({ ...v1, position: 4 }).activeId, null);
  assert.equal(migrateExplore(s), s);
  assert.deepEqual(exploreFeed(reduceExplore(s, { type: "undo" })), ["b", "c", "d"]);
});

test("distance, flicks, diagonal intent, downward and cancelled/short movements", () => {
  for (const [x, y, vx, vy, expected] of [
    [0, -64, 0, 0, "up"],
    [-64, 0, 0, 0, "left"],
    [64, 0, 0, 0, "right"],
    [0, -18, 0, -800, "up"],
    [-18, 0, -800, 0, "left"],
    [18, 0, 800, 0, "right"],
    [0, 100, 0, 900, null],
    [8, -8, 1000, -1000, null],
    [0, -12, 0, -1000, null],
    [20, 0, 0, 0, null],
    [70, -70, 900, -900, null],
    [18, 0, -800, 0, null],
    [0, -18, 0, 800, null],
  ])
    assert.equal(exploreDirection(x, y, vx, vy), expected, JSON.stringify([x, y, vx, vy]));
  const native = fs.readFileSync("components/pictopia/explore-gesture.native.tsx", "utf8");
  assert.match(native, /onFinalize/);
  assert.match(native, /!success/);
  assert.match(native, /failOffsetY/);
  assert.match(native, /activeOffsetX/);
  assert.match(native, /simultaneousWithExternalGesture/);
});

function storeFor(app, p) {
  return makeLoader({
    ...p.mocks,
    "./repository": { storage: app.storage, serialize: app.serialize },
    "./media": { mediaService: app.mediaService },
  })("services/explore.ts");
}
test("native SQLite: real authorized IDs, left/right safety, concurrent actions, restore, relaunch, unchanged production queue", async () => {
  const db = new DatabaseSync(":memory:");
  const p = platform({
    library: ["a", "b", "c", "queue", "pending", "flight"],
    access: "limited",
    selected: ["a", "b", "c", "queue", "pending", "flight"],
  });
  let app = await boot(db, p);
  const rows = [
    media("a", { created: 3 }),
    media("b", { created: 2 }),
    media("c", { created: 1 }),
    media("hidden", { created: 0 }),
    media("queue", { decision: "delete" }),
    media("pending"),
    media("flight"),
  ];
  const production = { id: "standard", ids: ["queue"], position: 0 };
  await app.storage.put(rows, {
    session: production,
    deletionPending: [{ id: "pending" }],
    deletionAttempt: { ids: ["flight"] },
  });
  let { exploreStore: store } = storeFor(app, p);
  let s = await store.start();
  assert.deepEqual(s.ids, ["a", "b", "c"]);
  const originalIds = [...s.ids];
  await Promise.all([
    store.change(advance(s, "left")),
    store.change(advance(s, "right")),
    store.change(advance(s)),
  ]);
  s = await store.load();
  assert.equal(s.activeId, "b", "stale duplicates of the same action are rejected");
  assert.deepEqual(Object.keys(s.records), ["a"]);
  s = await store.change(advance(s, "right"));
  s = await store.change(advance(s));
  assert.equal(s.activeId, null);
  assert.deepEqual(exploreCounts(s), { explored: 3, discarded: 2, untouched: 1, unavailable: 0 });
  assert.deepEqual(
    s.history.map((h) => [h.id, h.direction]),
    [
      ["a", "left"],
      ["b", "right"],
    ],
  );
  const persisted = structuredClone(s);
  app = await boot(db, p);
  store = storeFor(app, p).exploreStore;
  assert.deepEqual(await store.load(), persisted, "discard sides and history survive relaunch");
  s = await store.change({ type: "undo" });
  assert.equal(s.activeId, "b", "undo after relaunch restores the latest discard");
  s = await store.change(advance(s, "right"));
  s = await store.change({ type: "restore", id: "a" });
  assert.equal(exploreCounts(s).discarded, 1);
  s = await store.change({ type: "restoreAll" });
  assert.equal(exploreCounts(s).discarded, 0);
  assert.equal(s.activeId, "c");
  assert.deepEqual(s.history, []);
  p.library.delete("a");
  s = await store.change({ type: "restart" });
  assert.deepEqual(s.ids, originalIds);
  assert.deepEqual(s.records, {});
  assert.equal(s.activeId, "a");
  assert.deepEqual(await app.storage.getValue("session"), production);
  for (const m of rows) assert.deepEqual(await app.storage.get(m.id), m);
  assert.equal((await app.storage.stats()).pending, 1);
  assert.deepEqual(p.requests, [], "the native delete API was never invoked");
  assert.deepEqual([...p.library].sort(), ["b", "c", "flight", "pending", "queue"]);
  db.close();
});

test("native failed save rolls back the full experiment; no media or production decision changes", async () => {
  const db = new DatabaseSync(":memory:");
  const p = platform({ library: ["a"] });
  const fault = {};
  const app = await boot(db, p, fault);
  await app.storage.put([media("a")]);
  const { exploreStore: store, EXPLORE_KEY } = storeFor(app, p);
  const before = await store.start();
  fault.key = EXPLORE_KEY;
  await assert.rejects(store.change(advance(before, "left")), /write failure/);
  assert.deepEqual(await store.load(), before);
  assert.equal((await app.storage.get("a")).decision, undefined);
  assert.deepEqual(p.requests, []);
  db.close();
});

test("browser IndexedDB persists user file references and resume/restart without changing originals", async () => {
  const { IDBFactory } = require("fake-indexeddb");
  globalThis.indexedDB = new IDBFactory();
  const { storage } = makeLoader()("services/storage.web.ts");
  await storage.init();
  const file = new Blob(["user selected file"]);
  await storage.put([media("web-a"), media("web-missing")], { "file:web-a": file });
  let tail = Promise.resolve();
  const serialize = (work) => {
    const result = tail.then(work, work);
    tail = result.catch(() => {});
    return result;
  };
  const loadStore = () =>
    makeLoader({
      "react-native": { Platform: { OS: "web" } },
      "./repository": { storage, serialize },
      "./media": {
        mediaService: {
          inspect: () => {
            throw Error("Browser deletion presence must stay unknown");
          },
          remove: () => {
            throw Error("Deletion must never execute");
          },
        },
      },
    })("services/explore.ts").exploreStore;
  let store = loadStore();
  let s = await store.start();
  assert.deepEqual(s.ids, ["web-a"]);
  s = await store.change(advance(s, "right"));
  await storage.init();
  store = loadStore();
  assert.deepEqual(await store.load(), s);
  s = await store.change({ type: "restart" });
  assert.deepEqual(s.ids, ["web-a"]);
  assert.equal(exploreCounts(s).discarded, 0);
  assert.equal(await (await storage.getValue("file:web-a")).text(), "user selected file");
});

test("undo has no time limit and covers up to 200 discards; restart preserves instructions and snapshot", () => {
  const ids = Array.from({ length: 200 }, (_, i) => `p${i}`);
  let s = createExplore(ids);
  s = reduceExplore(s, { type: "dismissInstructions" });
  for (let i = 0; i < 200; i++) s = reduceExplore(s, advance(s, i % 2 ? "left" : "right"));
  assert.equal(s.activeId, null);
  assert.equal(s.history.length, 200);
  for (let i = 0; i < 200; i++) s = reduceExplore(s, { type: "undo" }, Date.now() + 86_400_000);
  assert.equal(s.activeId, "p0");
  assert.deepEqual(exploreFeed(s), ids);
  s = reduceExplore(s, { type: "restart" });
  assert.deepEqual(s.ids, ids);
  assert.equal(s.instructionsDismissed, true);
  assert.deepEqual(s.history, []);
});

test("experiment UI exposes no deletion path or Pro gate; both sideways actions share one store operation", () => {
  for (const file of [
    "app/vertical-explore.tsx",
    "services/explore.ts",
    "components/pictopia/use-explore.ts",
    "components/pictopia/explore-card.tsx",
    "lib/pictopia/explore.ts",
  ]) {
    const source = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(
      source,
      /deleteQueue|deleteMarked|mediaService\.remove\(|deleteAssetsAsync|setDecision\(|\/queue|\/preview|\/paywall|app\.pro/,
    );
  }
  const service = fs.readFileSync("services/explore.ts", "utf8");
  assert.doesNotMatch(service, /repository\.(decide|setDecision|update|skip|start)/);
  assert.match(service, /next !== current && current.review/);
});
