// The reviewer's three tips: order, platform rules, copy, the heart spotlight, Got it, the
// plain-card fallback and saved progress.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { makeLoader } = require("./loader.cjs");
const { hooks } = require("./hook-harness.cjs");
const G = makeLoader()("lib/pictopia/review-guidance.ts");

test("three tips in order on the phone; the web (no heart) keeps two", () => {
  assert.deepEqual([...G.reviewSteps(true)], ["browse", "discard", "favorite"]);
  assert.deepEqual([...G.reviewSteps(false)], ["browse", "discard"]);
  assert.equal(G.nextReviewStep({}, G.reviewSteps(true)), "browse");
  assert.equal(G.nextReviewStep({ browse: true }, G.reviewSteps(true)), "discard");
  // People who already finished the first two see only the heart tip, once.
  assert.equal(G.nextReviewStep({ browse: true, discard: true }, G.reviewSteps(true)), "favorite");
  assert.equal(G.nextReviewStep({ browse: true, discard: true }, G.reviewSteps(false)), undefined);
  assert.equal(G.nextReviewStep({ browse: true, discard: true, favorite: true }, G.reviewSteps(true)), undefined);
});

test("tip copy, and Tip 3 explains that scrolling past already keeps a photo", () => {
  assert.deepEqual(G.REVIEW_HINTS.browse, { title: "Scroll up to explore", body: "Scroll past what you want to keep.\nSwipe away what you don’t." });
  assert.deepEqual(G.REVIEW_HINTS.discard, { title: "Swipe sideways to discard", body: "It waits in the trash.\nUndo brings it straight back." });
  assert.equal(G.REVIEW_HINTS.favorite.title, "Heart your favorites");
  assert.equal(G.REVIEW_HINTS.favorite.body.replace(/\u00a0/g, " "), "You don’t need to heart a photo to keep it.\nHeart the ones you especially love.");
  assert.equal(G.REVIEW_SPOTLIGHT.favorite, "favorite");
});

test("the spotlight target is the real heart button, which keeps its place and behaviour", () => {
  const src = fs.readFileSync(path.join(__dirname, "../components/pictopia/review-actions.tsx"), "utf8");
  const heart = src.slice(src.indexOf('tourTarget("favorite")'), src.indexOf("</Pressable>", src.indexOf('tourTarget("favorite")')));
  assert.match(heart, /Add to Favorites/, "the target is the favorite button");
  assert.match(heart, /onPress=\{\(\) => void act\("favorite"\)\}/, "tapping it still favorites as before");
});

// —— ReviewHint rendering, with the native heart measured at a known spot.
const jsx = (type, props) => ({ type, props });
const runtime = { jsx, jsxs: jsx, Fragment: "Fragment" };
const find = (node, predicate) => {
  if (!node || typeof node !== "object") return;
  if (predicate(node)) return node;
  return [node.props?.children].flat(Infinity).map(child => find(child, predicate)).find(Boolean);
};
function renderHint(step, heart) {
  const nexts = [];
  const h = hooks("components/pictopia/review-hint.tsx", "ReviewHint", {
    "react/jsx-runtime": runtime,
    "react-native": { AccessibilityInfo: { announceForAccessibility() {} }, Modal: "Modal", Platform: { OS: "ios" }, Pressable: "Pressable", View: "View", useWindowDimensions: () => ({ width: 402, height: 874 }) },
    "react-native-safe-area-context": { useSafeAreaInsets: () => ({ top: 62, bottom: 34 }) },
    "expo-router": {},
    "react-native-reanimated": { default: { View: "AnimatedView" }, cancelAnimation() {}, useAnimatedStyle: () => ({}), useReducedMotion: () => false, useSharedValue: v => ({ value: v }), withRepeat: v => v, withSequence: v => v, withTiming: v => v },
    "./ui": { Icon: "Icon", Text: "Text" },
    "@/services/review-guidance": { reviewGuidance: {} },
    "./tour-targets": { measureTarget: async () => heart },
    "./spotlight": { SpotlightMask: "SpotlightMask", SpotlightRing: "SpotlightRing" },
  }, { step, favorites: true, onNext: s => nexts.push(s) });
  return { h, nexts };
}
const settle = ms => new Promise(resolve => setTimeout(resolve, ms));

test("Tip 3 dims the reviewer, cuts out the real heart with a pulse, and Got it completes it", async () => {
  const heart = { x: 286, y: 790, width: 48, height: 48 };
  const { h, nexts } = renderHint("favorite", heart);
  assert.equal(h.render(), null, "nothing flashes up before the heart is found");
  await settle(200);
  const tree = h.render();
  assert.equal(tree.type, "Modal", "Tip 3 is a spotlight over the reviewer");
  const mask = find(tree, n => n.type === "SpotlightMask"), ring = find(tree, n => n.type === "SpotlightRing");
  const hole = mask.props.holes[0];
  assert.equal(hole.x + hole.width / 2, heart.x + heart.width / 2, "cut-out centred on the heart (x)");
  assert.equal(hole.y + hole.height / 2, heart.y + heart.height / 2, "cut-out centred on the heart (y)");
  assert.ok(hole.width >= heart.width && hole.radius === hole.width / 2, "a round cut-out around the whole heart");
  assert.equal(ring.props.pulse, true, "the heart pulses once");
  const card = find(tree, n => typeof n.type === "function" && n.props?.step === "favorite");
  assert.equal(card.props.index, 2); assert.equal(card.props.total, 3);
  const wrapper = find(tree, n => n.props?.accessibilityViewIsModal);
  const pos = wrapper.props.style[1];
  assert.ok("bottom" in pos && 874 - pos.bottom <= hole.y, "the card sits above the heart, never over it");
  card.props.onNext("favorite");
  assert.deepEqual(nexts, ["favorite"], "Got it completes the third tip");
  h.unmount();
});

test("Tips 1 and 2 stay plain cards; Tip 3 falls back to one if the heart can't be found", async () => {
  const plain = renderHint("discard", undefined);
  const tree = plain.h.render();
  assert.notEqual(tree?.type, "Modal");
  assert.equal(find(tree, n => typeof n.type === "function").props.total, 3);
  plain.h.unmount();
  const missing = renderHint("favorite", undefined);
  missing.h.render();
  await settle(2900);
  const fallback = missing.h.render();
  assert.ok(fallback && fallback.type !== "Modal", "never blocks the review without a heart to point at");
  assert.ok(find(fallback, n => typeof n.type === "function" && n.props?.step === "favorite"));
  missing.h.unmount();
});

for (const legacy of [false, true]) {
  test(`skipping Home still shows all three tips and saves acknowledgments (${legacy ? "legacy completion" : "fresh install"})`, async () => {
    const saved = new Map(); let tail = Promise.resolve();
    const load = makeLoader({ "./repository": { storage: { getValue: async k => saved.get(k), setValue: async (k, v) => saved.set(k, v) }, serialize: fn => { const p = tail.then(fn); tail = p; return p; } } });
    const { homeTourStore } = load("services/home-tour.ts");
    const { reviewGuidance } = load("services/review-guidance.ts");
    if (legacy) saved.set("reviewGuidance:v1", { browse: true, discard: true, favorite: true });
    await homeTourStore.start("onboarding");
    await homeTourStore.shown();
    await homeTourStore.finish("skipped");
    assert.equal((await homeTourStore.load()).outcome, "skipped");
    const useGuidance = () => hooks("components/pictopia/review-hint.tsx", "useReviewGuidance", {
      "react-native": { AccessibilityInfo: {}, Modal: "Modal", Platform: { OS: "ios" }, Pressable: "Pressable", View: "View", useWindowDimensions: () => ({}) },
      "react-native-safe-area-context": { useSafeAreaInsets: () => ({}) },
      "expo-router": {},
      "react-native-reanimated": { default: {}, cancelAnimation() {} },
      "./ui": {}, "./tour-targets": {}, "./spotlight": {},
      "@/services/review-guidance": { reviewGuidance },
    }, [true, true]);
    let g = useGuidance(); g.render(); await settle(10);
    let api = g.render();
    for (const step of ["browse", "discard", "favorite"]) {
      assert.equal(api.step, step);
      api.complete(step === "favorite" ? "browse" : step === "browse" ? "favorite" : "browse"); // out of order: ignored
      assert.equal(g.render().step, step);
      api.complete(step); await settle(5); api = g.render();
    }
    assert.equal(api.step, undefined, "all three done");
    assert.deepEqual(saved.get("reviewGuidance:v1"), { browse: true, discard: true, favorite: true, acknowledged: true });
    g.unmount();
    g = useGuidance(); g.render(); await settle(10);
    assert.equal(g.render().step, undefined, "reopening the reviewer doesn't repeat any tip");
    g.unmount();
  });
}
