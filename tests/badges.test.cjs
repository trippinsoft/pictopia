// Badges: seven tiered families from verifiable records; permanent; silent backfill.
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeLoader } = require("./loader.cjs");
const b = makeLoader()("lib/pictopia/badges.ts");
const zero = { explorer: 0, declutterer: 0, months: 0, years: 0, decades: 0, adventurer: 0, streak: 0 };

test("exactly the seven approved families", () => {
  assert.deepEqual(b.BADGES.map((d) => d.family), ["explorer", "declutterer", "months", "years", "adventurer", "streak"]);
});

test("existing users are backfilled silently, later tiers celebrate once", () => {
  let r = b.evaluateBadges(undefined, { ...zero, explorer: 1200, months: 2 }, 1);
  assert.deepEqual(r.newlyEarned, [], "no celebration flood after the update");
  assert.equal(r.backfilledCount, 2);
  assert.equal(r.state.earned.explorer.tier, 3);
  r = b.evaluateBadges(r.state, { ...zero, explorer: 5000, months: 2 }, 2);
  assert.deepEqual(r.newlyEarned, [{ family: "explorer", tier: 4 }]);
  r = b.evaluateBadges(r.state, { ...zero, explorer: 5000, months: 2 }, 3);
  assert.deepEqual(r.newlyEarned, [], "never awarded twice");
});

test("earned tiers are permanent even if a value drops (a month gains new photos)", () => {
  let r = b.evaluateBadges(undefined, { ...zero, months: 6 }, 1);
  r = b.evaluateBadges(r.state, { ...zero, months: 5 }, 2);
  assert.equal(r.state.earned.months.tier, 2);
  assert.equal(b.badgeView(b.BADGES[2], r.state, 5).tier, 2);
});

test("calendar values: complete months, full years, and decades with a full year", () => {
  const months = [
    { key: "2021-01", total: 5, remaining: 0 }, { key: "2021-02", total: 3, remaining: 0 },
    { key: "2019-07", total: 4, remaining: 0 }, { key: "2019-08", total: 2, remaining: 1 },
    { key: "2008-05", total: 1, remaining: 0 }, { key: "unknown", total: 9, remaining: 0 },
  ];
  assert.deepEqual(b.calendarValues(months), { months: 4, years: 2, decades: 2 });
});

test("next-tier progress", () => {
  const v = b.badgeView(b.BADGES[0], undefined, 750);
  assert.equal(v.tier, 2);
  assert.equal(v.next, 1000);
  assert.equal(v.progress, 0.5);
});

test('new awards persist atomically, survive restart, and dismiss individually without re-awarding', async () => {
  const { DatabaseSync, platform, boot } = require('./native-harness.cjs');
  const db = new DatabaseSync(':memory:'), p = platform(), fault = {}, app = await boot(db,p,fault);
  const load = () => makeLoader({...p.mocks,'./repository':app})('services/badges.ts');
  const source = explored => ({progress:{explored,deleted:0},months:[]});
  try {
    let badges = load();
    await badges.evaluateSavedBadges(1,source(0));
    assert.deepEqual(await badges.badgeStore.pendingCelebrations(),[],'baseline is silent');
    let notifications=0;
    const unsubscribe=badges.badgeStore.subscribeCelebrations(()=>notifications++);
    fault.key='badges:v1';
    await assert.rejects(badges.evaluateSavedBadges(2,source(100)));
    assert.deepEqual(await badges.badgeStore.pendingCelebrations(),[],'failed badge write cannot celebrate');
    assert.equal(notifications,0);
    delete fault.key;
    await badges.evaluateSavedBadges(2,source(100));
    assert.equal(notifications,1);
    const [first]=await badges.badgeStore.pendingCelebrations();
    assert.deepEqual(first,{family:'explorer',tier:1,earnedAt:2,value:100});
    await badges.evaluateSavedBadges(3,source(500));
    assert.equal((await badges.badgeStore.pendingCelebrations()).length,2);
    unsubscribe(); badges=load();
    assert.equal((await badges.badgeStore.pendingCelebrations()).length,2,'restart retains unseen celebrations');
    fault.key='badgeCelebrations:v1';
    await assert.rejects(badges.badgeStore.dismissCelebration(first));
    assert.equal((await badges.badgeStore.pendingCelebrations()).length,2);
    delete fault.key;
    await badges.badgeStore.dismissCelebration(first);
    assert.deepEqual((await badges.badgeStore.pendingCelebrations()).map(a=>a.tier),[2]);
    await badges.evaluateSavedBadges(4,source(500));
    assert.equal((await badges.badgeStore.pendingCelebrations()).length,1,'refresh never re-enqueues an earned tier');
    assert.equal((await badges.badgeStore.state()).earned.explorer.tier,2);
  } finally {db.close();}
});
