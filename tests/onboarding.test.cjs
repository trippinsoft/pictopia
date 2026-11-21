// Onboarding facts: real per-year totals for the reveal, and trial terms only from the store.
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeLoader } = require("./loader.cjs");
const { hooks, textOf } = require("./hook-harness.cjs");
const O = makeLoader()("lib/pictopia/onboarding.ts");
const S = makeLoader()("lib/pictopia/store-entitlement.ts");

test("the reveal counts photos per year, oldest first, leaving out undated items and videos", () => {
  const months = [
    { key: "2024-03", count: 12, photos: 10, reviewed: 0 },
    { key: "2019-07", count: 5, photos: 5, reviewed: 0 },
    { key: "2024-11", count: 3, photos: 2, reviewed: 0 },
    { key: "unknown", count: 40, photos: 40, reviewed: 0 },
    { key: "2021-01", count: 4, photos: 0, reviewed: 0 },
  ];
  assert.deepEqual(O.yearTotals(months), [{ year: 2019, photos: 5 }, { year: 2024, photos: 12 }]);
  assert.equal(O.revealInterval(1), 900);
  assert.equal(O.revealInterval(30), 380);
});

test("free trials come only from the store's offer terms", () => {
  assert.equal(S.freeTrialDays([{ paymentMode: "free-trial", period: { unit: "week", value: 1 }, periodCount: 1 }]), 7);
  assert.equal(S.freeTrialDays([{ paymentMode: "free-trial", period: { unit: "day", value: 3 } }]), 3);
  assert.equal(S.freeTrialDays([{ paymentMode: "pay-as-you-go", period: { unit: "month", value: 1 } }]), undefined);
  assert.equal(S.freeTrialDays(undefined), undefined);
  assert.equal(S.offerKind("pictopia.pro.weekly"), "weekly");
});

test("onboarding leads with a trial offer, else yearly; the reminder lands two days (one for 3-day trials) before the charge", () => {
  const weekly = { id: "w", kind: "weekly", price: "$4.99", amount: 4.99, currency: "USD", trialDays: 7 };
  const annual = { id: "a", kind: "annual", price: "$29.99", amount: 29.99, currency: "USD" };
  assert.equal(O.leadOffer([annual, weekly]).id, "w");
  assert.equal(O.leadOffer([annual, { ...weekly, trialDays: undefined }]).id, "a");
  const now = new Date(2026, 10, 10, 9).getTime();
  const t = O.trialTimeline(7, now);
  assert.equal(t.reminderDay, 5);
  assert.equal(Math.round((t.chargeAt - t.reminderAt) / 86400000), 2);
  const short = O.trialTimeline(3, now);
  assert.equal(short.reminderDay, 2);
  assert.equal(short.reminderBefore, 1);
});

const jsx = (type, props) => ({ type, props });
const fragment = "Fragment";
const runtime = { jsx, jsxs: jsx, Fragment: fragment };
const find = (node, predicate) => {
  if (!node || typeof node !== "object") return;
  if (predicate(node)) return node;
  return [node.props?.children, node.props?.footer].flat(Infinity).map(child => find(child, predicate)).find(Boolean);
};

test("only authorized builds honor a pending replay when reopening with an existing library", () => {
  const app = { ready: true, devTools: true, prefs: { onboarded: true, replayOnboarding: true }, stats: { total: 5 } };
  const h = hooks("app/index.tsx", "default", {
    "react/jsx-runtime": runtime,
    "react-native": { Platform: { OS: "ios" } },
    "expo-router": { Redirect: "Redirect" },
    "@/components/pictopia/provider": { usePictopia: () => app },
  });
  assert.equal(h.render().props.href, "/onboarding");
  app.devTools = false;
  assert.equal(h.render().props.href, "/(tabs)/home");
});

test("replay starts at Welcome, reuses library access, and shows the offer to a subscriber", async () => {
  const saves = [], routes = [];
  const app = {
    devTools: true, pro: true, prefs: { onboarded: true, replayOnboarding: true },
    stats: { total: 5 }, months: [], permission: { granted: true }, libraryReliable: true,
    updatePrefs: async change => saves.push(change),
    connect: async () => assert.fail("replay should reuse an already available library"),
  };
  const h = hooks("app/onboarding.tsx", "default", {
    "react/jsx-runtime": runtime,
    "react-native": { Platform: { OS: "web" }, View: "View" },
    "expo-router": { Stack: { Screen: "Screen" }, router: { replace: route => routes.push(route) } },
    "@/components/pictopia/provider": { usePictopia: () => app },
    "@/components/pictopia/ui": { Button: "Button", Icon: "Icon", Text: "Text" },
    "@/components/pictopia/playful": { Postcard: "Postcard" },
    "@/components/pictopia/onboarding/welcome": { Welcome: "Welcome" },
    "@/components/pictopia/onboarding/frame": { OnboardingFrame: "Frame" },
    "@/components/pictopia/onboarding/demos": { ScrollDemo: "ScrollDemo", SwipeDemo: "SwipeDemo", SpaceDemo: "SpaceDemo" },
    "@/components/pictopia/onboarding/reveal": { LibraryReveal: "Reveal" },
    "@/components/pictopia/onboarding/planning": { Planning: "Planning" },
    "@/components/pictopia/onboarding/trial": { TrialOffer: "TrialOffer" },
    "@/services/adventures": { adventureStore: { home: async () => ({ slots: [] }) } },
    "@/services/notifications": { notificationService: {} },
    "@/services/repository": { storage: {} },
  });
  const byType = type => find(h.render(), node => node.type === type);
  const press = title => find(h.render(), node => node.type === "Button" && textOf(node) === title).props.onPress();
  byType("Welcome").props.onStart();
  for (let step = 0; step < 3; step++) press("Continue");
  press("Continue with current access");
  assert.ok(byType("Reveal"));
  press("Continue");
  await new Promise(resolve => setImmediate(resolve));
  byType("Planning").props.onDone();
  byType("TrialOffer").props.onDone();
  press("Go to Home");
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(saves, [{ onboarded: true, replayOnboarding: false }]);
  assert.deepEqual(routes, ["/(tabs)/home"]);
  h.unmount();
});
