// Calendar-day streaks, Restore Streak and the daily swipe allowance (pure rules).
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeLoader } = require("./loader.cjs");
const d = makeLoader()("lib/pictopia/daily.ts");
const at = (date, h = 12) => { const [y, m, dd] = date.split("-").map(Number); return new Date(y, m - 1, dd, h).getTime(); };
const views = (n, prefix = "p") => Array.from({ length: n }, (_, i) => ({ type: "view", id: `${prefix}${i}`, video: false, firstTime: true }));
function days(...dates) {
  let a;
  for (const date of dates) a = d.recordActivity(a, views(10, date), at(date));
  return a;
}

test("a day qualifies at 10 distinct meaningful views or one confirmed deletion", () => {
  let a = d.recordActivity(undefined, views(9), at("2026-11-04"));
  assert.equal(d.qualifies(a.days["2026-11-04"]), false);
  a = d.recordActivity(a, views(9), at("2026-11-04", 13));
  assert.equal(d.qualifies(a.days["2026-11-04"]), false, "revisiting the same photos the same day doesn't add");
  a = d.recordActivity(a, [{ type: "view", id: "v1", video: true, firstTime: true }], at("2026-11-04", 14));
  assert.equal(d.qualifies(a.days["2026-11-04"]), true, "videos count toward the streak");
  assert.equal(a.days["2026-11-04"].newPhotos, 9, "videos never count as new photos");
  const del = d.recordActivity(undefined, [{ type: "deleted", count: 1 }], at("2026-11-05"));
  assert.equal(d.qualifies(del.days["2026-11-05"]), true);
});

test("streaks count consecutive calendar days; today stays pending until it's over", () => {
  const a = days("2026-11-01", "2026-11-02", "2026-11-03");
  assert.equal(d.streak(a, [], at("2026-11-03")).current, 3);
  const morning = d.streak(a, [], at("2026-11-04", 8));
  assert.equal(morning.current, 3, "not yet explored today: still 3, not broken");
  assert.equal(morning.todayDone, false);
  assert.equal(d.streak(a, [], at("2026-11-05")).current, 0, "a missed calendar day breaks it");
  assert.equal(d.streak(a, [], at("2026-11-05")).best, 3);
});

test("Restore Streak: one missed day, a 3-day streak before it, through the end of the second day after", () => {
  const a = days("2026-11-01", "2026-11-02", "2026-11-03"); // missed 11-04
  const d1 = d.streak(a, [], at("2026-11-05"));
  assert.deepEqual(d1.restore, { date: "2026-11-04", streakBefore: 3, deadline: "2026-11-06" });
  assert.equal(d.streak(a, [], at("2026-11-06", 23)).restore, undefined, "on D+2 it needs D+1 to have qualified");
  const withD1 = d.recordActivity(a, views(10, "x"), at("2026-11-05"));
  assert.equal(d.streak(withD1, [], at("2026-11-06", 23)).restore.date, "2026-11-04", "still offered late on D+2");
  assert.equal(d.streak(withD1, [], at("2026-11-07", 0)).restore, undefined, "gone once D+2 has ended");
  const restores = d.applyRestore(withD1, [], at("2026-11-05", 20));
  const s = d.streak(withD1, restores, at("2026-11-05", 21));
  assert.equal(s.current, 5, "1st–3rd, restored 4th, 5th");
  assert.equal(s.activeDays, 4, "a restored day is never counted as activity");
  assert.equal(s.week.find((w) => w.date === "2026-11-04").state, "restored");
});

test("Restore Streak is refused for short streaks, two missed days, or within 30 days of the last one", () => {
  assert.equal(d.streak(days("2026-11-02", "2026-11-03"), [], at("2026-11-05")).restore, undefined, "2-day streak");
  assert.equal(d.streak(days("2026-11-01", "2026-11-02", "2026-11-03"), [], at("2026-11-06")).restore, undefined, "two missed days");
  const a = days("2026-11-01", "2026-11-02", "2026-11-03");
  const recent = [{ date: "2026-10-20", usedAt: at("2026-10-21"), streakBefore: 5 }];
  assert.equal(d.streak(a, recent, at("2026-11-05")).restore, undefined);
  assert.equal(d.applyRestore(a, recent, at("2026-11-05")), undefined);
  assert.ok(d.streak(a, [{ date: "2026-10-01", usedAt: at("2026-10-02"), streakBefore: 5 }], at("2026-11-05")).restore);
});

test("a clock set backwards can't reopen or extend past days", () => {
  const a = days("2026-11-01", "2026-11-02", "2026-11-03");
  const back = d.recordActivity(a, views(10, "late"), at("2026-10-31"));
  assert.equal(back.today.date, "2026-11-03", "today's set isn't replaced by an earlier date");
  assert.equal(d.streak(back, [], at("2026-10-31")).current, 3, "streak judged from the latest real date");
});

test("swipe allowance: each newly shown asset counts once per day, including the first", () => {
  let s;
  let r = d.presentAsset(s, "a", 3, false, at("2026-11-04"));
  assert.equal(r.allowed, true); s = r.state;
  assert.deepEqual(s.counted, ["a"], "the first asset of a session counts");
  s = d.presentAsset(s, "a", 3, false, at("2026-11-04", 13)).state;
  assert.equal(s.counted.length, 1, "revisiting is free");
  s = d.presentAsset(s, "b", 3, false, at("2026-11-04")).state;
  s = d.presentAsset(s, "c", 3, false, at("2026-11-04")).state;
  r = d.presentAsset(s, "d", 3, false, at("2026-11-04"));
  assert.equal(r.allowed, false, "the limit blocks a new asset");
  assert.equal(d.presentAsset(s, "b", 3, false, at("2026-11-04")).allowed, true, "already-counted assets stay viewable");
  assert.equal(d.presentAsset(s, "d", 3, true, at("2026-11-04")).allowed, true, "Pro is unlimited");
  assert.equal(d.swipesLeft(s, 3, at("2026-11-05", 0)), 3, "resets at local midnight");
  assert.equal(d.swipesLeft(s, 3, at("2026-11-03")), 0, "moving the clock back never resets");
});

test("the remote limit is validated with a 100 fallback", () => {
  assert.equal(d.validLimit({ freeDailySwipes: 200 }), 200);
  for (const bad of [undefined, null, "150", { freeDailySwipes: 0 }, { freeDailySwipes: 9.5 }, { freeDailySwipes: 1e6 }, {}])
    assert.equal(d.validLimit(bad), 100);
});

const { DatabaseSync, media, platform, boot } = require("./native-harness.cjs");
async function services() {
  const db = new DatabaseSync(":memory:");
  const ids = ["a", "b", "c", "v"];
  const records = ids.map((id) => media(id, id === "v" ? { type: "video" } : {}));
  const p = platform({ library: ids, records });
  const app = await boot(db, p);
  await app.storage.put(records);
  const daily = makeLoader({ ...p.mocks, "./repository": app })("services/daily.ts");
  return { db, p, app, daily };
}

test("encounters record daily activity in the same save, and survive a restart", async () => {
  const { db, p, app, daily } = await services();
  await app.repository.encounter("a");
  await app.repository.encounter("v");
  await app.repository.encounter("a");
  const activity = await daily.dailyStore.activity();
  const today = Object.values(activity.days)[0];
  assert.deepEqual({ photos: today.photos, videos: today.videos, newPhotos: today.newPhotos }, { photos: 1, videos: 1, newPhotos: 1 });
  const again = await boot(db, p);
  assert.deepEqual(await again.storage.getValue("dailyActivity:v1"), activity);
});

test("the allowance store persists counted assets and never double-counts", async () => {
  const { db, p, daily } = await services();
  const now = at("2026-11-04");
  assert.equal((await daily.allowanceStore.limit()), 100, "no remote value yet: 100");
  assert.equal((await daily.allowanceStore.present("a", false, now)).left, 99);
  assert.equal((await daily.allowanceStore.present("a", false, now)).left, 99, "revisit is free");
  const app2 = await boot(db, p);
  const daily2 = makeLoader({ ...p.mocks, "./repository": app2 })("services/daily.ts");
  assert.deepEqual((await daily2.allowanceStore.state(now)).counted, ["a"], "counted ids survive a restart");
  assert.equal((await daily2.allowanceStore.present("b", true, now)).allowed, true);
  assert.deepEqual((await daily2.allowanceStore.state(now)).counted, ["a"], "Pro views aren't counted");
});

test("the approved 100 limit cannot be changed by cached or remote configuration", async () => {
  process.env.EXPO_PUBLIC_SWIPE_CONFIG_URL = "https://example.test/pictopia-config.json";
  const { app, p } = await services();
  const daily = makeLoader({ ...p.mocks, "./repository": app })("services/daily.ts");
  const reply = (body, ok = true) => async () => ({ ok, json: async () => body });
  assert.equal(await daily.allowanceStore.refreshLimit(reply({ freeDailySwipes: 200 })), 100);
  assert.equal(await daily.allowanceStore.refreshLimit(reply({ freeDailySwipes: "lots" })), 100, "invalid value keeps the cache");
  assert.equal(await daily.allowanceStore.refreshLimit(async () => { throw Error("offline"); }), 100);
  assert.equal(await daily.allowanceStore.refreshLimit(reply({}, false)), 100);
  delete process.env.EXPO_PUBLIC_SWIPE_CONFIG_URL;
});

test("reaching the daily-limit page never finishes an adventure; the real end still does", () => {
  const load = makeLoader();
  const { ExploreFeedController } = load("lib/pictopia/explore-feed-controller.ts");
  const { createExplore } = load("lib/pictopia/explore.ts");
  for (const limited of [true, false]) {
    const session = { ...createExplore(["a", "b"]), review: true };
    let ended = 0;
    const c = new ExploreFeedController({
      read: () => session, pages: () => ["a", "b", "end"], completionPage: true,
      save: async () => session, scrollTo() {}, onPage() {}, onEnd: () => ended++, onBusy() {}, onError() {},
      onFeed() {}, prepare: async () => {}, limited: () => limited,
    }, "a");
    c.settle(2, ["a", "b"]);
    assert.equal(ended, limited ? 0 : 1);
  }
});

test("a confirmed deletion qualifies today's streak", async () => {
  const { daily } = await services();
  await daily.recordDeletions(2, at("2026-11-04"));
  const s = await daily.dailyStore.streak(at("2026-11-04", 18));
  assert.equal(s.todayDone, true);
  assert.equal(s.current, 1);
});
