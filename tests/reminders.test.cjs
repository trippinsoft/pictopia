// Local reminder planning: at most one a day, only with a real reason, never in the past.
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeLoader } = require("./loader.cjs");
const R = makeLoader()("lib/pictopia/reminders.ts");
const T = makeLoader()("lib/pictopia/types.ts");
const prefs = { ...T.DEFAULT_REMINDERS };
const at = (d, h = 10) => new Date(2026, 10, d, h).getTime();
const facts = (over = {}) => ({ streak: { current: 0, todayDone: false }, days: {}, pending: { count: 0, bytes: 0 }, ...over });

test("a streak at risk today gets tonight's reminder; none after it would have lapsed", () => {
  const plan = R.planReminders(prefs, facts({ streak: { current: 5, todayDone: false } }), at(10));
  assert.equal(plan.length, 1);
  assert.equal(plan[0].kind, "streak");
  assert.match(plan[0].title, /5-day streak/);
  assert.equal(new Date(plan[0].at).getHours(), 19);
  assert.equal(plan[0].url, "/(tabs)/home");
});

test("once today counts, tomorrow's reminder protects the streak instead", () => {
  const plan = R.planReminders(prefs, facts({ streak: { current: 6, todayDone: true } }), at(10));
  assert.deepEqual(plan.map(p => [p.kind, new Date(p.at).getDate()]), [["streak", 11]]);
});

test("On This Day only on dates with past photos, and the time already passed today is skipped", () => {
  const days = { "2026-11-10": { count: 4, years: [2019] }, "2026-11-12": { count: 12, years: [2016, 2021] } };
  const plan = R.planReminders(prefs, facts({ streak: { current: 0, todayDone: true }, days }), at(10, 20));
  assert.deepEqual(plan.map(p => p.id), ["pictopia-reminder-2026-11-12"]);
  assert.match(plan[0].title, /12 photos/);
  assert.match(plan[0].body, /2016–2021/);
  assert.equal(plan[0].url, "/on-this-day");
});

test("Discarded gets one nudge two days out; switched-off kinds never appear", () => {
  const f = facts({ streak: { current: 0, todayDone: true }, pending: { count: 34, bytes: 58e6 } });
  const plan = R.planReminders(prefs, f, at(10));
  assert.deepEqual(plan.map(p => [p.kind, new Date(p.at).getDate()]), [["discarded", 12]]);
  assert.match(plan[0].body, /Nothing is deleted until you confirm/);
  assert.equal(R.planReminders({ ...prefs, discarded: false }, f, at(10)).length, 0);
  assert.equal(R.planReminders({ ...prefs, streak: false }, facts({ streak: { current: 5, todayDone: false } }), at(10)).length, 0);
});

test("never more than one reminder a day, and none beyond a week", () => {
  const days = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`2026-11-${String(10 + i).padStart(2, "0")}`, { count: 3, years: [2020] }]));
  const plan = R.planReminders(prefs, facts({ streak: { current: 3, todayDone: false }, days, pending: { count: 2, bytes: 0 } }), at(10));
  assert.equal(plan.length, 7);
  assert.equal(new Set(plan.map(p => p.id)).size, 7);
  assert.equal(plan[0].kind, "streak", "a streak at risk outranks On This Day");
});
