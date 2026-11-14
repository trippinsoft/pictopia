// Videos are first-class review media: discard, review credit and deletion never depend on
// playback, and playback failures stay recoverable. Native players and PhotoKit are mocked
// here; none of this proves native playback on a device.
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeLoader } = require("./loader.cjs");
const { hooks, textOf } = require("./hook-harness.cjs");
const { DatabaseSync, media, platform, boot } = require("./native-harness.cjs");
const tick = () => new Promise((resolve) => setImmediate(resolve));
const { CLOUD_ONLY, LIBRARY_CHANGED } = makeLoader()("services/media-errors.ts");
const playback = makeLoader()("lib/pictopia/video-playback.ts");
const video = (id, extra = {}) => media(id, { type: "video", name: id + ".mov", duration: 12, width: 1920, height: 1080, ...extra });
function find(node, type) {
  if (!node || typeof node !== "object") return;
  if (node.type === type) return node;
  for (const child of [node.props?.children].flat(Infinity)) { const found = find(child, type); if (found) return found; }
}

// ---------------------------------------------------------------- ExploreCard (real component)
function cardHarness(overrides = {}) {
  const slots = [], cleanups = [];
  let cursor = 0, effects = [], dirty = false, handle;
  const same = (a, b) => a && b && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
  const react = {
    memo: (fn) => fn, forwardRef: (fn) => fn,
    useState(init) { const i = cursor++; if (!(i in slots)) slots[i] = typeof init === "function" ? init() : init;
      return [slots[i], (value) => { const next = typeof value === "function" ? value(slots[i]) : value; if (!Object.is(next, slots[i])) { slots[i] = next; dirty = true; } }]; },
    useRef(value) { const i = cursor++; return (slots[i] ??= { current: value }); },
    useMemo(fn, deps) { const i = cursor++; if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { deps, value: fn() }; return slots[i].value; },
    useCallback: (fn, deps) => react.useMemo(() => fn, deps),
    useEffect(fn, deps) { const i = cursor++; if (!same(slots[i], deps)) { slots[i] = deps; effects.push(() => { cleanups[i]?.(); cleanups[i] = fn(); }); } },
    useImperativeHandle(_, make) { handle = make(); },
  };
  react.useLayoutEffect = react.useEffect;
  const jsx = (type, props) => ({ type, props });
  const load = makeLoader({
    react,
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
    "react-native": { View: "View", Pressable: "Pressable", StyleSheet: { create: (v) => v, absoluteFill: {} }, useWindowDimensions: () => ({ width: 390 }) },
    "react-native-reanimated": {
      __esModule: true, default: { View: "AnimatedView" },
      useSharedValue: (value) => react.useRef(value), useAnimatedStyle: (fn) => fn(),
      withSpring: (v) => v, withTiming: (v, _, done) => { done?.(true); return v; }, runOnJS: (fn) => fn,
      Easing: { out: (v) => v, quad: 1, cubic: 1, bezier: () => null }, ReduceMotion: { System: "system" },
    },
    "./explore-gesture": { ExploreGesture: "ExploreGesture" },
    "./media-image": { MediaImage: "MediaImage" },
    "./video-page": { VideoPage: "VideoPage" },
    "./ui": { Icon: "Icon", Text: "Text" },
  });
  const { ExploreCard } = load("components/pictopia/explore-card.tsx");
  const calls = { availability: [], actions: [], unavailable: 0 };
  const props = {
    id: "v1", media: video("v1"), active: true, pageHeight: 700, nativeScroll: {}, motion: {},
    onBegin: () => true, onAction: (id, direction, animation) => { calls.actions.push([id, direction]); return animation; },
    onTap() {}, onEntered() {}, onZoom() {}, onAvailability: (id, ready) => calls.availability.push([id, ready]),
    onUnavailable: () => { calls.unavailable++; },
    ...overrides,
  };
  let tree;
  const render = (next = {}) => {
    Object.assign(props, next);
    for (let pass = 0; pass < 10; pass++) {
      dirty = false; cursor = 0; tree = ExploreCard(props, null);
      const todo = effects; effects = []; todo.forEach((fn) => fn());
      if (!dirty) break;
    }
    return tree;
  };
  return {
    calls, render, get handle() { return handle; },
    gesture: () => find(tree, "ExploreGesture"), poster: () => find(tree, "MediaImage"), player: () => find(tree, "VideoPage"),
  };
}

test("a video's poster alone makes it swipe-discardable and reviewed; it never has to play", async () => {
  const card = cardHarness();
  card.render();
  assert.equal(card.gesture().props.enabled, false, "nothing on screen yet");
  card.poster().props.onSettled("loaded");
  card.render();
  assert.equal(card.gesture().props.enabled, true, "the visible thumbnail is enough to discard");
  assert.equal(card.player().props.playing, false, "never played");
  assert.deepEqual(card.calls.availability.at(-1), ["v1", true], "review credit from the thumbnail, not playback");
  card.handle.discard("left");
  await tick();
  assert.deepEqual(card.calls.actions, [["v1", "left"]]);
});

test("playback failure never disables discard, and discarding a playing video stops it", async () => {
  const card = cardHarness();
  card.render();
  card.poster().props.onSettled("loaded");
  card.render();
  card.gesture().props.onTap();
  card.render();
  assert.equal(card.player().props.playing, true, "tap plays");
  // VideoPage's own failure (codec, iCloud, timeout) has no path back into discard eligibility.
  card.player().props.onPlayingChange(false);
  card.render();
  assert.equal(card.gesture().props.enabled, true);
  card.gesture().props.onTap();
  card.render();
  card.gesture().props.onCommit("right", 900);
  card.render();
  assert.equal(card.player().props.playing, false, "discard stops playback at once");
  await tick();
  assert.deepEqual(card.calls.actions, [["v1", "right"]]);
});

test("a video with no thumbnail is not discardable until playback actually shows it", () => {
  const card = cardHarness();
  card.render();
  card.poster().props.onSettled("failed");
  card.render();
  assert.equal(card.gesture().props.enabled, false, "an unidentified item cannot be marked");
  assert.equal(card.calls.unavailable, 1, "stays unreviewed, like a photo that failed to load");
  card.player().props.onReady();
  card.render();
  assert.equal(card.gesture().props.enabled, true, "first frame is evidence too");
  card.poster().props.onSettled("failed");
  card.render();
  assert.equal(card.gesture().props.enabled, true, "a late poster failure cannot undo displayed pixels");
});

test("discarded videos and photos keep the shared gesture rules", () => {
  const marked = cardHarness({ marked: true });
  marked.render();
  marked.poster().props.onSettled("loaded");
  marked.render();
  assert.equal(marked.gesture().props.enabled, false, "already discarded: Restore, not another swipe");
  const photo = cardHarness({ id: "p1", media: media("p1") });
  photo.render();
  assert.equal(photo.player(), undefined);
  photo.poster().props.onSettled("loaded");
  photo.render();
  assert.equal(photo.gesture().props.enabled, true);
});

// ------------------------------------------------- MediaImage: iCloud video poster stays local
test("an iCloud video's poster is the local platform thumbnail; nothing is downloaded to show it", async () => {
  const resolved = [], thumbnails = [], seen = [];
  const h = hooks("components/pictopia/media-image.tsx", "MediaImage", {
    "react-native": { View: "View", Platform: { OS: "ios" }, Pressable: "Button", ActivityIndicator: "Spinner", AppState: { currentState: "active", addEventListener: () => ({ remove() {} }) } },
    "expo-image": { Image: "Image" }, "./ui": { Text: "Text", Icon: "Icon" }, "./video-poster": { VideoPoster: "Poster" },
    "@/services/review-media": { reviewMedia: { thumbnail: async (m) => { thumbnails.push(m.id); return "file://thumb.jpg"; } } },
    "@/services/photo-display": { photoDisplay: async () => { throw Error("photos only"); } },
    "@/services/media": { mediaService: { resolve: async (...args) => { resolved.push(args); throw Error(CLOUD_ONLY); } } },
    "@/services/storage": { storage: {} }, "@/theming/ThemeProvider": { useTheme: () => ({ theme: { colors: { primary: "purple" } } }) },
  }, { media: video("cloud-video"), active: true, allowRetry: true, onSettled: (v) => seen.push(v) });
  try {
    h.render(); await tick();
    find(h.render(), "Image").props.onDisplay();
    assert.deepEqual(seen, ["loaded"]);
    assert.deepEqual(thumbnails, ["cloud-video"]);
    assert.deepEqual(resolved, [], "no source resolution, no download");
  } finally { h.unmount(); }
});

// ------------------------------------------------------------------- VideoPage (real component)
function videoHarness(source) {
  const s = { enabled: [], retries: 0, sources: [], plays: 0, status: "idle", error: undefined, traces: [], requests: [] };
  let player = { generation: 1 };
  const owner = { current: { pause() {}, play() { s.plays++; }, replace(uri) { s.sources.push(uri); return Promise.resolve(); } } };
  const retry = () => { s.retries++; player = { generation: player.generation + 1 }; s.status = "idle"; s.error = undefined; };
  const props = { media: video("v"), active: true, playing: false, onPlayingChange: (value) => { props.playing = value; } };
  const h = hooks("components/pictopia/video-page.tsx", "VideoPage", {
    "react-native": { ActivityIndicator: "Spinner", View: "View", StyleSheet: { absoluteFill: {} }, AppState: { currentState: "active", addEventListener: () => ({ remove() {} }) } },
    "./use-review-video": { useReviewVideo: (enabled) => { s.enabled.push(enabled); return { player: enabled === false ? undefined : player, status: s.status, currentTime: 0, owner, ended: 0, retry, error: s.error }; } },
    "expo-video": { VideoView: "VideoView" }, "./ui": { Icon: "Icon", Text: "Text" },
    "./video-scrubber": { VideoScrubber: "VideoScrubber" }, "./video-scrubber-bar": { clock: (v) => `${Math.floor(v / 60)}:${String(Math.floor(v % 60)).padStart(2, "0")}` },
    "@/services/video-source": { videoSource: (m, network, signal) => { s.requests.push(network); return source(m, network, signal); } },
    "@/lib/pictopia/review-trace": { reviewTrace: (event, data) => s.traces.push([event, data]), tracePhoto: (id) => (id ? "alias" : null) },
  }, props);
  const tap = () => { props.playing = !props.playing; return h.render(); };
  return { h, s, props, tap };
}

test("a source the player can't open falls back to the next one on a fresh player before any error shows", async () => {
  const v = videoHarness(async () => ({ uri: "ph://v", alternates: ["file:///var/mobile/Media/DCIM/IMG_1.MOV"] }));
  try {
    v.h.render(); v.tap(); await tick(); v.h.render();
    assert.equal(v.s.sources.at(-1), "ph://v", "the Photos loader is tried first");
    v.s.error = Error("Cannot Open"); v.s.status = "error";
    v.h.render(); const tree = v.h.render();
    assert.equal(v.s.retries, 1, "a fresh player");
    assert.equal(v.s.sources.at(-1), "file:///var/mobile/Media/DCIM/IMG_1.MOV");
    assert.doesNotMatch(textOf(tree), /couldn’t play/);
    assert.equal(v.props.playing, true, "the user's tap still stands");
    assert.deepEqual(v.s.requests, [false], "no second lookup");
    v.s.status = "readyToPlay"; v.h.render();
    assert.equal(v.s.plays, 1);
    // Both failing shows the honest, retryable error.
    v.s.status = "error"; v.h.render(); assert.match(textOf(v.h.render()), /couldn’t play · tap to retry/);
    assert.equal(v.s.retries, 1);
  } finally { v.h.unmount(); }
});

test("iOS playback order: Photos loader first for library files, fetched copy first after a download", () => {
  const { iosPlaybackSources: order } = playback;
  assert.deepEqual(order("file:///var/mobile/Media/DCIM/100APPLE/IMG_1.MOV", "A/L0/001", false), ["ph://A/L0/001", "file:///var/mobile/Media/DCIM/100APPLE/IMG_1.MOV"]);
  assert.deepEqual(order("file:///var/mobile/x.mp4", "A/L0/001", true), ["file:///var/mobile/x.mp4", "ph://A/L0/001"]);
  assert.deepEqual(order("file:///tmp/pictopia-video/abc.mov", "A/L0/001", false), ["file:///tmp/pictopia-video/abc.mov"], "our slow-motion export is app-owned");
  assert.deepEqual(order("https://stream/x.m3u8", "A/L0/001", true), ["https://stream/x.m3u8"]);
});

test("tap to retry after a player error really retries (it used to cancel itself)", async () => {
  const v = videoHarness(async () => ({ uri: "file://local.mov" }));
  try {
    v.h.render(); v.tap(); await tick(); v.h.render();
    v.s.status = "readyToPlay"; v.h.render();
    assert.equal(v.s.plays, 1);
    v.s.error = Error("AVFoundationErrorDomain -11828 Cannot Open file:///var/mobile/Media/DCIM/100APPLE/IMG_0001.MOV");
    v.s.status = "error";
    v.h.render();
    const failed = v.h.render();
    assert.match(textOf(failed), /couldn’t play · tap to retry/);
    assert.match(textOf(failed), /still swipe sideways to discard/);
    const trace = v.s.traces.find(([event]) => event === "video.player.failed")[1];
    assert.match(trace.detail, /-11828/, "the native reason is kept for diagnosis");
    assert.doesNotMatch(trace.detail, /var\/mobile|IMG_0001/, "but never a path or filename");
    assert.equal(v.props.playing, false);
    v.tap(); v.h.render();
    assert.equal(v.s.retries, 1, "a fresh player");
    await tick(); v.h.render();
    assert.deepEqual(v.s.requests, [false, false], "the source is looked up again");
    assert.equal(v.s.sources.at(-1), "file://local.mov", "and loaded on the new player");
    v.s.status = "readyToPlay"; v.h.render();
    assert.equal(v.s.plays, 2, "retry plays");
  } finally { v.h.unmount(); }
});

test("iCloud video: discard hint, download only on an explicit tap, tapping again cancels it", async () => {
  let aborted = 0;
  const v = videoHarness((_, network, signal) => network
    ? new Promise((_, reject) => signal.addEventListener("abort", () => { aborted++; reject(Error("Cancelled")); }))
    : Promise.reject(Object.assign(Error(CLOUD_ONLY), { code: "VIDEO_CLOUD" })));
  try {
    v.h.render(); v.tap(); await tick();
    let text = textOf(v.h.render());
    assert.match(text, /In iCloud · tap to download and play/);
    assert.match(text, /discard without downloading/);
    assert.deepEqual(v.s.requests, [false], "first tap never downloads");
    v.tap();
    text = textOf(v.h.render());
    assert.match(text, /Downloading from iCloud/);
    assert.deepEqual(v.s.requests, [false, true]);
    v.tap(); await tick();
    assert.equal(aborted, 1, "the download is cancelled natively");
    assert.match(textOf(v.h.render()), /In iCloud · tap to download/, "and can be started again");
  } finally { v.h.unmount(); }
});

test("leaving a video while it loads cancels the work and releases the player; returning initializes again", async () => {
  const pending = [];
  const v = videoHarness((_, __, signal) => new Promise((resolve, reject) => { pending.push(resolve); signal.addEventListener("abort", () => reject(Error("Cancelled"))); }));
  try {
    v.h.render(); v.tap();
    v.props.active = false; v.h.render(); v.h.render();
    assert.equal(v.s.enabled.at(-1), false, "no native player for an off-screen video");
    assert.equal(v.props.playing, false);
    pending[0]({ uri: "file://late.mov" }); await tick(); v.h.render();
    assert.ok(!v.s.sources.includes("file://late.mov"), "a late result cannot load into anything");
    v.props.active = true; v.h.render();
    assert.equal(v.s.enabled.at(-1), true);
    v.tap(); await tick();
    pending[1]({ uri: "file://again.mov" }); await tick(); v.h.render();
    assert.equal(v.s.sources.at(-1), "file://again.mov");
    v.s.status = "readyToPlay"; v.h.render();
    assert.equal(v.s.plays, 1, "playback initializes again on return");
  } finally { v.h.unmount(); }
});

test("an unsupported or unreadable video gets an accurate, recoverable message without automatic retries", async () => {
  const v = videoHarness(async () => { throw Object.assign(Error("This video couldn’t be prepared for playback. (AVFoundationErrorDomain -11838)"), { code: "VIDEO_UNSUPPORTED" }); });
  try {
    v.h.render(); v.tap(); await tick();
    assert.match(textOf(v.h.render()), /couldn’t play · tap to retry/);
    for (let i = 0; i < 5; i++) { v.h.render(); await tick(); }
    assert.deepEqual(v.s.requests, [false], "no expensive retrieval is repeated on its own");
  } finally { v.h.unmount(); }
});

test("player lifecycle: one native player only while on screen, none leaked across rapid scrolling", async () => {
  const made = [];
  const h = hooks("components/pictopia/use-review-video.ts", "useReviewVideo", {
    "expo-video": { createVideoPlayer: () => { const p = { released: false, events: {}, pause() {}, play() {}, replaceAsync: async () => {}, release() { assert.equal(this.released, false, "double release"); this.released = true; }, addListener(name, fn) { this.events[name] = fn; return { remove: () => { delete this.events[name]; } }; } }; made.push(p); return p; } },
  }, [false]);
  h.render([false]);
  assert.equal(made.length, 0, "an off-screen card creates no player");
  for (let i = 0; i < 20; i++) { h.render([true]); h.render([false]); }
  await tick();
  assert.equal(made.length, 20);
  assert.ok(made.every((p) => p.released && !Object.keys(p.events).length), "every player released and detached");
  const result = (h.render([true]), h.render([true]));
  made.at(-1).events.statusChange({ status: "error", error: { message: "Cannot Open" } });
  const failed = h.render([true]);
  assert.equal(failed.status, "error"); assert.equal(failed.error, "Cannot Open");
  assert.ok(result.owner.current);
  h.unmount(); await tick();
  assert.ok(made.every((p) => p.released));
});

// ------------------------------------------------------------------ video source resolution
function source(os, native, resolve = async () => ({ uri: "file:///storage/emulated/0/DCIM/Camera/VID.mp4" })) {
  return makeLoader({ "react-native": { Platform: { OS: os } }, "expo-modules-core": { requireOptionalNativeModule: () => native },
    "@/services/media": { mediaService: { resolve } } })("services/video-source.native.ts").videoSource;
}

test("iOS: local playback never touches the network; leaving cancels the PhotoKit request", async () => {
  const calls = [], cancelled = [];
  let finish;
  const videoSource = source("ios", {
    reviewVideoPlayback: (id, token, network) => { calls.push([id, network]); return new Promise((resolve) => { finish = resolve; }); },
    cancelReviewDisplay: async (token) => { cancelled.push(token); },
  }, async () => assert.fail("expo-media-library export is not used on current builds"));
  const controller = new AbortController();
  const pending = videoSource(video("uuid/L0/001"), false, controller.signal);
  await tick();
  assert.deepEqual(calls, [["uuid/L0/001", false]], "complete identifier, local only");
  controller.abort();
  assert.equal(cancelled.length, 1);
  assert.match(cancelled[0], /^video:/);
  finish("file:///tmp/x.mov");
  assert.deepEqual(await pending, { uri: "ph://uuid/L0/001", alternates: ["file:///tmp/x.mov"] });
});

test("Android plays the MediaStore content URI after proving the item still exists", async () => {
  const videoSource = source("android", null);
  assert.deepEqual((await videoSource(video("4821"), false, new AbortController().signal)).uri, "content://media/external/video/media/4821");
  const removed = source("android", null, async () => { throw Error("This media item is unavailable. Check library access."); });
  await assert.rejects(removed(video("4822"), false, new AbortController().signal), (error) => playback.classifyVideoError(error, false) === "inaccessible");
});

test("older iOS binaries keep the previous local-then-explicit-iCloud path", async () => {
  const legacy = [];
  const videoSource = source("ios", { reviewVideoSource: async (id) => { legacy.push(id); return "https://stream"; } }, async () => { throw Error(CLOUD_ONLY); });
  await assert.rejects(videoSource(video("v"), false, new AbortController().signal), new RegExp(CLOUD_ONLY));
  assert.deepEqual(legacy, []);
  assert.equal((await videoSource(video("v"), true, new AbortController().signal)).uri, "https://stream");
});

test("failure classification separates iCloud, missing access and retryable playback failures", () => {
  const { classifyVideoError: kind, videoErrorDetail: detail } = playback;
  assert.equal(kind(Error(CLOUD_ONLY), false), "cloud");
  assert.equal(kind(Object.assign(Error("x"), { code: "VIDEO_CLOUD" }), false), "cloud");
  assert.equal(kind(Error(CLOUD_ONLY), true), "failed", "a download that still can't reach iCloud is retryable");
  assert.equal(kind(Error("This photo is unavailable. Check Photos access."), false), "inaccessible");
  assert.equal(kind(Error("This photo is no longer available. Check library access."), false), "inaccessible");
  assert.equal(kind(Error("Video couldn’t open. Check your connection and photo access, then retry."), true), "failed", "a network failure is not an access problem");
  assert.equal(kind(Error("Cannot Open"), false), "failed");
  assert.equal(detail(Object.assign(Error("Failed for ph://ABC/L0/001 at /var/mobile/Media/x.MOV"), { code: "E" })), "E: Failed for <uri> at <path>");
  assert.equal(playback.androidVideoUri("not-numeric"), undefined);
});

// ------------------------------------------------- discard / undo / restore / delete a video
async function videoReview(ids) {
  const db = new DatabaseSync(":memory:");
  const p = platform({ library: ids });
  for (const id of ids) p.records.set(id, video(id));
  const lookup = p.ml.getAssetInfoAsync;
  p.ml.getAssetInfoAsync = async (id) => { const a = await lookup(id); return a && { ...a, mediaType: "video" }; };
  const app = await boot(db, p);
  await app.storage.put(ids.map((id) => video(id)));
  const X = makeLoader()("lib/pictopia/explore.ts");
  const key = "adventure:videos:explore";
  await app.storage.setValue(key, { ...X.createExplore(ids, 1), review: true });
  const store = makeLoader({ ...p.mocks, "./repository": app, "./media": { mediaService: app.mediaService } })("services/explore.ts").exploreStoreFor(key);
  return { p, app, store };
}

test("a video's discard is a reversible mark: undo and restore return the same asset to its slot", async () => {
  const { app, store } = await videoReview(["v1", "v2"]);
  let s = await store.change((c) => ({ type: "discard", id: "v1", revision: c.revision, direction: "left" }));
  assert.equal(s.records.v1.queued, true);
  assert.equal((await app.storage.get("v1")).decision, "delete", "marked, not deleted");
  s = await store.change({ type: "undo", id: "v1" });
  assert.equal(s.activeId, "v1"); assert.equal(s.records.v1?.queued ?? false, false);
  assert.equal((await app.storage.get("v1")).decision, undefined);
  await store.change((c) => ({ type: "discard", id: "v1", revision: c.revision, direction: "right" }));
  s = await store.change({ type: "restore", id: "v1" });
  assert.equal(s.records.v1.queued, false);
  const restored = await app.storage.get("v1");
  assert.equal(restored.decision, undefined); assert.equal(restored.type, "video"); assert.equal(restored.id, "v1");
});

test("deleting videos still requires the explicit, verified OS request; removed or inaccessible videos are never sent", async () => {
  const { p, app } = await videoReview(["v1", "gone", "elsewhere"]);
  const hooksFor = () => ({ beforeRequest: async () => {}, afterRequest: async () => {} });
  p.library.delete("gone"); // removed in Photos meanwhile
  const items = ["v1", "gone"].map((id) => video(id, { decision: "delete" }));
  const r = await app.mediaService.remove(items, hooksFor());
  assert.deepEqual(p.requests, [["v1"]], "only the verified-present video reaches the OS");
  assert.ok(!r.confirmed.includes("elsewhere"));
  const changed = video("elsewhere", { decision: "delete", width: 640 }); // stale record
  await app.mediaService.remove([changed], hooksFor());
  assert.equal(p.requests.length, 1, "a changed asset is never deleted on a stale identity");
  p.access = "none";
  await assert.rejects(app.mediaService.remove([video("v1", { decision: "delete" })], hooksFor()), /Photo access changed/);
  assert.equal(p.requests.length, 1);
});

// --------------------------------------------------------------- library indexing retries
test("indexing restarts when the library changes mid-pass, and still fails honestly after repeated changes", async () => {
  const { withIndexRetry, INDEX_ATTEMPTS } = makeLoader()("lib/pictopia/index-retry.ts");
  const waits = [], noWait = async (ms) => { waits.push(ms); };
  let passes = 0;
  assert.equal(await withIndexRetry(async () => { if (++passes < 3) throw Error(LIBRARY_CHANGED); return "done"; }, new AbortController().signal, noWait), "done");
  assert.equal(passes, 3); assert.equal(waits.length, 2);
  passes = 0;
  await assert.rejects(withIndexRetry(async () => { passes++; throw Error(LIBRARY_CHANGED); }, new AbortController().signal, noWait), new RegExp(LIBRARY_CHANGED));
  assert.equal(passes, INDEX_ATTEMPTS);
  passes = 0;
  await assert.rejects(withIndexRetry(async () => { passes++; throw Error("Library indexing returned a repeated item. Please try again."); }, new AbortController().signal, noWait), /repeated/);
  assert.equal(passes, 1, "other integrity failures are never retried away");
  const cancelled = new AbortController(); cancelled.abort(); passes = 0;
  await assert.rejects(withIndexRetry(async () => { passes++; throw Error(LIBRARY_CHANGED); }, cancelled.signal, noWait));
  assert.equal(passes, 1);
  const provider = require("node:fs").readFileSync("components/pictopia/provider.tsx", "utf8");
  assert.match(provider, /withIndexRetry\(async \(\) => \{\n\s+epoch = Date\.now\(\);\n\s+indexedIds = new Set/, "each pass is a fresh epoch, so reconcile sees only a complete pass");
});
