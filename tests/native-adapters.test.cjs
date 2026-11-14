const test = require("node:test"),
  assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const { makeLoader } = require("./loader.cjs");
test("native SQLite adapter runs migrations, transactions, queries, and aggregates on a real SQLite engine", async () => {
  const db = new DatabaseSync(":memory:");
  const adapter = {
    execAsync: async (s) => db.exec(s),
    getFirstAsync: async (s, ...args) => db.prepare(s).get(...args),
    getAllAsync: async (s, ...args) => db.prepare(s).all(...args),
    runAsync: async (s, ...args) => db.prepare(s).run(...args),
    withExclusiveTransactionAsync: async (work) => {
      db.exec("BEGIN IMMEDIATE");
      try {
        await work(adapter);
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
  const load = makeLoader({ "expo-sqlite": { openDatabaseAsync: async () => adapter } });
  const { storage } = load("services/storage.native.ts");
  await storage.init();
  assert.equal(db.prepare("PRAGMA user_version").get().user_version, 1);
  const m = {
    id: "a",
    uri: "private",
    name: "a",
    type: "photo",
    created: 1,
    modified: 1,
    width: 100,
    height: 100,
    duration: 0,
    month: "2025-01",
    day: "01-01",
    favorite: false,
    screenshot: true,
    active: true,
    size: 123,
    decision: "delete",
  };
  await storage.put([m], { session: { ids: ["a"], position: 1 } });
  assert.equal((await storage.get("a")).decision, "delete");
  assert.equal((await storage.query({ decision: "delete" })).length, 1);
  assert.equal((await storage.stats()).pendingBytes, 123);
  assert.equal((await storage.months())[0].count, 1);
  assert.equal((await storage.getValue("session")).position, 1);
  await assert.rejects(() => storage.put([{ ...m, id: null }], { session: { position: 2 } }));
  assert.equal((await storage.getValue("session")).position, 1);
  db.exec("PRAGMA user_version=2");
  const freshStorage = makeLoader({ "expo-sqlite": { openDatabaseAsync: async () => adapter } })("services/storage.native.ts").storage;
  await assert.rejects(() => freshStorage.init(), /newer version/);
  db.close();
});
test("native storage shares initialization and queues overlapping foreground writes and migrations", async () => {
  const db = new DatabaseSync(":memory:");
  const tick = () => new Promise(resolve => setImmediate(resolve));
  let writing = false, opens = 0, schemas = 0;
  const run = async (sql, ...args) => {
    await tick();
    return db.prepare(sql).run(...args);
  };
  const adapter = {
    execAsync: async sql => {
      assert.equal(writing, false, "schema setup must not overlap a transaction");
      schemas++;
      await tick();
      db.exec(sql);
    },
    getFirstAsync: async (sql, ...args) => db.prepare(sql).get(...args),
    runAsync: async (...args) => {
      assert.equal(writing, false, "migration must not overlap a transaction");
      return run(...args);
    },
    withExclusiveTransactionAsync: async work => {
      assert.equal(writing, false, "exclusive writes must wait their turn");
      writing = true;
      db.exec("BEGIN IMMEDIATE");
      try {
        await work({ runAsync: run });
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      } finally { writing = false; }
    },
  };
  const { storage } = makeLoader({ "expo-sqlite": { openDatabaseAsync: async () => {
    opens++;
    await tick();
    return adapter;
  } } })("services/storage.native.ts");
  try {
    await Promise.all([storage.init(), storage.init(), storage.setValue("startup", true)]);
    await Promise.all([
      ...Array.from({ length: 12 }, (_, i) => storage.setValue(`foreground:${i}`, i)),
      storage.migrateSeen(), storage.init(),
    ]);
    assert.equal(opens, 1);
    assert.equal(schemas, 1);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM preferences").get().n, 13);
    const failed = storage.put([], { partial: true, invalid: 1n });
    const saved = storage.setValue("afterFailure", true);
    await assert.rejects(() => failed, /BigInt/);
    await saved;
    assert.equal(await storage.getValue("partial"), undefined, "failed transaction must roll back");
    assert.equal(await storage.getValue("afterFailure"), true, "failed writes must not block later saves");
  } finally { db.close(); }
});
test("native database initialization can retry after a failed open", async () => {
  let attempts = 0;
  const adapter = { getFirstAsync: async () => ({ user_version: 1 }), execAsync: async () => {} };
  const { storage } = makeLoader({ "expo-sqlite": { openDatabaseAsync: async () => {
    if (++attempts === 1) throw Error("temporary open failure");
    return adapter;
  } } })("services/storage.native.ts");
  await assert.rejects(() => storage.init(), /temporary open failure/);
  await storage.init();
  await storage.init();
  assert.equal(attempts, 2);
});
function revenueFixture() {
  let info = {
    entitlements: { active: {} },
    managementURL: "https://apps.apple.com/account/subscriptions",
  };
  let listener;
  const sdk = {
    configure: () => {},
    addCustomerInfoUpdateListener: (l) => (listener = l),
    removeCustomerInfoUpdateListener: () => {},
    getCustomerInfo: async () => info,
    getOfferings: async () => ({
      current: {
        availablePackages: [
          {
            identifier: "monthly",
            packageType: "MONTHLY",
            product: { priceString: "€2.99", price: 2.99, currencyCode: "EUR" },
          },
        ],
      },
    }),
    purchasePackage: async () => ({ customerInfo: info }),
    restorePurchases: async () => info,
  };
  return {
    sdk,
    setInfo: (i) => {
      info = i;
      listener?.(i);
    },
  };
}
test("purchase adapter uses localized store products and only real SDK entitlement responses", async () => {
  process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY = "test-public-key";
  const f = revenueFixture();
  const load = makeLoader({
    "react-native-purchases": f.sdk,
    "react-native": { Platform: { OS: "ios" } },
  });
  const { purchaseService } = load("services/purchases.revenuecat.ts");
  let current;
  const stop = await purchaseService.init((e) => (current = e));
  assert.equal(current.active, false);
  assert.equal((await purchaseService.offers())[0].price, "€2.99");
  assert.equal((await purchaseService.purchase("monthly")).active, false);
  f.setInfo({ entitlements: { active: { pro: { expirationDate: null } } } });
  assert.equal(current.active, true);
  assert.equal(current.expires, null);
  assert.equal((await purchaseService.restore()).active, true);
  f.setInfo({ entitlements: { active: {} } });
  assert.equal(current.active, false);
  stop();
  delete process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;
});
test("store cancellation and pending approval never unlock Pro", async () => {
  process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY = "test-public-key";
  const f = revenueFixture();
  f.sdk.purchasePackage = async () => {
    throw { userCancelled: true };
  };
  const load = makeLoader({
    "react-native-purchases": f.sdk,
    "react-native": { Platform: { OS: "ios" } },
  });
  const service = load("services/purchases.revenuecat.ts").purchaseService;
  await service.init(() => {});
  await service.offers();
  await assert.rejects(() => service.purchase("monthly"), /cancelled/);
  f.sdk.purchasePackage = async () => {
    throw { code: "20" };
  };
  await assert.rejects(() => service.purchase("monthly"), /pending/);
  delete process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;
});
test("native builds without the analysis module report it unavailable instead of simulating", async () => {
  const load = makeLoader({
    "expo-modules-core": { requireOptionalNativeModule: () => null },
    "./media": { mediaService: { resolve: async () => ({ uri: "ph://a" }) } },
  });
  const { analyzer } = load("services/analysis.native.ts");
  assert.equal(analyzer.available, false);
  assert.equal(await analyzer.canScan(), false);
  await assert.rejects(() => analyzer.analyze({ id: "a", type: "photo" }), /native build/);
});
