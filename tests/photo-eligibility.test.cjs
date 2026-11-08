const test = require("node:test");
const assert = require("node:assert/strict");
const { makeLoader } = require("./loader.cjs");
const { DatabaseSync, media, platform, boot } = require("./native-harness.cjs");
const load = makeLoader();
const { curate } = load("lib/pictopia/curation.ts");
const games = load("lib/pictopia/pitstops.ts");
const { matches } = load("lib/pictopia/logic.ts");
const now = new Date(2026, 9, 30, 12).getTime();
const photo = (id, i, screenshot = false) => {
  const created = new Date(2019 + i % 3, 9, 1 + i % 28, 12).getTime();
  return media(id, { created, modified: created, month: `${2019 + i % 3}-10`, day: `10-${String(1+i%28).padStart(2,"0")}`, screenshot });
};
const pool = [...Array.from({length:90}, (_, i) => photo(`shot${i}`, i, true)), ...Array.from({length:60}, (_, i) => photo(`photo${i}`, i))];

test("all photo adventure kinds filter before curation; Screenshot Sweep retains screenshots", () => {
  const ctx = { seed: 9, now, explored: new Set() };
  for (const kind of ["year", "month", "capsule", "day", "detour", "random", "corners"]) {
    const result = curate({ kind, source: kind === "day" ? "day:10-01" : `${kind}:2019`, pool }, ctx);
    assert.ok(result, kind);
    assert.ok(result.ids.length >= (kind === "day" ? 1 : 3), kind);
    assert.ok(result.ids.every(id => id.startsWith("photo")), kind);
    assert.equal(curate({ kind, source: kind === "day" ? `day:${pool.find(m => !m.screenshot).day}` : `${kind}:2019`, pool: pool.filter(m => m.screenshot) }, ctx), undefined, kind);
  }
  const sweep = curate({ kind: "screenshots", source: "screenshots", pool }, ctx);
  assert.ok(sweep.ids.length >= 10);
  assert.ok(sweep.ids.every(id => id.startsWith("shot")));
});

test("Guess the Year, Which Came First, Memory Match all reject identified screenshots at their entry points", () => {
  assert.ok(games.guessRounds(pool, 10, now).every(round => round.id.startsWith("photo")));
  assert.ok(games.orderRounds(pool, 10).every(round => round.ids.every(id => id.startsWith("photo"))));
  const deck = games.memoryDeck(pool, 10, 6);
  assert.equal(deck.length, 12);
  assert.ok(deck.every(id => games.cardPhoto(id).startsWith("photo")));
  assert.equal(games.memoryDeck(pool.filter(m => m.screenshot), 10).length, 0);
  assert.equal(matches(pool[0], { screenshot: false }), false);
  assert.equal(matches(pool[0], { screenshot: true }), true);
  assert.equal(matches(pool[0], {}), true, "ordinary cleanup queries still include screenshots");
});

for (const os of ["ios", "android"]) test(`${os} SQLite queries filter before LIMIT; screenshot-heavy libraries still generate full photo sessions`, async () => {
  const db = new DatabaseSync(":memory:");
  const rows = [...Array.from({ length: 800 }, (_, i) => photo(`s${i}`, i, true)), ...Array.from({ length: 72 }, (_, i) => photo(`p${i}`, i))];
  // Put every screenshot newer than the real photos, so a post-LIMIT filter would fail.
  rows.filter(m => m.screenshot).forEach(m => { m.created += 4 * 365 * 86400000; });
  const p = platform({ os, library: rows.map(m => m.id) });
  const app = await boot(db, p); await app.storage.put(rows);
  const loader = makeLoader({ ...p.mocks, "./repository": { storage: app.storage, serialize: app.serialize }, "./media": { mediaService: app.mediaService } });
  const store = loader("services/adventures.ts").adventureStore;
  const pitstops = loader("services/pitstops.ts").pitStopStore;
  assert.equal((await app.storage.query({ type: "photo", screenshot: false, limit: 40 })).length, 40);
  const capacity = await pitstops.library(); assert.equal(capacity.photos, 72);
  const home = await store.home(9);
  assert.equal(home.slots.length, 2);
  for (const slot of home.slots) assert.ok(slot.session.ids.every(id => slot.adventure.kind === "screenshots" ? id.startsWith("s") : id.startsWith("p")));
  const historical = await store.choose({ kind: "year", year: "2019" }, 1);
  assert.ok(historical.count >= 10);
  const session = await app.storage.getValue(`adventure:${historical.id}:explore`);
  assert.ok(session.ids.every(id => id.startsWith("p")));
  for (const game of ["guessYear", "whichFirst", "memoryMatch"]) {
    const sample = await pitstops.sample(game, 9);
    assert.ok(sample.length >= 6);
    assert.ok(sample.every(m => !m.screenshot));
  }
  const sweep = await store.choose({ kind: "screenshots" }, 1);
  assert.ok(sweep.count >= 10);
  const sweepSession = await app.storage.getValue(`adventure:${sweep.id}:explore`);
  assert.ok(sweepSession.ids.every(id => id.startsWith("s")));
  // Already-generated mixed sessions are retired intact, including their saved decisions.
  await store.open(historical.id);
  const poisoned = { ...session, ids: [...session.ids, "s0"] };
  await app.storage.setValue(`adventure:${historical.id}:explore`, poisoned);
  assert.equal(await store.validPhotoOffer(historical.id), false);
  await assert.rejects(store.open(historical.id), /screenshots/);
  assert.ok(!(await store.unfinished()).some(slot => slot.adventure.id === historical.id));
  assert.deepEqual(await app.storage.getValue(`adventure:${historical.id}:explore`), poisoned);
  for (const m of rows) assert.deepEqual(await app.storage.get(m.id), m);
  assert.deepEqual(p.requests, []);
  db.close();
});

for (const scenario of ["ios-module", "ios-fallback", "ios-module-failed", "ios-module-partial", "android-module", "android-album"]) test(`screenshot detection: ${scenario} uses metadata, not name or dimensions`, async () => {
  const os = scenario.startsWith("ios") ? "ios" : "android";
  const asset = id => ({ id, uri: "ph://"+id, filename: "IMG_1234.PNG", mediaType: "photo", creationTime: now, modificationTime: now, width: 1170, height: 2532, duration: 0, albumId: id === "s" ? "shots" : "camera" });
  const module = scenario.endsWith("fallback") || scenario.endsWith("album") ? null : { getMetadata: async () => {
    if (scenario.endsWith("failed")) throw Error("Unavailable");
    return scenario.endsWith("partial") ? [] : [{ id: "s", screenshot: true, favorite: false }, { id: "p", screenshot: false, favorite: false }];
  } };
  const loader = makeLoader({
    "react-native": { Platform: { OS: os }, Linking: {} },
    "expo-file-system": { File: class {} },
    "expo-modules-core": { requireOptionalNativeModule: () => module },
    "expo-media-library": {
      getAssetsAsync: async () => ({ assets: [asset("s"), { ...asset("p"), filename: "Screenshot_portrait.png" }], hasNextPage: false, totalCount: 2 }),
      getAssetInfoAsync: async id => ({ ...asset(id), mediaSubtypes: id === "s" ? ["screenshot"] : [], isFavorite: false }),
      getAlbumsAsync: async () => [{ id: "shots", title: "Screenshots" }, { id: "camera", title: "Camera" }],
    },
  });
  const { mediaService } = loader("services/media.native.ts");
  const synced = [];
  await mediaService.sync(async page => synced.push(...page), () => {}, new AbortController().signal);
  assert.equal(synced.find(m => m.id === "s").screenshot, true);
  assert.equal(synced.find(m => m.id === "p").screenshot, false, "same dimensions and screenshot-like filename do not identify a screenshot");
});


test("IndexedDB also excludes screenshots before limits and from photo capacity", async () => {
  require("fake-indexeddb/auto");
  const { storage } = makeLoader()("services/storage.web.ts");
  await storage.init(); await storage.put(pool);
  const photos = await storage.query({ type: "photo", screenshot: false, limit: 18 });
  assert.equal(photos.length, 18); assert.ok(photos.every(m => !m.screenshot));
  assert.equal((await storage.months(true)).reduce((sum, m) => sum + m.photos, 0), 60);
  assert.equal((await storage.query({ screenshot: true, limit: 100 })).length, 90);
});

test("a metadata failure on resync cannot clear an identified screenshot", async () => {
  const db = new DatabaseSync(":memory:");
  const p = platform({ library: ["s"] });
  const app = await boot(db, p);
  const original = photo("s", 0, true);
  await app.storage.put([original]);
  await app.repository.ingest([{ ...original, screenshot: false }], 42);
  assert.equal((await app.storage.get("s")).screenshot, true);
  assert.deepEqual(p.requests, []);
  db.close();
});


test("screenshot-only libraries keep Screenshot Sweep and expose no photo-game capacity", async () => {
  const db = new DatabaseSync(":memory:");
  const rows = pool.filter(m => m.screenshot);
  const p = platform({ library: rows.map(m => m.id) });
  const app = await boot(db, p); await app.storage.put(rows);
  const loader = makeLoader({ ...p.mocks, "./repository": { storage: app.storage, serialize: app.serialize }, "./media": { mediaService: app.mediaService } });
  const adventures = loader("services/adventures.ts").adventureStore;
  const games = loader("services/pitstops.ts").pitStopStore;
  assert.equal((await games.library()).photos, 0);
  assert.deepEqual(await games.sample("memoryMatch", 1), []);
  const home = await adventures.home(1);
  assert.ok(home.slots.length > 0);
  assert.ok(home.slots.every(slot => slot.adventure.kind === "screenshots"));
  assert.equal(await adventures.choose({ kind: "year", year: "2019" }, 1), undefined);
  assert.ok(await adventures.choose({ kind: "screenshots" }, 1));
  assert.deepEqual(p.requests, []);
  db.close();
});
