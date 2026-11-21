const test = require("node:test");
const assert = require("node:assert/strict");
const { makeLoader } = require("./loader.cjs");
const policy = makeLoader()("lib/pictopia/subscription-analytics.ts");
const { PRO_PRODUCTS } = makeLoader()("lib/pictopia/store-entitlement.ts");
const NOW = Date.now();
const DAY = 86400000;
const tick = () => new Promise(r => setImmediate(r));
const transaction = (values = {}) => ({
  verified: true, fingerprint: "local-only-fingerprint", productId: PRO_PRODUCTS.weekly,
  state: "trial", purchaseType: "trial", purchasedAt: NOW + 1000, expiresAt: NOW + 3 * DAY,
  trialDurationDays: 3, reason: "purchase", ownership: "purchased",
  storeEnvironment: "sandbox", distribution: "testflight_inferred", ...values,
});
function harness(shared = { ledger: undefined }) {
  const h = { events: [], current: null, verified: null, mode: "auto", simulation: null, shared };
  h.mocks = {
    "./storage": { storage: {
      async getValue() { return shared.ledger; },
      async setValue(key, value) { shared.ledger = structuredClone(value); },
    } },
    "./analytics": { trackSubscriptionAnalytics(event, props) { h.events.push([event, policy.sanitizeSubscriptionProperties(props)]); } },
    "./store-subscription-analytics": { storeSubscriptionAnalytics: {
      async history() { return h.baseline ?? []; },
      async snapshot() { return { verified: true, current: h.current }; },
      async transaction() { return h.verified; },
    } },
    "./entitlement": { devOverrideStore: { async load() { return { mode: h.mode }; } } },
    "./lifetime-testing": { lifetimeTestStore: { snapshot() { return h.simulation; } } },
  };
  h.analytics = makeLoader(h.mocks)("services/subscription-analytics.ts").subscriptionAnalytics;
  return h;
}
function store(h) {
  const s = { active: [], available: [], listeners: {}, requestError: null, eligible: true };
  s.iap = {
    async initConnection() { return true; },
    async fetchProducts() { return ["weekly", "annual"].map(kind => ({
      id: PRO_PRODUCTS[kind], type: "subs", displayPrice: kind === "weekly" ? "$1.99" : "$39.99", price: kind === "weekly" ? 1.99 : 39.99, currency: "USD",
      subscriptionGroupIdIOS: "group", subscriptionOffers: [{ paymentMode: "free-trial", period: { unit: "day", value: 3 }, periodCount: 1 }],
    })); },
    async isEligibleForIntroOfferIOS() { if (s.eligible === "error") throw Error("offline"); return s.eligible; },
    async getActiveSubscriptions() { return s.active; },
    async getAvailablePurchases() { return s.available; },
    async restorePurchases() {}, async finishTransaction() {},
    async requestPurchase() { if (s.requestError) throw s.requestError; },
    purchaseUpdatedListener(fn) { s.listeners.update = fn; return { remove() {} }; },
    purchaseErrorListener(fn) { s.listeners.error = fn; return { remove() {} }; },
    isUserCancelledError(e) { return e?.code === "user-cancelled"; },
  };
  s.service = makeLoader({ ...h.mocks,
    "react-native": { Platform: { OS: "ios" } }, "expo-iap": s.iap,
    "./subscription-analytics": { subscriptionAnalytics: h.analytics },
  })("services/purchases.native.ts").purchaseService;
  return s;
}
async function begin(s, id = PRO_PRODUCTS.weekly) {
  await s.service.init(() => {});
  await s.service.offers();
  const result = s.service.purchase(id);
  await tick();
  return { result };
}
async function complete(s, h, id = PRO_PRODUCTS.weekly) {
  s.active = [{ productId: id, isActive: true, expirationDateIOS: Date.now() + DAY }];
  h.current = h.verified;
  s.listeners.update({ productId: id, purchaseState: "purchased", transactionId: "sensitive-store-id", id: "sensitive-store-id" });
  await tick();
  await tick();
}
test("eligible user starts a verified three-day introductory trial exactly once", async () => {
  const h = harness(), s = store(h);
  h.verified = transaction({ purchasedAt: Date.now() + 10000 });
  const { result } = await begin(s);
  await complete(s, h);
  assert.equal((await result).active, true);
  const trial = h.events.filter(([e]) => e === "trial_started");
  assert.equal(trial.length, 1);
  assert.equal(trial[0][1].trial_duration_days, 3);
  const purchase = h.events.filter(([e]) => e === "purchase_completed");
  assert.equal(purchase.length, 1);
  assert.equal(purchase[0][1].purchase_type, "trial");
  assert.equal(purchase[0][1].store_environment, "sandbox");
  assert.equal(h.events.find(([e]) => e === "purchase_started")[1].trial_eligibility, true);
  s.listeners.update({ productId: PRO_PRODUCTS.weekly, purchaseState: "purchased", transactionId: "sensitive-store-id" });
  await tick(); await tick();
  assert.equal(h.events.filter(([e]) => e === "purchase_completed").length, 1);
  const payload = JSON.stringify(h.events);
  assert.ok(!/sensitive-store-id|local-only-fingerprint|\$revenue|\$price|purchaseToken/.test(payload));
});
test("existing subscriber's immediately paid Annual purchase never starts a trial", async () => {
  const h = harness(), s = store(h); s.eligible = false;
  h.verified = transaction({ productId: PRO_PRODUCTS.annual, state: "active_paid", purchaseType: "paid", purchasedAt: Date.now() + 10000 });
  const { result } = await begin(s, PRO_PRODUCTS.annual);
  await complete(s, h, PRO_PRODUCTS.annual); await result;
  assert.equal(h.events.filter(([e]) => e === "trial_started").length, 0);
  const purchase = h.events.find(([e]) => e === "purchase_completed")[1];
  assert.equal(purchase.plan, "annual"); assert.equal(purchase.purchase_type, "paid");
  assert.equal(h.events.find(([e]) => e === "purchase_started")[1].trial_eligibility, false);
});
test("Weekly/Annual selections use real localized offer properties and preserve unknown eligibility", async () => {
  const h = harness(), s = store(h);
  const offers = await s.service.offers();
  assert.deepEqual(offers.map(o => policy.offerProperties(o).plan), ["weekly", "annual"]);
  assert.equal(policy.offerProperties(offers[0]).localized_price, "$1.99");
  assert.equal(policy.offerProperties(offers[1]).currency, "USD");
  assert.equal(policy.offerProperties(offers[0]).free_trial_available, true);
  s.eligible = "error";
  const unknown = (await s.service.offers())[0];
  assert.equal(policy.offerProperties(unknown).trial_eligibility, "unknown");
  assert.equal(policy.offerProperties(unknown).free_trial_available, "unknown");
  assert.equal(unknown.trialDays, undefined, "paywall does not promise an unconfirmed trial");
});
for (const [code, reason] of [["user-cancelled", "user_cancelled"], ["purchase-error", "store_error"], ["network-error", "network_error"]]) {
  test(`purchase dialog ${code} is categorized once without success`, async () => {
    const h = harness(), s = store(h);
    const { result } = await begin(s);
    s.listeners.error({ productId: PRO_PRODUCTS.weekly, code, message: "private error payload" });
    await assert.rejects(result);
    const failed = h.events.filter(([e]) => e === "purchase_failed");
    assert.equal(failed.length, 1); assert.equal(failed[0][1].error_reason, reason);
    assert.equal(failed[0][1].user_cancelled, reason === "user_cancelled");
    assert.ok(!h.events.some(([e]) => e === "purchase_completed"));
  });
}
test("requestPurchase failure cannot double count a listener failure", async () => {
  const h = harness(), s = store(h);
  await s.service.init(() => {}); await s.service.offers();
  s.iap.requestPurchase = async () => { s.listeners.error({ code: "user-cancelled", productId: PRO_PRODUCTS.weekly }); throw { code: "user-cancelled" }; };
  await assert.rejects(s.service.purchase(PRO_PRODUCTS.weekly));
  assert.equal(h.events.filter(([e]) => e === "purchase_failed").length, 1);
});
test("verification failure never turns an active or cached entitlement into purchase success", async () => {
  const h = harness(), s = store(h);
  const { result } = await begin(s);
  await complete(s, h); await result;
  assert.ok(h.events.some(([e, p]) => e === "purchase_failed" && p.error_reason === "verification_failed"));
  assert.ok(!h.events.some(([e]) => ["trial_started", "purchase_completed"].includes(e)));
});
test("store does not confirm entitlement after purchase: verification_failed, no conversion", async () => {
  const h = harness(), s = store(h);
  const { result } = await begin(s);
  s.listeners.update({ productId: PRO_PRODUCTS.weekly, purchaseState: "purchased", transactionId: "id" });
  assert.equal((await result).active, false);
  assert.equal(h.events.find(([e]) => e === "purchase_failed")[1].error_reason, "verification_failed");
});

test("native verification rejection emits categorized failure instead of success", async () => {
  const h = harness();
  h.mocks["./store-subscription-analytics"].storeSubscriptionAnalytics.transaction = async () => { throw Error("private verification failure"); };
  await h.analytics.completed("id", PRO_PRODUCTS.weekly, []);
  assert.deepEqual(h.events, [["purchase_failed", { product_id: PRO_PRODUCTS.weekly, plan: "weekly", error_reason: "verification_failed", user_cancelled: false }]]);
});
test("restore reports only a verified active entitlement and never purchase success", async () => {
  const h = harness(), s = store(h);
  await s.service.init(() => {});
  await s.service.restore(); await tick();
  assert.ok(!h.events.some(([e]) => e === "subscription_restored"));
  h.current = transaction({ ownership: "family_shared" });
  s.active = [{ productId: PRO_PRODUCTS.weekly, isActive: true, expirationDateIOS: Date.now() + DAY }];
  await s.service.restore(); await tick(); await tick();
  assert.equal(h.events.find(([e]) => e === "subscription_restored")[1].entitlement_type, "family_shared");
  assert.ok(!h.events.some(([e]) => ["trial_started", "purchase_completed"].includes(e)));
});
test("persisted ledger prevents duplicates across concurrent callbacks and app relaunch", async () => {
  const h = harness(); h.verified = transaction();
  await Promise.all([h.analytics.completed("id", PRO_PRODUCTS.weekly, []), h.analytics.completed("id", PRO_PRODUCTS.weekly, [])]);
  assert.equal(h.events.filter(([e]) => e === "purchase_completed").length, 1);
  const relaunched = harness(h.shared); relaunched.verified = transaction(); relaunched.current = transaction();
  await relaunched.analytics.completed("id", PRO_PRODUCTS.weekly, []);
  await relaunched.analytics.observe();
  assert.ok(!relaunched.events.some(([e]) => ["purchase_completed", "trial_started"].includes(e)));
  const s = store(relaunched); s.available = [{ productId: PRO_PRODUCTS.weekly, purchaseState: "purchased", transactionId: "id" }];
  await s.service.init(() => {}); await tick();
  assert.ok(!relaunched.events.some(([e]) => e === "purchase_completed"));
});
test("verified trial-to-paid and expiry transitions emit once; refreshes and renewals do not complete purchases", async () => {
  const h = harness(); h.current = transaction();
  await h.analytics.observe(); await h.analytics.observe();
  assert.equal(h.events.length, 0, "first observation establishes baseline");
  h.current = transaction({ fingerprint: "renewal", reason: "renewal", state: "active_paid", purchaseType: "paid" });
  await h.analytics.observe(); await h.analytics.observe();
  h.current = transaction({ state: "expired", purchaseType: "paid" });
  await h.analytics.observe(); await h.analytics.observe();
  assert.deepEqual(h.events.map(([, p]) => [p.previous_status, p.status]), [["trial", "active_paid"], ["active_paid", "expired"]]);
  h.verified = transaction({ reason: "renewal" }); await h.analytics.completed("id", PRO_PRODUCTS.weekly, []);
  assert.ok(!h.events.some(([e]) => e === "purchase_completed"));
});
test("lifetime simulation and developer overrides never emit real subscription conversions or transitions", async () => {
  for (const context of [{ mode: "plus" }, { mode: "free" }, { simulation: { scenario: "lifetime" } }]) {
    const h = harness(); Object.assign(h, context); h.current = h.verified = transaction();
    await h.analytics.completed("id", PRO_PRODUCTS.weekly, []); await h.analytics.observe(); await h.analytics.restored();
    assert.equal(h.events.length, 0);
  }
  assert.deepEqual(policy.completionEvents({ completed: {} }, transaction({ productId: "pictopia.lifetime.award" }), []), []);
  // Real lifetime award changes the provider, not StoreKit: no store change, no events.
  const h = harness(); await h.analytics.observe(); await h.analytics.observe(); assert.equal(h.events.length, 0);
});
test("Xcode simulation, unknown purchase reason and failed storage never report conversions", async () => {
  for (const override of [{ storeEnvironment: "xcode" }, { reason: "unknown" }, { ownership: "family_shared" }, { verified: false }]) {
    const h = harness(); h.verified = transaction(override);
    await h.analytics.completed("id", PRO_PRODUCTS.weekly, []);
    assert.ok(!h.events.some(([e]) => ["purchase_completed", "trial_started"].includes(e)));
  }
  const h = harness(); h.verified = transaction();
  h.mocks["./storage"].storage.setValue = async () => { throw Error("disk full"); };
  await h.analytics.completed("id", PRO_PRODUCTS.weekly, []);
  assert.equal(h.events.length, 0);
});
test("privacy allowlist rejects arbitrary entry points, transaction data and payment details", () => {
  assert.equal(policy.paywallEntry("private-route?email=person@example.com"), "unknown");
  assert.deepEqual(policy.sanitizeSubscriptionProperties({ product_id: PRO_PRODUCTS.weekly, plan: "weekly", transactionId: "secret", purchaseToken: "secret", receipt: "secret", email: "private", error_reason: "private-message", currency: "USD", premium_access: false }), {
    product_id: PRO_PRODUCTS.weekly, plan: "weekly", currency: "USD", premium_access: false,
  });
});

test("pre-purchase verified history rejects old redelivery without depending on the phone clock", async () => {
  const h = harness(); h.verified = transaction({ purchasedAt: NOW - 100 * DAY });
  await h.analytics.completed("id", PRO_PRODUCTS.weekly, [h.verified.fingerprint]);
  assert.equal(h.events.length, 0);
  // A new verified transaction is eligible even if the local clock is ahead of Apple.
  await h.analytics.completed("id", PRO_PRODUCTS.weekly, []);
  assert.equal(h.events.filter(([e]) => e === "purchase_completed").length, 1);
  const unavailable = harness(); unavailable.verified = transaction();
  await unavailable.analytics.completed("id", PRO_PRODUCTS.weekly, null);
  assert.equal(unavailable.events.length, 0);
});

test("paywall records its entry/premium state once and explicit Weekly/Annual selections without rerender duplicates", () => {
  const events = [], refs = [];
  let position = 0;
  const hook = makeLoader({
    react: { useRef(value) { const index = position++; return refs[index] ??= { current: value }; }, useEffect(fn) { fn(); } },
    "@/services/analytics": { trackSubscriptionAnalytics(event, props) { events.push([event, props]); } },
  })("components/pictopia/use-paywall-analytics.ts").usePaywallAnalytics;
  const offers = ["weekly", "annual"].map(kind => ({ id: PRO_PRODUCTS[kind], kind, price: "$1.99", amount: 1.99, currency: "USD", trialEligible: true, freeTrialAvailable: true }));
  const render = selected => { position = 0; return hook("Settings", true, true, offers, selected); };
  const select = render(offers[0]); render(offers[0]);
  select(PRO_PRODUCTS.annual); render(offers[1]); render(offers[1]);
  select(PRO_PRODUCTS.weekly); render(offers[0]);
  assert.deepEqual(events.filter(([e]) => e === "subscription_selected").map(([, p]) => [p.plan, p.selection_source]), [["weekly", "default"], ["annual", "user"], ["weekly", "user"]]);
  assert.deepEqual(events.filter(([e]) => e === "paywall_viewed").map(([, p]) => p), [{ entry_point: "Settings", premium_access: true, trial_eligibility: true }]);
});
