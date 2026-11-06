// The shared review's endings and deletion wording, the free allowance across sessions, and
// the contracts that keep the paywall and the review's exits honest.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { makeLoader } = require("./loader.cjs");
const f = makeLoader()("lib/pictopia/review-flow.ts");
const d = makeLoader()("lib/pictopia/daily.ts");
const x = makeLoader()("lib/pictopia/explore.ts");
const read = (p) => fs.readFileSync(p, "utf8");

test("context labels follow the adventure kind and stay off collections and cleanup", () => {
  const t = new Date(2016, 9, 15, 12).getTime(); // Sat 15 Oct 2016
  assert.equal(f.contextLabel("day", t), "2016");
  assert.equal(f.contextLabel("detour", t), "2016");
  assert.equal(f.contextLabel("year", t), "Oct 2016");
  assert.equal(f.contextLabel("capsule", t), "Sat 15");
  assert.equal(f.contextLabel("screenshots", t), undefined);
  assert.equal(f.contextLabel(undefined, t), undefined);
  assert.equal(f.contextLabel("day", 0), undefined, "undated photos get no label");
});

test("leaving a review: recap only after 20 new views or any mark that is still marked", () => {
  const before = { encountered: new Set(["a"]), queued: new Set(["q"]) };
  const ids = ["a", "b", "c", "q", "u"];
  const records = { a: { encountered: true }, b: { encountered: true }, q: { encountered: true, queued: true }, u: { encountered: true, queued: false } };
  assert.deepEqual(f.visitDelta(before, { ids, records }), { viewed: 3, marked: 0 }, "already explored and earlier marks don't count");
  assert.equal(f.recapWorthy({ viewed: 19, marked: 0 }), false);
  assert.equal(f.recapWorthy({ viewed: 20, marked: 0 }), true);
  assert.equal(f.recapWorthy({ viewed: 1, marked: 1 }), true);
  // A mark made and undone in the same visit is not a mark.
  const undone = x.reduceExplore(x.reduceExplore({ ...x.createExplore(["a", "b"]), review: true }, { type: "discard", id: "a", revision: 0, direction: "left" }), { type: "undo" });
  assert.equal(f.visitDelta({ encountered: new Set(), queued: new Set() }, undone).marked, 0);
});

test("deletion results never claim more than the OS confirmed", () => {
  const base = { requested: ["a", "b"], confirmed: [], remaining: [], uncertain: [], skipped: [] };
  const cancelled = f.deletionOutcome({ ...base, status: "cancelled" }, "ios", 0);
  assert.deepEqual(cancelled, { screen: "stay", notice: "Nothing was deleted. Your photos are still marked." });
  assert.equal(f.deletionOutcome({ ...base, status: "failed" }, "ios", 0).screen, "stay");
  const all = f.deletionOutcome({ ...base, status: "confirmed", confirmed: ["a", "b"] }, "ios", 42_000_000);
  assert.equal(all.headline, "2 photos deleted");
  assert.match(all.details[0], /^About 42 MB moved to Recently Deleted/);
  assert.doesNotMatch(all.details.join(" "), /freed|recovered|saved/i, "space is never claimed as freed");
  const partial = f.deletionOutcome({ ...base, status: "partial", confirmed: ["a"], remaining: ["b"] }, "android", 0, { photos: 1, videos: 0 });
  assert.equal(partial.headline, "1 photo deleted");
  assert.match(partial.details[1], /still in your library and still marked/);
  const unsure = f.deletionOutcome({ ...base, status: "uncertain", uncertain: ["a", "b"] }, "ios", 0);
  assert.equal(unsure.headline, "Checking your cleanup");
  assert.match(unsure.details[0], /double-check 2 more/);
  assert.equal(f.deletionOutcome({ ...base, status: "confirmed", confirmed: ["v"] }, "ios", 0, { photos: 0, videos: 1 }).headline, "1 video deleted");
  assert.equal(f.deleteLabel({ photos: 10, videos: 0 }), "Delete 10 photos");
  assert.equal(f.deleteLabel({ photos: 2, videos: 1 }), "Delete 3 items");
});

test("the allowance stop: revisits and already-counted assets are free, the first new one past the limit stops", () => {
  const seq = ["a", "b", "c", "d", "e"];
  const free = (id) => id === "b";
  assert.equal(d.allowanceStop(seq, "a", 2, free), "d", "a and c use the two left; b is free");
  assert.equal(d.allowanceStop(seq, "a", 10, free), undefined);
  assert.equal(d.allowanceStop(seq, "c", 0, free), "c", "at the limit the current new photo is not shown");
  assert.equal(d.allowanceStop(seq, "b", 0, free), "c");
});

const { DatabaseSync, media, platform, boot } = require("./native-harness.cjs");
test("the allowance persists across sessions and restarts, counts each asset once a day, and Pro bypasses it", async () => {
  const db = new DatabaseSync(":memory:");
  const ids = ["a", "b", "c", "v"];
  const records = ids.map((id) => media(id, id === "v" ? { type: "video" } : {}));
  const p = platform({ library: ids, records });
  const app = await boot(db, p);
  await app.storage.put(records);
  const load = () => makeLoader({ ...p.mocks, "./repository": app })("services/daily.ts").allowanceStore;
  const day = (h, date = 4) => new Date(2026, 10, date, h).getTime();
  await app.storage.setValue("swipeLimit:v1", 10); // legacy config must not override the approved allowance
  let store = load();
  let r = await store.present("a", false, day(9)); // adventure
  assert.equal(r.left, 149);
  r = await store.present("a", false, day(10)); // the same photo in an album, another session
  assert.equal(r.left, 149, "the same asset never counts twice in a day");
  await store.present("v", false, day(11)); // a video counts too
  store = load(); // restart
  assert.equal((await store.state(day(12))).counted.length, 2, "counted ids persist across restarts");
  r = await store.present("b", true, day(12));
  assert.equal(r.left, 148, "Pro is never counted");
  for (let i = 0; i < 148; i++) await store.present(`n${i}`, false, day(13));
  r = await store.present("c", false, day(14));
  assert.equal(r.allowed, false, "past the limit a new asset is refused");
  assert.equal((await store.present("a", false, day(14))).allowed, true, "already counted stays viewable");
  assert.equal((await store.present("c", true, day(14))).allowed, true, "Pro continues past the limit");
  assert.equal((await store.state(day(0, 5))).counted.length, 0, "a new local day starts fresh");
  assert.equal((await store.state(day(9, 3))).counted.length, 150, "a clock moved backwards doesn't reset");
});

test("review exits, endings and the paywall keep their contracts", () => {
  const review = read("components/pictopia/adventure-review.tsx");
  assert.doesNotMatch(review, /onEnd=\{finish\}/, "reaching the end never finishes on its own");
  assert.match(review, /endPage=\{endPage\}/, "the end card offers Finish");
  assert.match(review, /addListener\("beforeRemove"/, "✕ and Android Back both produce the recap");
  assert.match(review, /limitPage=\{limitPage\}/);
  assert.doesNotMatch(review.slice(review.indexOf("const limitPage"), review.indexOf("const finish")), /finish\(/, "the daily limit is never a finish");
  const paywall = read("app/paywall.tsx");
  assert.doesNotMatch(paywall, /router\.replace\("\/\(tabs\)\/smart"\)/, "a purchase returns to where Pro was offered");
  assert.match(paywall, /if \(e\.active\) leave\(\)/);
  assert.match(paywall, /restorePurchases\(\)\s*\.then\(leave\)/);
  const layout = read("app/_layout.tsx");
  assert.match(layout, /name="vertical-explore" options=\{\{[^}]*gestureEnabled: false/, "iOS swipe-to-dismiss is off in review");
  const queue = read("app/queue.tsx");
  assert.match(queue, /app\.deleteQueue\(sent\)/, "only the Delete button reaches the OS");
  assert.equal((queue.match(/deleteQueue\(/g) ?? []).length, 1);
});

test("Duplicate Hunt stays closed for release, advises without pre-marking, and guards marking a whole group", () => {
  const features = makeLoader()("lib/pictopia/features.ts");
  assert.equal(features.RELEASED.duplicateHunt, false, "not released until verified on devices");
  assert.equal(features.featureOpen("duplicateHunt", undefined), false);
  assert.equal(features.featureOpen("duplicateHunt", { duplicateHunt: true }), true, "a developer can open it for device testing");
  const tags = features.keeperTags([
    { id: "a", width: 4032, height: 3024, sharpness: 80 },
    { id: "b", width: 1920, height: 1080, sharpness: 120 },
  ]);
  assert.deepEqual(tags, { b: "Sharpest", a: "Largest" });
  assert.deepEqual(features.keeperTags([{ id: "a", width: 10, height: 10 }, { id: "b", width: 10, height: 10 }]), {}, "identical copies get no tag");
  assert.equal(features.marksEverything(["a", "b", "c"], new Set(["a", "b"]), "c"), true);
  assert.equal(features.marksEverything(["a", "b", "c"], new Set(["a"]), "c"), false);
  const hunt = read("app/duplicate-hunt.tsx");
  assert.match(hunt, /repository\.setDecision\(/, "marks go through the guarded queue decision");
  assert.doesNotMatch(hunt, /deleteQueue|deleteMarked/, "Duplicate Hunt never deletes by itself");
  assert.match(read("app/(tabs)/explore.tsx"), /featureOpen\("duplicateHunt"/);
});

test("albums use the platform's word for them", () => {
  const a = makeLoader()("lib/pictopia/albums.ts");
  assert.equal(a.albumsLabel("ios"), "Albums");
  assert.equal(a.albumsLabel("android"), "Folders");
});

test("resume and the daily limit: a review keeps its place across restarts and is never finished by running out", async () => {
  const db = new DatabaseSync(":memory:");
  const ids = ["a", "b", "c", "d"];
  const p = platform({ library: ids });
  const app = await boot(db, p);
  await app.storage.put(ids.map((id) => media(id)));
  const key = "adventure:test:explore";
  await app.storage.setValue(key, { ...x.createExplore(ids), review: true });
  const load = () => makeLoader({ ...p.mocks, "./repository": app, "./media": { mediaService: app.mediaService } })("services/explore.ts").exploreStoreFor(key);
  let store = load();
  let s = await store.change((c) => ({ type: "page", id: c.activeId, revision: c.revision, toId: "b", availableIds: ids }));
  s = await store.change((c) => ({ type: "page", id: c.activeId, revision: c.revision, toId: "c", availableIds: ids }));
  assert.equal(s.activeId, "c");
  store = load(); // restart, e.g. after the paywall or the next morning
  s = await store.load();
  assert.equal(s.activeId, "c", "the same photo after a restart");
  assert.notEqual(s.finished, true);
  // Paging past the last photo (what a limit page or end card sits on) never finishes.
  s = await store.change((c) => ({ type: "page", id: c.activeId, revision: c.revision, toId: null, availableIds: ids }));
  assert.equal(s.activeId, "c");
  assert.notEqual(s.finished, true);
  assert.notEqual((await store.change({ type: "finish" })).finished, true, "a premature finish is refused");
  await store.change(c => ({ type: "page", id: c.activeId, revision: c.revision, toId: "d", availableIds: ids }));
  s = await store.change({ type: "finish" });
  assert.equal(s.finished, true, "explicit Finish at the real endpoint completes");
});
