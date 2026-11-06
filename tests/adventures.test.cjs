const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { makeLoader } = require("./loader.cjs");
const { DatabaseSync, media, platform, boot } = require("./native-harness.cjs");
const load = makeLoader();
const { adventureProgress, adventureComplete, ADVENTURE_SIZE } = load("lib/pictopia/adventures.ts");
const { curate, choosePair, planCandidates, bursts, similarity } = load("lib/pictopia/curation.ts");
const { createExplore, reduceExplore } = load("lib/pictopia/explore.ts");

const at = (year, month, day = 10, minute = 0) => new Date(year, month - 1, day, 12, minute).getTime();
const pad = (n) => String(n).padStart(2, "0");
const photo = (id, year, month, extra = {}) => {
  const created = extra.created ?? at(year, month);
  const d = new Date(created);
  return media(id, {
    created,
    modified: created,
    month: `${year}-${pad(month)}`,
    day: `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    ...extra,
  });
};
const ctx = (extra = {}) => ({ seed: 7, explored: new Set(), now: at(2026, 10, 30), ...extra });

test("Adventures are short: about 18 photos, never 100", () => {
  assert.ok(ADVENTURE_SIZE >= 15 && ADVENTURE_SIZE <= 20);
  const pool = [];
  for (let d = 1; d <= 28; d++) for (let i = 0; i < 6; i++) pool.push(photo(`m${d}-${i}`, 2016, 10, { created: at(2016, 10, d, i * 10) }));
  const a = curate({ kind: "capsule", source: "month:2016-10", pool }, ctx());
  assert.equal(a.ids.length, ADVENTURE_SIZE);
});

test("bursts collapse to one moment; a capsule spreads across days and runs chronologically", () => {
  const pool = [];
  // Day 3: a 10-shot burst. Days 5–20: a few shots each, far apart.
  for (let i = 0; i < 10; i++) pool.push(photo(`burst-${i}`, 2016, 10, { created: at(2016, 10, 3) + i * 2000 }));
  for (let d = 5; d <= 20; d++) for (let i = 0; i < 3; i++) pool.push(photo(`d${d}-${i}`, 2016, 10, { created: at(2016, 10, d, i * 30) }));
  assert.equal(bursts(pool.slice(0, 10)).length, 1);
  const a = curate({ kind: "capsule", source: "month:2016-10", pool }, ctx());
  assert.equal(a.ids.filter((id) => id.startsWith("burst")).length, 1, "no repetitive burst");
  const byId = new Map(pool.map((m) => [m.id, m]));
  const times = a.ids.map((id) => byId.get(id).created);
  assert.deepEqual(times, [...times].sort((x, y) => x - y), "chronological");
  assert.ok(new Set(a.ids.map((id) => byId.get(id).day)).size >= 15, "spread across days");
  assert.match(a.hint.detail, /2016 · \d+ photos across \d+ days/);
  assert.equal(a.hint.title, "Time Capsule", "permanent name, never an invented title");
  assert.doesNotMatch(a.hint.detail + a.hint.title, /beach|trip|holiday|Paris|party/i, "no invented places or themes");
  for (const d of Object.values(a.diagnostics.scores)) assert.ok(d >= 0 && d <= 1);
  assert.ok(a.diagnostics.selection.length && a.diagnostics.sequencing && a.diagnostics.limitations.length);
});

test("ineligible and explored photos are left out of offers", () => {
  const pool = [];
  for (let d = 1; d <= 25; d++) pool.push(photo(`p${d}`, 2019, 4, { created: at(2019, 4, d) }));
  pool.push(
    photo("video", 2019, 4, { type: "video", created: at(2019, 4, 26) }),
    photo("queued", 2019, 4, { decision: "delete", created: at(2019, 4, 27) }),
    photo("gone", 2019, 4, { active: false, created: at(2019, 4, 28) }),
    photo("deleted", 2019, 4, { deletedAt: 1, created: at(2019, 4, 29) }),
    photo("blocked", 2019, 4, { created: at(2019, 4, 30) }),
  );
  const explored = new Set(["p1", "p2", "p3"]);
  const a = curate({ kind: "capsule", source: "month:2019-04", pool }, ctx({ explored, exclude: new Set(["blocked"]) }));
  for (const bad of ["video", "queued", "gone", "deleted", "blocked", ...explored]) assert.ok(!a.ids.includes(bad), bad);
  assert.equal(curate({ kind: "capsule", source: "month:2019-04", pool: pool.slice(0, 5) }, ctx()).ids.length, 5, "short offers need no padding");
  assert.equal(curate({ kind: "capsule", source: "month:2019-04", pool: pool.slice(0, 2) }, ctx()), undefined);
  assert.ok(curate({ kind: "month", source: "month:2019-04", pool: pool.slice(0, 5) }, ctx({ chosen: true })), "but can be chosen");
});

test("the detour twists through years: never the same year twice in a row", () => {
  const pool = [];
  for (const y of [2012, 2014, 2016, 2018, 2020, 2022]) for (let m = 1; m <= 12; m += 3) for (let d = 1; d <= 3; d++) pool.push(photo(`${y}-${m}-${d}`, y, m, { created: at(y, m, d * 5) }));
  const a = curate({ kind: "detour", source: "detour", pool }, ctx({ size: 15 }));
  assert.equal(a.ids.length, 15);
  const years = a.ids.map((id) => id.slice(0, 4));
  assert.equal(new Set(years).size, 6, "every year has a voice");
  for (let i = 1; i < years.length; i++) assert.notEqual(years[i], years[i - 1]);
  assert.match(a.hint.detail, /from 6 different years/);
  // Stable for a seed.
  assert.deepEqual(curate({ kind: "detour", source: "detour", pool }, ctx({ size: 15 })).ids, a.ids);
});

test("hidden corners keep quick series together and leave favorites out of cleanup", () => {
  const pool = [];
  for (let d = 1; d <= 20; d++) pool.push(photo(`c${d}`, 2018, 3, { created: at(2018, 3, d) }));
  for (let i = 0; i < 3; i++) pool.push(photo(`run-${i}`, 2018, 3, { created: at(2018, 3, 21) + i * 3000 }));
  for (let i = 0; i < 3; i++) pool.push(photo(`fav-${i}`, 2018, 3, { favorite: true, created: at(2018, 3, 22) + i * 3000 }));
  pool.push(photo("shot", 2018, 3, { screenshot: true, created: at(2018, 3, 23) }));
  const a = curate({ kind: "corners", source: "corners:2018-03", pool }, ctx());
  const runAt = a.ids.indexOf("run-0");
  assert.deepEqual(a.ids.slice(runAt, runAt + 3), ["run-0", "run-1", "run-2"], "series side by side");
  assert.ok(!a.ids.includes("shot"), "Hidden Corners is a photograph experience");
  assert.ok(a.ids.filter((id) => id.startsWith("fav")).length <= 1, "favorites aren't served as a series to clean");
  assert.ok(a.diagnostics.scores.cleanup > 0);
  assert.match(a.hint.detail, /taken seconds apart/);
});

test("On This Day widens its window only when needed, and says so", () => {
  const near = [];
  for (const y of [2015, 2017, 2019, 2021, 2023]) for (let i = 0; i < 3; i++) near.push(photo(`n${y}-${i}`, y, 10, { created: at(y, 10, 30, i * 20) }));
  near.push(photo("this-year", 2026, 10, { created: at(2026, 10, 30) }));
  const exact = curate({ kind: "day", source: "day:10-30", pool: near }, ctx());
  assert.ok(!exact.ids.includes("this-year"), "earlier years only");
  assert.match(exact.hint.detail, /across 5 years/);
  assert.doesNotMatch(exact.hint.detail, /Within/);
  const wide = [];
  for (const y of [2015, 2017, 2019, 2021]) for (let d = 26; d <= 28; d++) wide.push(photo(`w${y}-${d}`, y, 10, { created: at(y, 10, d) }));
  const widened = curate({ kind: "day", source: "day:10-30", pool: wide }, ctx());
  assert.match(widened.hint.detail, /Within 3 days of/);
});

test("pairs are optimized together: near-twins lose to a different kind", () => {
  const mk = (kind, source, total, ids) => ({ kind, source, ids, hint: { title: source, detail: "" }, closing: "", diagnostics: { total } });
  const y1 = mk("year", "year:2019", 0.8, ["a", "b"]);
  const y2 = mk("year", "year:2019b", 0.79, ["c", "d"]);
  const shots = mk("screenshots", "screenshots", 0.6, ["e"]);
  const pair = choosePair([y1, y2, shots]);
  assert.deepEqual(pair.map((p) => p.source).sort(), ["screenshots", "year:2019"].sort());
  assert.ok(pair[0].diagnostics.pairing);
  assert.ok(similarity(y1, y2) > similarity(y1, shots));
  assert.equal(choosePair([y2, shots], y1)[0].source, "screenshots", "best partner for the one on Home");
});

test("planning reads only what the month index supports", () => {
  const months = [
    { key: "2019-07", count: 60, reviewed: 0, explored: 0 },
    { key: "2019-03", count: 10, reviewed: 0, explored: 0 },
    { key: "2016-10", count: 30, reviewed: 30, explored: 0 },
  ];
  const plans = planCandidates(months, { now: at(2026, 10, 30), seed: 1, screenshots: false });
  const kinds = plans.map((p) => p.kind);
  assert.ok(kinds.includes("capsule") && kinds.includes("detour") && kinds.includes("day") && kinds.includes("corners"));
  assert.ok(!kinds.includes("screenshots"));
  assert.equal(plans.find((p) => p.kind === "capsule").source, "month:2019-07", "the untouched cluster ranks first");
  assert.deepEqual(planCandidates([], { now: 0, seed: 1, screenshots: false }).filter((p) => p.kind !== "day"), []);
});

test("progress counts each photo once across adventures; set aside is current provisional marks", () => {
  let a = createExplore(["x", "y", "z"]);
  a = reduceExplore(a, { type: "page", id: "x", revision: 0, toId: "y", availableIds: ["x"] });
  a = reduceExplore(a, { type: "discard", id: "y", revision: a.revision, direction: "left" });
  let b = createExplore(["x", "w"]);
  b = reduceExplore(b, { type: "page", id: "x", revision: 0, toId: "w", availableIds: ["x"] });
  // Scrolling back and forth again doesn't count twice.
  b = reduceExplore(b, { type: "back" });
  b = reduceExplore(b, { type: "page", id: "x", revision: b.revision, toId: "w", availableIds: ["x"] });
  const p = adventureProgress([a, b, undefined]);
  assert.equal(p.explored, 2, "x and y, once each");
  assert.equal(p.setAside, 1);
  a = reduceExplore(a, { type: "restore", id: "y" });
  assert.equal(adventureProgress([a, b]).setAside, 0);
  assert.equal(adventureComplete(createExplore([])), true);
  assert.equal(adventureComplete(a), false);
});

function services(app, p) {
  const mocks = {
    ...p.mocks,
    "./repository": { storage: app.storage, serialize: app.serialize, deletionGuard: app.deletionGuard, firstSeenUpdates: app.firstSeenUpdates, activityValues: app.activityValues, DAILY_ACTIVITY: app.DAILY_ACTIVITY },
    "./media": { mediaService: app.mediaService },
  };
  const loader = makeLoader(mocks);
  const explore = loader("services/explore.ts");
  // One loader instance, so the Adventure service shares this explore module.
  return { ...loader("services/adventures.ts"), explore };
}
function library() {
  const rows = [];
  for (const [year, months] of [
    [2017, [2, 5, 8, 11]],
    [2019, [1, 4, 7, 10]],
    [2023, [3, 6, 9, 12]],
  ])
    for (const m of months)
      for (let i = 0; i < 12; i++)
        rows.push(photo(`${year}-${m}-${i}`, year, m, { created: at(year, m, i + 1), screenshot: i < 2 }));
  return rows;
}

test("native SQLite: two distinct, stable adventures; resume across relaunch; completion refills; nothing deleted", async () => {
  const db = new DatabaseSync(":memory:");
  const rows = library();
  rows.push(photo("queued", 2019, 4, { decision: "delete" }), photo("pending", 2019, 4));
  const p = platform({ library: rows.map((m) => m.id) });
  let app = await boot(db, p);
  const production = { id: "production", position: 3 };
  await app.storage.put(rows, { session: production, deletionPending: [{ id: "pending" }] });
  let s = services(app, p);
  const first = await s.adventureStore.home(11);
  assert.equal(first.slots.length, 2);
  const [A, B] = first.slots;
  assert.notEqual(A.adventure.source, B.adventure.source);
  assert.ok(A.session.ids.every((id) => !B.session.ids.includes(id)), "no shared photos");
  for (const slot of first.slots) {
    assert.ok(slot.session.ids.length >= 10 && slot.session.ids.length <= ADVENTURE_SIZE);
    assert.ok(slot.adventure.diagnostics.why.length, "explains itself");
    assert.equal(slot.session.instructionsDismissed, true, "no instruction screen");
    assert.ok(!slot.session.ids.includes("queued") && !slot.session.ids.includes("pending"));
    assert.equal(slot.adventure.count, slot.session.ids.length);
    assert.ok(slot.adventure.hint.title && slot.adventure.hint.detail);
  }
  // Coming back to Home shows the same two, with the same photos in the same order.
  const again = await s.adventureStore.home(99);
  assert.deepEqual(
    again.slots.map((x) => [x.adventure.id, x.session.ids]),
    first.slots.map((x) => [x.adventure.id, x.session.ids]),
  );
  // Begin A, explore a few, set one aside.
  await s.adventureStore.open(A.adventure.id);
  const store = s.explore.exploreStoreFor(s.adventureSessionKey(A.adventure.id));
  let session = await store.load();
  for (let i = 0; i < 5; i++) {
    await store.change((c) => ({ type: "seen", id: c.activeId }));
    session = await store.change((c) => ({
      type: "page",
      id: c.activeId,
      revision: c.revision,
      toId: c.ids[c.ids.indexOf(c.activeId) + 1],
      availableIds: c.ids,
    }));
  }
  session = await store.change((c) => ({ type: "discard", id: c.activeId, revision: c.revision, direction: "right" }));
  const saved = structuredClone(session);
  // Relaunch: place, marks and undo (with its side) are all still there.
  app = await boot(db, p);
  s = services(app, p);
  const resumed = await s.adventureStore.home(5);
  assert.equal(resumed.slots[0].adventure.id, A.adventure.id, "still in slot A");
  assert.ok(resumed.slots[0].adventure.startedAt);
  assert.deepEqual(resumed.slots[0].session, saved);
  assert.deepEqual(saved.history.map((h) => h.direction), ["right"]);
  assert.deepEqual(await s.adventureStore.progress(), { explored: 6, setAside: 1 });
  const setAside = await s.adventureStore.setAside();
  assert.equal(setAside.length, 1);
  // Finish A: Home replaces it with a new adventure unlike B and unlike A.
  const done = s.explore.exploreStoreFor(s.adventureSessionKey(A.adventure.id));
  let endpoint = await done.load();
  await done.change({ type: "page", id: endpoint.activeId, revision: endpoint.revision, toId: endpoint.ids.at(-1), availableIds: endpoint.ids });
  await done.change({ type: "seen", id: endpoint.ids.at(-1) });
  await done.change({ type: "finish" });
  const refilled = await s.adventureStore.home(23);
  assert.equal(refilled.slots.length, 2);
  assert.equal(refilled.slots[1].adventure.id, B.adventure.id, "B is untouched");
  const C = refilled.slots[0].adventure;
  assert.ok(![A.adventure.source, B.adventure.source].includes(C.source), "not offered again");
  assert.ok(refilled.slots[0].session.ids.every((id) => !saved.ids.slice(0, 6).includes(id)), "explored photos aren't reoffered");
  // A's set-aside photo is still reviewable and restorable after A left Home.
  await s.adventureStore.restore(setAside[0]);
  assert.equal((await s.adventureStore.progress()).setAside, 0);
  // After restoration the queue is unchanged; browsing never marked other photos kept.
  assert.deepEqual(await app.storage.getValue("session"), production);
  assert.deepEqual(await app.storage.getValue("deletionPending"), [{ id: "pending" }]);
  for (const m of rows) {
    const { firstSeenAt, ...unchanged } = await app.storage.get(m.id);
    assert.ok(firstSeenAt === undefined || firstSeenAt > 0);
    assert.deepEqual(unchanged, m);
  }
  assert.deepEqual(p.requests, [], "the native delete API was never invoked");
  assert.equal(p.library.size, rows.length);
  db.close();
});

test("Explore: a chosen Adventure doesn't take a Home slot; it waits in Continue until finished", async () => {
  const db = new DatabaseSync(":memory:");
  const rows = library();
  const p = platform({ library: rows.map((m) => m.id) });
  const app = await boot(db, p);
  await app.storage.put(rows);
  const s = services(app, p);
  const before = (await s.adventureStore.home(3)).slots.map((x) => x.adventure.id);
  const shots = await s.adventureStore.choose({ kind: "screenshots" }, 1);
  assert.equal(shots.hint.title.length > 0, true);
  assert.ok(shots.chosen);
  const year = await s.adventureStore.choose({ kind: "year", year: "2017" }, 2);
  assert.deepEqual((await s.adventureStore.home(4)).slots.map((x) => x.adventure.id), before, "Home is Pictopia's choice");
  assert.deepEqual((await s.adventureStore.unfinished()).map((x) => x.adventure.id), [year.id, shots.id]);
  const store = s.explore.exploreStoreFor(s.adventureSessionKey(year.id));
  const endpoint = await store.load();
  await store.change({ type: "page", id: endpoint.activeId, revision: endpoint.revision, toId: endpoint.ids.at(-1), availableIds: endpoint.ids });
  await store.change({ type: "seen", id: endpoint.ids.at(-1) });
  await store.change({ type: "finish" });
  assert.deepEqual((await s.adventureStore.unfinished()).map((x) => x.adventure.id), [shots.id]);
  const choices = await s.adventureStore.choices(at(2026, 10, 30));
  assert.deepEqual(choices.years, ["2023", "2019", "2017"]);
  assert.equal(choices.screenshots, true);
  assert.equal(choices.detour, true);
  assert.equal(choices.day, true, "October photos exist in earlier years");
  assert.equal(await s.adventureStore.choose({ kind: "year", year: "1999" }, 7), undefined);
  // Lab experiments are frozen until regenerated; ratings personalize later curation.
  const lab = await s.adventureStore.generateLab("detour", 5);
  assert.ok(lab && lab.lab === "detour" && lab.count <= 15);
  assert.equal((await s.adventureStore.lab()).detour.adventure.id, lab.id);
  await s.adventureStore.setFeedback(lab, { ratings: { curiosity: 5, enjoyment: 4 } });
  assert.deepEqual((await s.adventureStore.feedback(lab.id)).ratings, { curiosity: 5, enjoyment: 4 });
  const again = await s.adventureStore.generateLab("detour", 6);
  assert.notEqual(again.id, lab.id);
  db.close();
});

test("tiny or empty libraries degrade gracefully", async () => {
  const db = new DatabaseSync(":memory:");
  const rows = Array.from({ length: 6 }, (_, i) => photo(`t${i}`, 2024, 2, { created: at(2024, 2, i + 1) }));
  const p = platform({ library: rows.map((m) => m.id) });
  const app = await boot(db, p);
  let s = services(app, p);
  assert.deepEqual((await s.adventureStore.home(1)).slots, [], "no photos: no adventures");
  await app.storage.put(rows);
  s = services(app, p);
  assert.ok((await s.adventureStore.home(1)).slots.every(slot => slot.session.ids.length <= 6), "short native offers need no padding");
  const chosen = await s.adventureStore.choose({ kind: "month", month: "2024-02" }, 1);
  assert.equal(chosen.count, 6, "but you can still choose them");
  db.close();
});

test("Home offers a real adventure when enough recent browser-style photos miss every themed plan", async () => {
  const db = new DatabaseSync(":memory:");
  const rows = Array.from({ length: 12 }, (_, i) => photo(`recent-${i}`, 2026, 10, { created: at(2026, 10, i + 1) }));
  const p = platform({ library: rows.map((m) => m.id) });
  const app = await boot(db, p);
  await app.storage.put(rows);
  const s = services(app, p);
  const offers = await s.adventureStore.home(at(2026, 10, 15));
  assert.equal(offers.slots.length, 1);
  assert.equal(offers.slots[0].adventure.kind, "random");
  assert.equal(offers.slots[0].session.ids.length, rows.length);
  assert.deepEqual((await s.adventureStore.home(at(2026, 10, 16))).slots.map(slot => slot.adventure.id), offers.slots.map(slot => slot.adventure.id));
  db.close();
});

test("browser Home offers a short review and can revisit explored photos without queued ones", async () => {
  const db = new DatabaseSync(":memory:");
  const rows = Array.from({ length: 8 }, (_, i) => photo(`web-${i}`, 2026, 10, {
    created: at(2026, 10, i + 1), decision: i >= 6 ? "delete" : undefined,
  }));
  const p = platform({ os: "web", library: rows.map((m) => m.id) });
  const app = await boot(db, p);
  await app.storage.put(rows);
  for (const row of rows) await app.storage.setValue(`file:${row.id}`, { name: row.name });
  const s = services(app, p);
  const first = (await s.adventureStore.home(1)).slots;
  assert.equal(first.length, 2);
  assert.notEqual(first[0].adventure.kind, first[1].adventure.kind);
  assert.ok(first.every(slot => slot.session.ids.length > 0 && slot.session.ids.length <= 3));
  assert.ok(first.every(slot => slot.session.ids.every(id => !["web-6", "web-7"].includes(id))));
  await s.adventureStore.open(first[0].adventure.id);
  const review = s.explore.exploreStoreFor(s.adventureSessionKey(first[0].adventure.id));
  for (let i = 0; i < first[0].session.ids.length; i++) {
    const current = await review.load();
    await review.change({ type: "seen", id: current.activeId });
    if (i < first[0].session.ids.length - 1) {
      const afterSeen = await review.load();
      await review.change({ type: "page", id: afterSeen.activeId, revision: afterSeen.revision,
        toId: first[0].session.ids[i + 1], availableIds: first[0].session.ids });
    }
  }
  await review.change({ type: "finish" });
  const next = (await s.adventureStore.home(2)).slots;
  assert.equal(next.length, 2);
  assert.equal(next[1].adventure.id, first[1].adventure.id);
  assert.notEqual(next[0].adventure.id, first[0].adventure.id);
  assert.deepEqual(p.requests, [], "creating reviews never requests deletion");
  db.close();
});

test("browser modification timestamps do not collapse selected photos into one burst", () => {
  const stamp = at(2026, 10, 10);
  const pool = Array.from({ length: 12 }, (_, i) => photo(`import-${i}`, 2026, 10, { created: stamp }));
  const candidate = { kind: "random", source: "library:all", pool };
  assert.equal(curate(candidate, ctx()), undefined, "capture times still collapse a real burst");
  const offer = curate(candidate, ctx({ modifiedDates: true }));
  assert.equal(offer.ids.length, 12);
  assert.match(offer.hint.detail, /12 photos/);
});

test("the Adventure flow exposes no deletion path and never writes media or production state", () => {
  for (const file of [
    "services/adventures.ts",
    "lib/pictopia/adventures.ts",
    "app/adventure-choose.tsx",

    "app/adventure-lab.tsx",
    "lib/pictopia/curation.ts",
    "components/pictopia/adventure-finish.tsx",
    "app/set-aside.tsx",
    "components/pictopia/use-adventures.ts",
  ]) {
    const source = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(
      source,
      /deleteQueue|deleteMarked|mediaService\.remove\(|deleteAssetsAsync|setDecision\(|storage\.put\((?!\[\],)|repository\.(decide|update|skip|start)|app\.start\(/,
      file,
    );
  }
  const home = fs.readFileSync("app/(tabs)/home.tsx", "utf8");
  assert.doesNotMatch(home, /deleteQueue|deleteMarked|mediaService\.remove\(|deleteAssetsAsync|setDecision\(|storage\.put\((?!\[\],)|repository\.(decide|update|skip|start)/, "Home starts existing review flows without deciding or deleting media");
  assert.doesNotMatch(home, /MediaImage|<Image/, "no photo previews on Home");
  assert.doesNotMatch(home, /\b(?:freed|bytes|MB|GB)\b/i, "no storage claims");
});


test("refresh gives two new sources and photos, preserving started Adventures in Continue", async () => {
  const db = new DatabaseSync(":memory:");
  const rows = library();
  const p = platform({ library: rows.map(m => m.id) });
  const app = await boot(db, p);
  await app.storage.put(rows);
  const s = services(app, p);
  const first = await s.adventureStore.home(2);
  await s.adventureStore.open(first.slots[0].adventure.id);
  const before = first.slots[0].session;
  const next = await s.adventureStore.refresh(8);
  assert.equal(next.unchanged, false);
  assert.equal(next.slots.length, 2);
  const sources = first.slots.map(slot => slot.adventure.source);
  const ids = new Set(first.slots.flatMap(slot => slot.session.ids));
  for (const slot of next.slots) {
    assert.ok(!sources.includes(slot.adventure.source));
    assert.ok(slot.session.ids.every(id => !ids.has(id)));
  }
  assert.ok(next.slots[0].session.ids.every(id => !next.slots[1].session.ids.includes(id)));
  const parked = (await s.adventureStore.unfinished()).find(slot => slot.adventure.id === first.slots[0].adventure.id);
  assert.deepEqual(parked.session, before);
  assert.deepEqual((await s.adventureStore.home(99)).slots.map(x => x.adventure.id), next.slots.map(x => x.adventure.id));
  for (const row of rows) assert.deepEqual(await app.storage.get(row.id), row);
  assert.deepEqual(p.requests, []);
  db.close();
});

test("refresh retains the existing offer when a small library cannot supply two fresh options", async () => {
  const db = new DatabaseSync(":memory:");
  const rows = Array.from({ length: 12 }, (_, i) => photo(`small${i}`, 2024, 2, { created: at(2024, 2, i + 1) }));
  const p = platform({ library: rows.map(m => m.id) });
  const app = await boot(db, p);
  await app.storage.put(rows);
  const s = services(app, p);
  const first = await s.adventureStore.home(1);
  assert.ok(first.slots.length);
  await s.adventureStore.open(first.slots[0].adventure.id);
  const before = await app.storage.getValue(s.ADVENTURES_KEY);
  const next = await s.adventureStore.refresh(2);
  assert.equal(next.unchanged, true);
  assert.deepEqual(next.slots.map(x => x.adventure.id), first.slots.map(x => x.adventure.id));
  assert.deepEqual(await app.storage.getValue(s.ADVENTURES_KEY), before);
  assert.deepEqual(p.requests, []);
  db.close();
});

test("Pit Stop review uses only played, still-visible IDs and leaves all production decisions untouched", async () => {
  const db = new DatabaseSync(":memory:");
  const rows = library();
  rows[7].decision = "delete";
  const p = platform({ library: rows.map(m => m.id) });
  const app = await boot(db, p);
  await app.storage.put(rows);
  const s = services(app, p);
  const ids = rows.slice(0, 6).map(m => m.id);
  const adventure = await s.adventureStore.fromPhotos([...ids, ids[0], rows[7].id, "missing"], "Memory Match");
  assert.equal(adventure.kind, "pitstop");
  assert.equal(adventure.count, 4, "identified screenshots are excluded from the review too");
  const session = await s.explore.exploreStoreFor(s.adventureSessionKey(adventure.id)).load();
  assert.deepEqual(session.ids, rows.slice(0, 6).filter(m => !m.screenshot).map(m => m.id));
  assert.equal(session.instructionsDismissed, true);
  for (const row of rows) assert.deepEqual(await app.storage.get(row.id), row);
  assert.deepEqual(p.requests, []);
  db.close();
});

test("Yearbook: accessible years, sparse years and bounded month-spread curation", async () => {
  const db = new DatabaseSync(":memory:");
  const rows = [photo("one", 2010, 3), photo("two-a", 2011, 2), photo("two-b", 2011, 9),
    photo("hidden-year", 2009, 4, {active:false}), photo("shot-year", 2008, 4, {screenshot:true}),
    photo("video-year", 2007, 4, {type:"video"}), photo("undated", 2006, 4, {month:"unknown"})];
  for(let m=1;m<=12;m++) for(let d=1;d<=28;d++) for(let i=0;i<6;i++)
    rows.push(photo(`large-${m}-${d}-${i}`,2020,m,{created:at(2020,m,d,i*10)}));
  const p = platform({library:rows.filter(m=>m.active).map(m=>m.id)});
  const app = await boot(db,p); await app.storage.put(rows);
  const s=services(app,p), choices=await s.adventureStore.choices();
  assert.deepEqual(choices.years,["2020","2011","2010"]);
  assert.equal(choices.yearPhotos["2020"],2016);
  for(const [year,count] of [["2010",1],["2011",2],["2020",18]]) {
    const a=await s.adventureStore.choose({kind:"year",year},12);
    assert.equal(a.source,`year:${year}`); assert.equal(a.count,count);
    assert.equal(a.hint.title,"The Yearbook");
    const session=await s.explore.exploreStoreFor(s.adventureSessionKey(a.id)).load();
    assert.equal(session.ids.length,count);
    const selected=await app.storage.query({ids:session.ids,limit:18});
    assert.ok(selected.every(m=>m.month.startsWith(`${year}-`)));
    if(year==="2020") assert.equal(new Set(selected.map(m=>m.month)).size,12);
  }
  assert.equal(await s.adventureStore.choose({kind:"year",year:"20"}),undefined);
  db.close();
});

test("Yearbook: legacy rename, independent years and daily-limit restart preserve positions and queue", async () => {
  const db=new DatabaseSync(":memory:"),rows=library(),p=platform({library:rows.map(m=>m.id)});
  let app=await boot(db,p);await app.storage.put(rows,{deletionPending:[{id:"preserved"}]});
  let s=services(app,p);
  const a=await s.adventureStore.choose({kind:"year",year:"2017"},11);
  await s.adventureStore.open(a.id);
  const key=s.adventureSessionKey(a.id),store=s.explore.exploreStoreFor(key);
  let session=await store.load();
  await store.change({type:"seen",id:session.activeId});
  session=await store.load();
  await store.change({type:"discard",id:session.activeId,revision:session.revision,direction:"left"});
  session=await store.load();
  // Model a saved title from the previous release, without changing its identity/source.
  const old=await app.storage.getValue(`adventure:${a.id}`);
  await app.storage.setValue(`adventure:${a.id}`,{...old,hint:{...old.hint,title:"Time Machine"}});
  const b=await s.adventureStore.choose({kind:"year",year:"2019"},12);
  await s.adventureStore.open(b.id);assert.notEqual(a.id,b.id);
  let daily=makeLoader({...p.mocks,"./repository":app})("services/daily.ts").allowanceStore;
  const now=new Date(2026,10,5,12).getTime();
  for(let i=0;i<150;i++) await daily.present(`earlier-${i}`,false,now);
  assert.equal((await daily.present(session.activeId,false,now)).allowed,false);
  app=await boot(db,p);s=services(app,p);
  const resumed=await s.explore.exploreStoreFor(key).load();
  assert.deepEqual(resumed,session,"daily interruption and restart never move the review");
  const saved=await s.adventureStore.yearbooks();
  assert.deepEqual(new Set(saved.map(x=>x.adventure.source)),new Set(["year:2017","year:2019"]));
  assert.ok(saved.every(x=>x.adventure.hint.title==="The Yearbook"));
  assert.equal((await app.storage.getValue(`adventure:${a.id}`)).hint.title,"Time Machine","presentation rename is nondestructive");
  assert.equal((await app.storage.get(session.ids[0])).decision,"delete");
  assert.deepEqual(await app.storage.getValue("deletionPending"),[{id:"preserved"}]);
  daily=makeLoader({...p.mocks,"./repository":app})("services/daily.ts").allowanceStore;
  assert.equal((await daily.present(resumed.activeId,true,now)).allowed,true);
  assert.equal((await daily.present(resumed.activeId,false,now+86400000)).allowed,true);
  assert.deepEqual((await s.explore.exploreStoreFor(key).load()).ids,session.ids);
  assert.deepEqual(p.requests,[]);
  db.close();
});

test("Yearbook names keep stable catalog IDs and Time Capsule's automatic month behavior",()=>{
  const c=load("lib/pictopia/catalog.ts");
  assert.equal(c.catalogEntry("time-machine").name,"The Yearbook");
  assert.equal(c.catalogEntry("time-machine").blurb,"Pick a year. Rediscover the moments that made it memorable.");
  assert.equal(c.adventureLabel({kind:"year",source:"year:2017"}),"The Yearbook · 2017");
  assert.equal(c.adventureName("month"),"The Yearbook");
  assert.equal(c.adventureName("capsule"),"Time Capsule");
  const plans=planCandidates([{key:"2017-04",count:30,quiet:1}],{seed:4,now:at(2026,10,30),screenshots:false,recentSources:[]});
  assert.ok(plans.some(p=>p.kind==="capsule"&&p.source==="month:2017-04"));
});
