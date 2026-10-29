const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { makeLoader } = require("./loader.cjs");
const { DatabaseSync, media, platform, boot } = require("./native-harness.cjs");
const { createExplore, reduceExplore, exploreCounts, selectExploreIds, exploreDirection } =
  makeLoader()("lib/pictopia/explore.ts");
const advance = (s, direction = "up", available = true) => ({
  type: "advance",
  id: s.ids[s.position],
  revision: s.revision,
  direction,
  available,
});

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
});

for (const direction of ["up", "left", "right"]) {
  test(`${direction} advances exactly one; undo restores original position and experimental state`, () => {
    const initial = createExplore(["a", "b", "c"], 1);
    const moved = reduceExplore(initial, advance(initial, direction), 2);
    assert.equal(moved.position, 1);
    assert.equal(moved.records.a.encountered, true);
    assert.equal(moved.records.a.discarded, direction !== "up");
    const undone = reduceExplore(moved, { type: "undo" });
    assert.equal(undone.position, 0);
    assert.deepEqual(undone.records, initial.records);
    assert.deepEqual(undone.history, []);
  });
}

test("revisiting doesn't change marks; undo restores the prior mark; restores cannot be resurrected by old undo", () => {
  let s = createExplore(["a", "b"]);
  s = reduceExplore(s, advance(s, "right"));
  s = reduceExplore(s, { type: "back" });
  assert.equal(s.records.a.discarded, true);
  s = reduceExplore(s, advance(s));
  s = reduceExplore(s, { type: "undo" });
  assert.equal(s.records.a.discarded, true);
  s = reduceExplore(s, { type: "restore", id: "a" });
  assert.equal(s.records.a.discarded, false);
  assert.equal(
    s.history.some((h) => h.id === "a"),
    false,
  );
  assert.equal(s.records.a.encountered, true);
});

test("missing/loading photos can advance without being counted as explored or discarded, and can be retried", () => {
  let s = createExplore(["missing", "cloud", "ok"]);
  assert.equal(reduceExplore(s, advance(s, "left", false)), s);
  s = reduceExplore(s, advance(s, "up", false));
  s = reduceExplore(s, advance(s, "up", false));
  s = reduceExplore(s, advance(s, "right"));
  assert.equal(s.position, 3);
  assert.deepEqual(exploreCounts(s), { explored: 1, discarded: 1, untouched: 0, unavailable: 2 });
  s = reduceExplore(s, { type: "back" });
  s = reduceExplore(s, { type: "back" });
  s = reduceExplore(s, advance(s, "up", true));
  assert.deepEqual(exploreCounts(s), { explored: 2, discarded: 1, untouched: 1, unavailable: 1 });
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
  assert.match(native, /blocksExternalGesture/);
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
  assert.equal(s.position, 1);
  assert.deepEqual(Object.keys(s.records), ["a"]);
  s = await store.change(advance(s, "right"));
  s = await store.change(advance(s));
  assert.deepEqual(exploreCounts(s), { explored: 3, discarded: 2, untouched: 1, unavailable: 0 });
  const persisted = structuredClone(s);
  app = await boot(db, p);
  store = storeFor(app, p).exploreStore;
  assert.deepEqual(await store.load(), persisted);
  s = await store.change({ type: "restore", id: "a" });
  assert.equal(exploreCounts(s).discarded, 1);
  s = await store.change({ type: "restoreAll" });
  assert.equal(exploreCounts(s).discarded, 0);
  assert.equal(s.position, 3);
  assert.deepEqual(s.history, []);
  p.library.delete("a");
  s = await store.change({ type: "restart" });
  assert.deepEqual(s.ids, originalIds);
  assert.deepEqual(s.records, {});
  assert.equal(s.position, 0);
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

test("undo is bounded at 200 actions, restart preserves instructions and snapshot", () => {
  let s = createExplore(["a", "b"]);
  s = reduceExplore(s, { type: "dismissInstructions" });
  for (let i = 0; i < 250; i++) {
    s = reduceExplore(s, advance(s));
    s = reduceExplore(s, { type: "back" });
  }
  assert.equal(s.history.length, 200);
  s = reduceExplore(s, { type: "restart" });
  assert.deepEqual(s.ids, ["a", "b"]);
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
  assert.doesNotMatch(service, /storage\.put|repository\.(decide|setDecision|update|skip|start)/);
});
