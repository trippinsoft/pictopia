// Native StoreKit / Play Billing service with a simulated store. Real purchases still need
// sandbox (iOS) and license-tester (Android) checks on devices.
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeLoader } = require("./loader.cjs");
const { entitlementFrom, PRO_PRODUCTS, ANDROID_OFFLINE_DAYS } = makeLoader()("lib/pictopia/store-entitlement.ts");
const { entitlementActive } = makeLoader()("lib/pictopia/logic.ts");
const NOW = Date.UTC(2026, 10, 4);
const DAY = 86400000;

test("no active store subscription means no Pro, including after a refund or expiry", () => {
  assert.equal(entitlementFrom([], "ios", NOW).active, false);
  assert.equal(entitlementFrom([{ productId: PRO_PRODUCTS.monthly, isActive: false }], "android", NOW).active, false);
  const expired = entitlementFrom([{ productId: PRO_PRODUCTS.annual, isActive: true, expirationDateIOS: NOW - 1 }], "ios", NOW);
  assert.equal(expired.active, false, "a lapsed iOS expiry is never Pro");
});

test("only Pictopia's own products unlock Pro", () => {
  assert.equal(entitlementFrom([{ productId: "other.app.sub", isActive: true }], "android", NOW).active, false);
});

test("iOS trusts StoreKit's expiry; Android trusts a verified result offline for three days", () => {
  const ios = entitlementFrom([{ productId: PRO_PRODUCTS.monthly, isActive: true, expirationDateIOS: NOW + 20 * DAY }], "ios", NOW);
  assert.equal(ios.expires, NOW + 20 * DAY);
  const android = entitlementFrom([{ productId: PRO_PRODUCTS.annual, isActive: true }], "android", NOW);
  assert.equal(android.expires, NOW + ANDROID_OFFLINE_DAYS * DAY);
  assert.equal(entitlementActive(android, NOW + 2 * DAY), true);
  assert.equal(entitlementActive(android, NOW + 4 * DAY), false, "unverified for too long: Pro waits for the store");
});

function store(os, initial = []) {
  const s = { active: initial, available: [], finished: [], listeners: {}, requests: [] };
  s.iap = {
    initConnection: async () => true,
    fetchProducts: async () => [
      { id: PRO_PRODUCTS.monthly, type: "subs", displayPrice: "[PRICE]", price: 1, currency: "USD", subscriptionOffers: [{ offerTokenAndroid: "token-monthly" }] },
      { id: PRO_PRODUCTS.annual, type: "subs", displayPrice: "[PRICE]", price: 2, currency: "USD", subscriptionOffers: [] },
    ],
    getActiveSubscriptions: async () => s.active,
    getAvailablePurchases: async () => s.available,
    restorePurchases: async () => {},
    finishTransaction: async ({ purchase }) => s.finished.push(purchase.productId),
    requestPurchase: async (props) => s.requests.push(props),
    purchaseUpdatedListener: (fn) => ((s.listeners.update = fn), { remove() {} }),
    purchaseErrorListener: (fn) => ((s.listeners.error = fn), { remove() {} }),
    isUserCancelledError: (e) => e.code === "user-cancelled",
  };
  s.service = makeLoader({ "expo-iap": s.iap, "react-native": { Platform: { OS: os } } })("services/purchases.native.ts").purchaseService;
  return s;
}

test("launch finishes unacknowledged purchases so Google never auto-refunds them", async () => {
  const s = store("android", [{ productId: PRO_PRODUCTS.monthly, isActive: true }]);
  s.available = [{ productId: PRO_PRODUCTS.monthly, purchaseState: "purchased" }, { productId: PRO_PRODUCTS.annual, purchaseState: "pending" }];
  let seen;
  await s.service.init((e) => (seen = e));
  assert.deepEqual(s.finished, [PRO_PRODUCTS.monthly], "pending purchases are not finished or granted");
  assert.equal(seen.active, true);
  assert.match(seen.managementURL, /play\.google\.com.*com\.trippinsoft\.pictopia/);
});

test("an Android purchase sends the base plan's offer token and unlocks Pro once purchased", async () => {
  const s = store("android");
  await s.service.init(() => {});
  const offers = await s.service.offers();
  assert.deepEqual(offers.map((o) => o.kind), ["monthly", "annual"]);
  const pending = s.service.purchase(PRO_PRODUCTS.monthly);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(s.requests[0].request.google.subscriptionOffers[0].offerToken, "token-monthly");
  s.active = [{ productId: PRO_PRODUCTS.monthly, isActive: true }];
  s.listeners.update({ productId: PRO_PRODUCTS.monthly, purchaseState: "purchased" });
  assert.equal((await pending).active, true);
  assert.ok(s.finished.includes(PRO_PRODUCTS.monthly));
});

test("a plan without a Play offer token fails clearly instead of charging", async () => {
  const s = store("android");
  await s.service.init(() => {});
  await s.service.offers();
  await assert.rejects(s.service.purchase(PRO_PRODUCTS.annual), /isn’t available from Google Play/);
  assert.equal(s.requests.length, 0);
});

test("cancelling or a pending payment never grants Pro", async () => {
  const s = store("ios");
  await s.service.init(() => {});
  await s.service.offers();
  const cancelled = s.service.purchase(PRO_PRODUCTS.monthly);
  await new Promise((r) => setTimeout(r, 0));
  s.listeners.error({ code: "user-cancelled", productId: PRO_PRODUCTS.monthly });
  await assert.rejects(cancelled, /cancelled/);
  const pending = s.service.purchase(PRO_PRODUCTS.annual);
  await new Promise((r) => setTimeout(r, 0));
  s.listeners.update({ productId: PRO_PRODUCTS.annual, purchaseState: "pending" });
  await assert.rejects(pending, /waiting for approval/);
  assert.equal((await s.service.refresh()).active, false);
});

test("restore re-reads the store and reports Pro only when a subscription is active", async () => {
  const s = store("ios");
  await s.service.init(() => {});
  assert.equal((await s.service.restore()).active, false);
  s.active = [{ productId: PRO_PRODUCTS.annual, isActive: true, expirationDateIOS: Date.now() + DAY }];
  assert.equal((await s.service.restore()).active, true);
});
