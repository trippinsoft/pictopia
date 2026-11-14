// Memory Wall: layout geometry, exact tile reveal, layout stability, and the shared progress
// model (confirmed deletions keep their credit) on both storage adapters.
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeLoader } = require("./loader.cjs");
const { DatabaseSync, media, platform, boot } = require("./native-harness.cjs");
const W = makeLoader()("lib/pictopia/memory-wall.ts");
const { libraryPercent, wallPercent } = makeLoader()("lib/pictopia/library-progress.ts");
const { worldMarkup, worldSvg } = makeLoader()("lib/pictopia/memory-wall-art.ts");

const month = (key, total, explored = 0, cleared = 0) => ({ key, total, explored, remaining: total - explored, cleared });
const sample = () => [
  ...[[2011, 120], [2012, 340], [2013, 610], [2014, 880], [2015, 1240], [2016, 1620], [2017, 2100], [2018, 2400], [2019, 2950], [2020, 1880], [2021, 3200], [2022, 3550], [2023, 4100], [2024, 4620], [2025, 5380], [2026, 3900]]
    .flatMap(([y, n]) => Array.from({ length: 12 }, (_, m) => month(`${y}-${String(m + 1).padStart(2, "0")}`, Math.floor(n / 12), Math.floor(n / 24)))),
  month("unknown", 210, 30),
];
const area = (r) => r.w * r.h;
const overlap = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

test("years partition the whole picture exactly, oldest first, undated last", () => {
  const wall = W.buildWall(sample());
  const keys = wall.years.map((y) => y.key);
  assert.deepEqual(keys, [...keys.slice(0, -1)].sort().concat("unknown"));
  const total = wall.years.reduce((n, y) => n + area(y.rect), 0);
  assert.ok(Math.abs(total - W.WALL_W * W.WALL_H) < 1e-6, "no gaps or overflow: closing the gaps rebuilds the picture");
  for (let i = 0; i < wall.years.length; i++) for (let j = i + 1; j < wall.years.length; j++) assert.ok(overlap(wall.years[i].rect, wall.years[j].rect) < 1e-6);
  for (const y of wall.years) {
    assert.ok(y.rect.x >= -1e-9 && y.rect.y >= -1e-9 && y.rect.x + y.rect.w <= W.WALL_W + 1e-6 && y.rect.y + y.rect.h <= W.WALL_H + 1e-6);
    assert.ok(y.rect.w >= 38 && y.rect.h >= 38, `${y.key} stays tappable (${y.rect.w.toFixed(0)}×${y.rect.h.toFixed(0)})`);
    const blocks = y.blocks.reduce((n, b) => n + area(b.rect), 0);
    assert.ok(Math.abs(blocks - area(y.rect)) < 1e-6, "months partition their year");
  }
  // Roughly proportional: the biggest year is clearly bigger than the smallest.
  const big = wall.years.find((y) => y.key === "2025"), small = wall.years.find((y) => y.key === "2011");
  assert.ok(area(big.rect) > area(small.rect) * 4);
});

test("revealed artwork matches progress exactly, never more tiles than photos", () => {
  for (const [total, explored, cleared] of [[1, 0, 0], [7, 3, 0], [100, 37, 0], [400, 100, 50], [2400, 1680, 0], [10, 10, 0], [0, 0, 5]]) {
    const block = { key: "2018-03", total, explored, cleared, rect: { x: 10, y: 20, w: 60, h: 40 } };
    const tiles = W.blockTiles(block, W.OVERVIEW_TILE);
    assert.ok(tiles.length <= Math.max(1, total + cleared), "tiles ≤ photos");
    const shown = tiles.reduce((n, t) => n + t.fill * t.w * t.h, 0) / area(block.rect);
    assert.ok(Math.abs(shown - W.revealFraction(block)) < 1e-9, `${explored + cleared}/${total + cleared} revealed`);
  }
});

test("a revisit keeps the same arrangement; drifting counts never reshuffle; a new year is added", () => {
  const first = W.buildWall(sample());
  const drift = sample().map((m) => (m.key.startsWith("2026") ? { ...m, total: m.total + 40, remaining: m.remaining + 40 } : m));
  const again = W.buildWall(drift, { rows: first.rows });
  assert.deepEqual(again.rows, first.rows);
  const grown = W.buildWall([...sample(), month("2027-01", 300)], { rows: first.rows });
  assert.ok(grown.rows.flat(2).includes("2027"));
  assert.equal(grown.rows.flat(2).at(-1), "unknown");
  assert.deepEqual(W.buildWall(sample()).rows, first.rows, "layout is deterministic");
});

test("year close-ups frame at least an Adventure-sized window around the year", () => {
  const wall = W.buildWall(sample());
  for (const y of wall.years) {
    const f = W.frameFor(y.rect);
    assert.ok(f.x <= y.rect.x + 1e-6 && f.y <= y.rect.y + 1e-6 && f.x + f.w >= y.rect.x + y.rect.w - 1e-6 && f.y + f.h >= y.rect.y + y.rect.h - 1e-6, `${y.key} fits its window`);
    assert.ok(f.w >= 150 - 1e-6 && f.h >= 128 - 1e-6 && f.x >= 0 && f.y >= 0 && f.x + f.w <= W.WALL_W + 1e-6 && f.y + f.h <= W.WALL_H + 1e-6);
  }
  const y2018 = wall.years.find((y) => y.key === "2018");
  assert.equal(W.nextBlock(y2018).key, "2018-01");
});

test("cover paths only include tiles still hidden", () => {
  const done = W.buildWall([month("2020-01", 50, 50), month("2020-02", 50, 50)]);
  const cover = W.coverPaths(done, W.OVERVIEW_TILE);
  assert.equal(cover.grout, "");
  const none = W.coverPaths(W.buildWall([month("2020-01", 50)]), W.OVERVIEW_TILE);
  assert.ok(none.grout.length > 0);
});

test("the artwork renders as one SVG with every colour defined", () => {
  const body = worldMarkup();
  assert.ok(body.length > 20000);
  assert.ok(!/undefined|NaN/.test(body), "no missing colours or coordinates");
  assert.match(worldSvg({ x: 10, y: 20, w: 150, h: 128 }), /viewBox="10 20 150 128"/);
});

test("phone storage: deletions keep progress, outside removals and videos drop out, undated stays", async () => {
  const db = new DatabaseSync(":memory:"), app = await boot(db, platform());
  const rows = Array.from({ length: 100 }, (_, i) => media(`p${i}`, { firstSeenAt: i < 60 ? 1 : undefined, month: "2025-06" }));
  await app.storage.put([...rows, media("v1", { type: "video", month: "2025-06" }), media("u1", { created: 0, month: "1970-01" })]);
  const wallPct = async () => {
    const months = await app.storage.memoryWall();
    const sum = months.reduce((a, m) => ({ total: a.total + m.total, explored: a.explored + m.explored, cleared: a.cleared + m.cleared }), { total: 0, explored: 0, cleared: 0 });
    return wallPercent(sum);
  };
  const shared = async () => libraryPercent(await app.storage.progress());
  assert.equal(await wallPct(), 59); // 60 of 101 photos (undated included, video not)
  assert.equal(await shared(), await wallPct(), "Home/Progress use the same number");
  // Confirmed deletions of explored photos keep their credit.
  await app.storage.put(rows.slice(0, 20).map((m) => ({ ...m, active: false, deletedAt: 2 })));
  assert.equal(await wallPct(), 59);
  assert.equal(await shared(), 59);
  const june = (await app.storage.memoryWall()).find((m) => m.key === "2025-06");
  assert.deepEqual([june.total, june.explored, june.cleared, june.remaining], [80, 40, 20, 40]);
  // Photos removed outside Pictopia leave the wall.
  await app.storage.put(rows.slice(90).map((m) => ({ ...m, active: false })));
  assert.equal((await app.storage.memoryWall()).find((m) => m.key === "2025-06").total, 70);
  assert.equal(await shared(), await wallPct());
  assert.equal((await app.storage.memoryWall()).find((m) => m.key === "unknown").total, 1);
  // Badges keep their own calendar (no cleared-only months appear there).
  await app.storage.put([media("gone", { month: "2019-02", firstSeenAt: 1, active: false, deletedAt: 3 })]);
  assert.ok((await app.storage.memoryWall()).some((m) => m.key === "2019-02" && m.total === 0 && m.cleared === 1));
  assert.ok(!(await app.storage.calendarProgress()).some((m) => m.key === "2019-02"));
  db.close();
});

test("browser storage gives the same wall months", async () => {
  require("fake-indexeddb/auto");
  const { storage } = makeLoader()("services/storage.web.ts");
  await storage.init();
  await storage.put([media("a", { firstSeenAt: 1 }), media("b"), media("c", { firstSeenAt: 1, active: false, deletedAt: 5 }), media("gone", { active: false, firstSeenAt: 1 }), media("vid", { type: "video" }), media("u", { created: 0 })]);
  const months = await storage.memoryWall();
  const june = months.find((m) => m.key === "2025-06");
  assert.deepEqual([june.total, june.explored, june.cleared, june.remaining], [2, 1, 1, 1]);
  assert.equal(months.find((m) => m.key === "unknown").total, 1);
  assert.equal(libraryPercent(await storage.progress()), wallPercent({ total: 3, explored: 1, cleared: 1 }));
});

test("a small library with one-photo years keeps every year a readable cell (no thin strips)", () => {
  const counts = { 2000: 1, 2009: 22, 2010: 1, 2016: 1, 2017: 20, 2019: 1, 2021: 1, 2022: 1, 2023: 20, 2024: 19 };
  const wall = W.buildWall(Object.entries(counts).map(([y, n]) => month(`${y}-06`, n, n)));
  const total = wall.years.reduce((n, y) => n + area(y.rect), 0);
  assert.ok(Math.abs(total - W.WALL_W * W.WALL_H) < 1e-6, "still partitions the whole picture");
  for (let i = 0; i < wall.years.length; i++) for (let j = i + 1; j < wall.years.length; j++) assert.ok(overlap(wall.years[i].rect, wall.years[j].rect) < 1e-6);
  for (const y of wall.years) assert.ok(Math.min(y.rect.w, y.rect.h) >= 45, `${y.key} is ${y.rect.w.toFixed(0)}×${y.rect.h.toFixed(0)}`);
  assert.deepEqual(wall.rows.flat(2), Object.keys(counts), "reading order stays chronological");
  // Saved arrangement round-trips.
  assert.deepEqual(W.buildWall(Object.entries(counts).map(([y, n]) => month(`${y}-06`, n, n)), { rows: wall.rows }).rows, wall.rows);
});
