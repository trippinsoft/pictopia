// Developer entitlement overrides: one resolver, fail-closed build authorization, persistence,
// testing review limits and the daily usage reset.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { makeLoader } = require("./loader.cjs");
const e = makeLoader()("lib/pictopia/entitlement.ts");
const d = makeLoader()("lib/pictopia/daily.ts");
const { permittedHistoryDate } = makeLoader()("lib/pictopia/journey-progress.ts");
const { DatabaseSync, media, platform, boot } = require("./native-harness.cjs");

const NOW = Date.UTC(2026, 10, 11, 12);
const DAY = 86400000;
const bought = { active: true, expires: NOW + 30 * DAY, verifiedAt: NOW };
const lapsed = { active: true, expires: NOW - 1, verifiedAt: NOW - 40 * DAY };

test("only explicit development or opted-in staging builds may use developer tools", () => {
  const ok = (env, devTools, dev) => e.devToolsAuthorized({ env, devTools, dev });
  assert.equal(ok("DEVELOPMENT", undefined, true), true, "web preview / simulators / dev client");
  assert.equal(ok("STAGING", "enabled", false), true, "opted-in test build");
  for (const [env, flag, dev] of [
    ["PRODUCTION", "enabled", true],
    ["PRODUCTION", undefined, true],
    ["PRODUCTION", "enabled", false],
    [undefined, "enabled", true],
    ["", "enabled", true],
    ["production", "enabled", true],
    ["QA", "enabled", true],
    ["STAGING", undefined, true],
    ["STAGING", "true", false],
    ["STAGING", "Enabled", false],
    ["DEVELOPMENT", undefined, false],
  ]) assert.equal(ok(env, flag, dev), false, `${env}/${flag}/${dev} fails closed`);
});

test("Automatic follows the store; Free and Pictopia+ override it only when authorized", () => {
  const r = (store, mode, authorized = true) => e.resolveEntitlement(store, { version: 1, mode }, authorized, NOW);
  assert.deepEqual(r(null, "auto"), { pro: false, source: "store", storePro: false, mode: "auto" });
  assert.equal(r(bought, "auto").pro, true);
  assert.equal(r(lapsed, "auto").pro, false, "an expired purchase is still Free");
  assert.deepEqual(r(null, "plus"), { pro: true, source: "developer", storePro: false, mode: "plus" });
  assert.deepEqual(r(bought, "free"), { pro: false, source: "developer", storePro: true, mode: "free" });
  for (const mode of ["plus", "free"]) {
    for (const store of [null, bought]) {
      const locked = r(store, mode, false);
      assert.equal(locked.source, "store", "a production build ignores a saved override");
      assert.equal(locked.mode, "auto");
      assert.equal(locked.pro, store === bought);
    }
  }
});

test("malformed saved overrides are treated as Automatic with the real limit", () => {
  for (const bad of [undefined, null, "plus", 1, {}, { mode: "PLUS" }, { mode: "pro" }])
    assert.deepEqual(e.validOverride(bad), e.noOverride);
  assert.deepEqual(e.validOverride({ mode: "free", reviewLimit: 7 }), { version: 1, mode: "free" }, "only listed testing limits");
  assert.equal(e.effectiveReviewLimit(100, { version: 1, mode: "free", reviewLimit: 3 }, true), 3);
  assert.equal(e.effectiveReviewLimit(100, { version: 1, mode: "free", reviewLimit: 3 }, false), 100, "production keeps the approved limit");
  assert.equal(e.effectiveReviewLimit(100, { version: 1, mode: "free" }, true), 100);
});

test("every premium gate reads the resolved value: free blocks, Pictopia+ unlocks", () => {
  const today = "2026-11-11", lastWeek = "2026-11-05";
  const free = e.resolveEntitlement(bought, { version: 1, mode: "free" }, true, NOW).pro;
  const plus = e.resolveEntitlement(null, { version: 1, mode: "plus" }, true, NOW).pro;
  assert.equal(permittedHistoryDate(lastWeek, today, free), false, "past On This Day is locked in Free");
  assert.equal(permittedHistoryDate(lastWeek, today, plus), true, "and open in Pictopia+");
  const full = { version: 1, date: today, counted: ["a", "b", "c"], lastWallClock: NOW };
  assert.equal(d.presentAsset(full, "z", 3, free, NOW).allowed, false, "Free stops at the limit");
  assert.equal(d.presentAsset(full, "z", 3, plus, NOW).allowed, true, "Pictopia+ is unlimited");
  assert.deepEqual(d.presentAsset(full, "z", 3, plus, NOW).state.counted, ["a", "b", "c"], "and isn't counted");
});

test("no screen or service decides Pictopia+ outside the central resolver", () => {
  const root = path.resolve(__dirname, "..");
  const files = [];
  const walk = (dir) => {
    for (const f of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = path.join(dir, f.name);
      if (f.isDirectory()) walk(rel);
      else if (/\.(ts|tsx)$/.test(f.name)) files.push(rel);
    }
  };
  for (const dir of ["app", "components", "services", "lib"]) walk(dir);
  const allowed = new Set(["lib/pictopia/logic.ts", "lib/pictopia/entitlement.ts"]);
  for (const f of files) {
    const src = fs.readFileSync(path.join(root, f), "utf8");
    if (!allowed.has(f)) assert.doesNotMatch(src, /entitlementActive\(/, `${f} must use app.pro / resolveEntitlement`);
    if (f !== "components/pictopia/provider.tsx") assert.doesNotMatch(src, /getValue<Entitlement>|getValue\("entitlement"\)/, `${f} must not read the store entitlement directly`);
    if (!["services/entitlement.ts", "lib/pictopia/entitlement.ts"].includes(f)) assert.doesNotMatch(src, /developerEntitlement:v1|EXPO_PUBLIC_PICTOPIA_DEV_TOOLS/, `${f} must not read overrides directly`);
  }
});

async function services(env) {
  const db = new DatabaseSync(":memory:");
  const ids = ["a", "b", "c", "d", "e"];
  const records = ids.map((id) => media(id));
  const p = platform({ library: ids, records });
  const loaded = await load(db, p, env);
  await loaded.app.storage.put(records);
  return { db, p, records, ...loaded };
}
async function load(db, p, env) {
  const app = await boot(db, p);
  const saved = { env: process.env.EXPO_PUBLIC_CURRENT_ENV, flag: process.env.EXPO_PUBLIC_PICTOPIA_DEV_TOOLS };
  if (env.env === undefined) delete process.env.EXPO_PUBLIC_CURRENT_ENV; else process.env.EXPO_PUBLIC_CURRENT_ENV = env.env;
  if (env.flag === undefined) delete process.env.EXPO_PUBLIC_PICTOPIA_DEV_TOOLS; else process.env.EXPO_PUBLIC_PICTOPIA_DEV_TOOLS = env.flag;
  globalThis.__DEV__ = env.dev ?? false;
  const loader = makeLoader({ ...p.mocks, "./repository": app });
  const out = { app, daily: loader("services/daily.ts"), dev: loader("services/entitlement.ts") };
  delete globalThis.__DEV__;
  if (saved.env === undefined) delete process.env.EXPO_PUBLIC_CURRENT_ENV; else process.env.EXPO_PUBLIC_CURRENT_ENV = saved.env;
  if (saved.flag === undefined) delete process.env.EXPO_PUBLIC_PICTOPIA_DEV_TOOLS; else process.env.EXPO_PUBLIC_PICTOPIA_DEV_TOOLS = saved.flag;
  return out;
}

test("an authorized override and testing limit persist across an app restart", async () => {
  const env = { env: "DEVELOPMENT", dev: true };
  const { db, p, dev, daily } = await services(env);
  assert.equal(dev.devOverrideStore.authorized, true);
  await dev.devOverrideStore.save({ mode: "plus" });
  await dev.devOverrideStore.save({ reviewLimit: 3 });
  assert.equal(await daily.allowanceStore.limit(), 3);
  const again = await load(db, p, env);
  assert.deepEqual(await again.dev.devOverrideStore.load(), { version: 1, mode: "plus", reviewLimit: 3 });
  assert.equal(await again.daily.allowanceStore.limit(), 3);
  await again.dev.devOverrideStore.save({ reviewLimit: undefined, mode: "auto" });
  assert.deepEqual(await again.dev.devOverrideStore.load(), { version: 1, mode: "auto" });
  assert.equal(await again.daily.allowanceStore.limit(), 100, "back to the approved limit");
});

test("a production build cannot read, save or apply an override, even one already on the device", async () => {
  const { db, p, app } = await services({ env: "DEVELOPMENT", dev: true });
  await app.storage.setValue("developerEntitlement:v1", { version: 1, mode: "plus", reviewLimit: 3 });
  for (const env of [{ env: "PRODUCTION", flag: "enabled", dev: true }, { env: undefined, flag: "enabled", dev: true }, { env: "STAGING" }]) {
    const prod = await load(db, p, env);
    assert.equal(prod.dev.devOverrideStore.authorized, false);
    assert.deepEqual(await prod.dev.devOverrideStore.load(), e.noOverride, "saved override is ignored");
    await assert.rejects(prod.dev.devOverrideStore.save({ mode: "plus" }));
    await assert.rejects(prod.daily.allowanceStore.resetToday());
    assert.equal(await prod.daily.allowanceStore.limit(), 100, "approved limit stays");
  }
});

test("resetting today's usage clears only the allowance, never photos, decisions or deletion records", async () => {
  const { app, daily, dev } = await services({ env: "STAGING", flag: "enabled" });
  await dev.devOverrideStore.save({ reviewLimit: 3 });
  const now = Date.now();
  for (const id of ["a", "b", "c"]) assert.equal((await daily.allowanceStore.present(id, false, now)).allowed, true);
  assert.equal((await daily.allowanceStore.present("d", false, now)).allowed, false, "Free hits the testing limit");
  await app.repository.encounter("a");
  await app.repository.setDecision("b", "delete");
  await app.storage.setValue("deletionPending", { ids: ["e"] });
  const before = {
    stats: await app.storage.stats(),
    activity: await app.storage.getValue("dailyActivity:v1"),
    pending: await app.storage.getValue("deletionPending"),
    media: await app.storage.query({ limit: 50 }),
  };
  await daily.allowanceStore.resetToday(now);
  assert.deepEqual((await daily.allowanceStore.state(now)).counted, []);
  assert.equal((await daily.allowanceStore.present("d", false, now)).allowed, true, "reviewing resumes");
  assert.deepEqual(await app.storage.stats(), before.stats);
  assert.deepEqual(await app.storage.getValue("dailyActivity:v1"), before.activity, "streak activity untouched");
  assert.deepEqual(await app.storage.getValue("deletionPending"), before.pending);
  assert.deepEqual(await app.storage.query({ limit: 50 }), before.media, "photos and decisions untouched");
});
