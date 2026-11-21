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
  assert.equal(O.trialReminderAt(3, now, short.chargeAt, false, now), short.reminderAt);
  assert.equal(O.trialReminderAt(3, now, now + 180000, true, now), now + 120000);
  assert.equal(O.trialReminderAt(3, now, short.chargeAt, false, short.reminderAt), undefined);
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
  const saves = [], routes = [], events = [], tours = [];
  const app = {
    devTools: true, pro: true, prefs: { onboarded: true, replayOnboarding: true },
    stats: { total: 5 }, months: [], permission: { granted: true }, libraryReliable: true,
    updatePrefs: async change => saves.push(change),
    connect: async () => assert.fail("replay should reuse an already available library"),
  };
  const h = hooks("app/onboarding.tsx", "default", {
    "react/jsx-runtime": runtime,
    "react-native": { Platform: { OS: "web" }, View: "View", AppState: { addEventListener: () => ({ remove() {} }) } },
    "expo-router": { Stack: { Screen: "Screen" }, router: { replace: route => routes.push(route) } },
    "@/components/pictopia/provider": { usePictopia: () => app },
    "@/components/pictopia/ui": { Button: "Button", Icon: "Icon", Loading: "Loading", Text: "Text" },
    "@/components/pictopia/playful": { Postcard: "Postcard", OrBadge: "OrBadge" },
    "@/components/pictopia/onboarding/welcome": { Welcome: "Welcome" },
    "@/components/pictopia/onboarding/frame": { OnboardingFrame: "Frame" },
    "@/components/pictopia/onboarding/demos": { ScrollDemo: "ScrollDemo", SwipeDemo: "SwipeDemo", SpaceDemo: "SpaceDemo" },
    "@/components/pictopia/onboarding/reveal": { LibraryReveal: "Reveal" },
    "@/components/pictopia/onboarding/trial": { TrialOffer: "TrialOffer" },
    "@/components/pictopia/onboarding/celebrate": { Sunrays: "Sunrays", ConfettiBurst: "ConfettiBurst" },
    "@/services/media": { mediaService: { permission: async () => ({ granted: true }) } },
    "@/services/analytics": { trackOnboarding: (event, props) => events.push([event, props]) },
    "@/services/home-tour": { homeTourStore: { start: async source => tours.push(source) } },
    "@/services/adventures": { adventureStore: { home: async () => ({ slots: [] }) } },
    "@/services/notifications": { notificationService: {} },
    "@/services/repository": { storage: {} },
  });
  const byType = type => find(h.render(), node => node.type === type);
  const press = title => find(h.render(), node => node.type === "Button" && textOf(node) === title).props.onPress();
  byType("Welcome").props.onStart();
  for (let step = 0; step < 3; step++) press("Continue");
  press("Continue with current access");
  const reveal = byType("Reveal");
  assert.ok(reveal);
  const continueButton = () => find(h.render(), node => node.type === "Button" && textOf(node) === "Continue");
  assert.equal(continueButton().props.disabled, true);
  reveal.props.onCountShown();
  assert.equal(continueButton().props.disabled, false);
  press("Continue");
  byType("TrialOffer").props.onStep("plus_showcase");
  byType("TrialOffer").props.onStep("trial_timeline");
  byType("TrialOffer").props.onStep("trial_plans");
  byType("TrialOffer").props.onDone();
  assert.ok(byType("Loading"));
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(find(h.render(), node => node.type === "Text" && textOf(node) === "Your Pictopia is ready!"));
  assert.equal(find(h.render(), node => node.type === "QuietAction"), undefined, "no Start / Look around choice");
  press("Let’s explore Pictopia");
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(saves, [{ onboarded: true, replayOnboarding: false }]);
  assert.deepEqual(routes, ["/(tabs)/home"]);
  const viewed = events.filter(([e]) => e === "onboarding_step_viewed").map(([, p]) => p.step);
  assert.deepEqual(viewed, ["problem", "scroll", "swipe", "space", "access", "reveal", "plus_showcase", "trial_timeline", "trial_plans", "ready"]);
  assert.deepEqual(tours, ["onboarding"], "Home's tour is queued for the first Home visit");
  assert.deepEqual(events.at(-1), ["onboarding_completed", { outcome: "explore_home", pro: true, purchased_in_onboarding: false, recommendations: 0 }]);
  h.unmount();
});

test("the trial screen redeems the lead offer and the bottom sheet can redeem the alternate plan", async () => {
  const weekly = { id: "w", kind: "weekly", price: "$7.99", amount: 7.99, currency: "USD", trialDays: 3 };
  const yearly = { id: "y", kind: "annual", price: "$29.99", amount: 29.99, currency: "USD", trialDays: 3 };
  const steps = [], purchases = [];
  const h = hooks("components/pictopia/onboarding/trial.tsx", "TrialOffer", {
    "react/jsx-runtime": runtime,
    "react-native": { Platform: { OS: "ios" }, View: "View", Pressable: "Pressable", Modal: "Modal", ScrollView: "ScrollView" },
    "react-native-safe-area-context": { SafeAreaView: "SafeAreaView" },
    "@/components/pictopia/ui": { Button: "Button", Icon: "Icon", Text: "Text" },
    "@/components/pictopia/provider": { usePictopia: () => ({ ready: true, setEntitlement: async () => {} }) },
    "@/components/pictopia/paywall": { PaywallHero: "PaywallHero", PaywallLinks: "PaywallLinks", PlanOptions: "PlanOptions", PlusIncluded: "PlusIncluded" },
    "@/components/pictopia/use-paywall-analytics": { usePaywallAnalytics: () => () => {} },
    "@/lib/pictopia/links": {},
    "@/services/analytics": { trackOnboarding() {} },
    "@/services/lifetime-testing": { lifetimeTestStore: { snapshot: () => null } },
    "@/services/purchases": { purchaseService: {
      supportsTrialReminders: true,
      offers: async () => [weekly, yearly],
      purchase: async (id, options) => { purchases.push([id, options]); return { active: true }; },
    } },
    "./frame": { OnboardingFrame: "Frame" },
    "./plus-showcase": { PlusShowcase: "PlusShowcase" },
  }, { onStep: step => steps.push(step), onDone: () => {} });
  const getButton = (tree, title) => find(tree, node => node.type === "Button" && textOf(node) === title);
  assert.ok(find(h.render(), node => node.type === "PlusShowcase"));
  await new Promise(resolve => setImmediate(resolve));
  getButton(h.render(), "Continue").props.onPress();
  const timeline = h.render();
  assert.match(textOf(timeline), /Try Pictopia\+ free for 3 days/);
  assert.match(textOf(timeline), /In 2 days.*if notifications are on/s);
  const redeem = "Redeem 3 day trial for $0.00";
  assert.match(textOf(timeline.props.footer), /No payment due now.*\$7\.99\/week.*Redeem.*View all plans/s);
  assert.doesNotMatch(textOf(timeline.props.footer), /Free for 3 days, then/);
  assert.ok(find(timeline, node => node.type === "PlusIncluded"));
  assert.equal(find(timeline, node => node.type === "Modal"), undefined);
  getButton(timeline, redeem).props.onPress();
  await new Promise(resolve => setImmediate(resolve));
  find(h.render(), node => node.type === "Pressable" && textOf(node) === "View all plans").props.onPress();
  const picker = find(h.render(), node => node.type === "Modal");
  assert.equal(picker.props.visible, true);
  assert.equal(find(picker, node => node.type === "PlusIncluded"), undefined);
  assert.match(textOf(picker), /Free for 3 days, then \$7\.99 per week/);
  const plans = find(picker, node => node.type === "PlanOptions");
  assert.deepEqual(plans.props.plans.map(plan => plan.id), ["y", "w"]);
  plans.props.onSelect("y");
  const yearlyPicker = find(h.render(), node => node.type === "Modal");
  assert.match(textOf(yearlyPicker), /then \$29\.99 per year/);
  getButton(yearlyPicker, redeem).props.onPress();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(purchases, [["w", { remindBeforeTrialEnds: true }], ["y", { remindBeforeTrialEnds: true }]]);
  assert.deepEqual(steps, ["plus_showcase", "trial_timeline", "trial_plans"]);
  yearlyPicker.props.onRequestClose();
  assert.equal(find(h.render(), node => node.type === "Modal"), undefined);
  h.unmount();
});

const A = makeLoader()("lib/pictopia/onboarding-analytics.ts");
test("onboarding analytics send only allowlisted steps and coarse library sizes", () => {
  assert.deepEqual(A.sanitizeOnboardingProperties({ step: "plus_showcase", index: 7.4, seconds: 12, photo: "abc", library_size: "123", replay: false, access: "full" }),
    { step: "plus_showcase", index: 7, seconds: 12, replay: false, access: "full" });
  assert.deepEqual(A.sanitizeOnboardingProperties({ step: "/onboarding?x=1", seconds: -3 }), {});
  assert.equal(A.librarySizeBucket(0), "0");
  assert.equal(A.librarySizeBucket(99), "1-99");
  assert.equal(A.librarySizeBucket(4999), "1k-4.9k");
  assert.equal(A.librarySizeBucket(80000), "50k+");
  assert.equal(A.stepSeconds(0, 2_000_000), 600);
  assert.equal(A.stepSeconds(1000, 3600), 3);
});

const T = makeLoader()("lib/pictopia/home-tour.ts");
test("Home's tour: adventures, Explore, Timeline, then the percentage sticker and Progress tab together", () => {
  assert.deepEqual(T.homeTourSteps(2), ["adventures", "explore", "timeline", "progress"]);
  assert.deepEqual(T.homeTourSteps(0), ["explore", "timeline", "progress"]);
  assert.deepEqual(T.HOME_TOUR_TARGETS.progress, ["percent", "progress"]);
  assert.match(T.homeTourCopy("adventures", 2).body, /tap whichever looks fun/);
  assert.match(T.homeTourCopy("adventures", 1).title, /An adventure/);
  assert.match(T.homeTourCopy("explore").body, /screenshots, large videos, duplicates/);
  assert.match(T.homeTourCopy("timeline").body, /by year or month/);
  assert.match(T.homeTourCopy("progress").body, /Tap Progress/);
  assert.deepEqual(A.sanitizeOnboardingProperties({ tour_step: "progress", source: "settings", steps: 4, index: 3 }),
    { tour_step: "progress", source: "settings", steps: 4, index: 3 });
});

test("the tour card never covers a spotlight, on small and large phones", () => {
  const screens = [{ height: 667, top: 28, bottom: 8 }, { height: 932, top: 67, bottom: 42 }];
  const overlaps = (a, b) => a.y < b.y + b.height && b.y < a.y + a.height;
  for (const screen of screens) {
    const tab = { x: 200, y: screen.height - screen.bottom - 60, width: 80, height: 60 };
    const cases = [
      [{ x: 10, y: 230, width: 370, height: 300 }],          // postcards
      [tab],                                                  // one tab
      [{ x: 200, y: 110, width: 170, height: 120 }, tab],    // sticker + Progress tab
      [{ x: 10, y: 200, width: 370, height: screen.height - 340 }], // very tall postcards (large text)
    ];
    for (const holes of cases) {
      const card = { height: 200 };
      const pos = T.placeCard(holes, card, screen);
      const top = "top" in pos ? pos.top : screen.height - pos.bottom - card.height;
      const box = { y: top, height: card.height };
      assert.ok(top >= screen.top, `card inside the safe area (${screen.height})`);
      if (holes.length > 1 || holes[0].height < screen.height - 400) for (const h of holes) assert.ok(!overlaps(box, h), `card clear of spotlight at ${h.y} (${screen.height})`);
    }
  }
});

test("the tour's card is never hidden while waiting for a layout event (iOS sends none when nothing changed)", () => {
  const src = require("node:fs").readFileSync(require("node:path").join(__dirname, "../components/pictopia/home-tour.tsx"), "utf8");
  assert.doesNotMatch(src, /opacity:\s*cardH\s*===\s*undefined/, "card visibility must not depend on a measured height");
  assert.match(src, /key=\{step\}/, "each step mounts its own card, so its first layout always reports");
  assert.match(src, /measured\.step === step/, "a new step's card waits only for its own spotlight, which always arrives");
});
