const test = require("node:test");
const assert = require("node:assert/strict");
const { makeLoader } = require("./loader.cjs");
const { media } = require("./native-harness.cjs");
const load = makeLoader();
const { adventureSize } = load("lib/pictopia/adventures.ts");
const { curate } = load("lib/pictopia/curation.ts");
const { createExplore, reduceExplore, exploreFeed, exploreCounts } = load("lib/pictopia/explore.ts");
const { estimatedMediaSize, displayMediaSize } = load("lib/pictopia/storage-size.ts");

const at = (year, month, day = 10, minute = 0) => new Date(year, month - 1, day, 12, minute).getTime();
const pad = (n) => String(n).padStart(2, "0");
const photo = (id, created, extra = {}) => {
  const d = new Date(created);
  return media(id, { created, modified: created, month: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`, day: `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, ...extra });
};
const ctx = { seed: 7, explored: new Set(), now: at(2026, 11, 7) };

test("an adventure is its set: sizes vary by kind", () => {
  assert.equal(adventureSize("detour"), 20, "Surprise Me is a 20-photo mix");
  assert.equal(adventureSize("screenshots"), 50, "screenshot sweeps hold 50");
  assert.ok(adventureSize("day") >= 500, "On This Day runs its whole date");
});

test("On This Day shows every photo from the date, bursts included, oldest first", () => {
  const pool = [];
  for (const year of [2015, 2019, 2023]) for (let i = 0; i < 15; i++) pool.push(photo(`d${year}-${i}`, at(year, 11, 7, i)));
  pool.push(photo("other-day", at(2019, 11, 8)));
  const a = curate({ kind: "day", source: "day:11-07", pool }, ctx);
  assert.equal(a.ids.length, 45, "a burst of 15 shots per year is not merged");
  assert.ok(!a.ids.includes("other-day"));
  assert.equal(a.ids[0], "d2015-0");
});

test("a screenshot sweep shows every screenshot in a run, up to 50", () => {
  const pool = [];
  for (let i = 0; i < 70; i++) pool.push(photo(`s${i}`, at(2024, 1, 5, i % 3) + i * 1000, { screenshot: true }));
  const a = curate({ kind: "screenshots", source: "screenshots", pool }, { ...ctx, chosen: true });
  assert.equal(a.ids.length, 50);
});

test("revisiting a finished review reopens it on a photograph with its marks intact", () => {
  let s = { ...createExplore(["a", "b", "c"], 1), review: true };
  s = reduceExplore(s, { type: "discard", id: "a", revision: s.revision, direction: "left" });
  s = reduceExplore(s, { type: "page", id: s.activeId, revision: s.revision, toId: "c", availableIds: [] });
  s = reduceExplore(s, { type: "finish", boundary: { startedAt: s.startedAt, endpoint: "c" } });
  assert.equal(s.finished, true);
  const top = reduceExplore(s, { type: "revisit" });
  assert.equal(top.finished, false);
  assert.equal(top.activeId, "a", "from the top, the discarded photo shown faded");
  assert.deepEqual(exploreFeed(top), ["a", "b", "c"]);
  assert.equal(top.records.a.queued, true);
  assert.equal(exploreCounts(top).explored, exploreCounts(s).explored, "revisiting never changes what was reviewed");
  assert.equal(reduceExplore(s, { type: "revisit", toId: "c" }).activeId, "c", "Back to photos returns to the last one");
  assert.equal(reduceExplore(top, { type: "revisit" }), top, "only a finished review is revisited");
});

test("sizes always show: measured when known, estimated otherwise", () => {
  assert.equal(displayMediaSize({ type: "photo", width: 4000, height: 3000, duration: 0, size: 2_000_000 }), 2_000_000);
  assert.equal(displayMediaSize({ type: "photo", width: 4000, height: 3000, duration: 0 }, 1_500_000), 1_500_000);
  assert.equal(estimatedMediaSize({ type: "photo", width: 4000, height: 3000, duration: 0 }), 3_600_000);
  assert.equal(estimatedMediaSize({ type: "photo", width: 4000, height: 3000, duration: 0, livePhoto: true }), 6_100_000);
  assert.equal(estimatedMediaSize({ type: "video", width: 1920, height: 1080, duration: 10 }), 15_000_000);
  assert.ok(estimatedMediaSize({ type: "photo", width: 0, height: 0, duration: 0 }) > 0);
});
