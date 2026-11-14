// A photo that can't be displayed must never block 100%: the unavailable page offers
// "Count as reviewed" (an explicit tap through the normal review credit path), and the
// review checks whether the library says the photo is gone.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { makeLoader } = require("./loader.cjs");
const { DatabaseSync, media, platform, boot } = require("./native-harness.cjs");
const X = makeLoader()("lib/pictopia/explore.ts");
const { wallPercent } = makeLoader()("lib/pictopia/library-progress.ts");

test("counting an unviewable photo credits it like a view and completes its month", async () => {
  const db = new DatabaseSync(":memory:"), p = platform({ library: ["ok", "broken"] }), app = await boot(db, p);
  for (const id of ["ok", "broken"]) p.library.add(id), p.selected.add(id);
  await app.storage.put([media("ok", { month: "2009-10", firstSeenAt: 1 }), media("broken", { month: "2009-10" })]);
  const key = "photoCollection:month:2009-10:explore";
  await app.storage.setValue(key, { ...X.createExplore(["ok", "broken"], 1), review: true });
  const store = makeLoader({ ...p.mocks, "./repository": app, "./media": { mediaService: app.mediaService } })("services/explore.ts").exploreStoreFor(key);
  await store.change({ type: "unavailable", id: "broken" });
  const month = async () => (await app.storage.memoryWall()).find((m) => m.key === "2009-10");
  assert.equal(wallPercent(await month()), 50, "a failed load alone never counts");
  const next = await store.change({ type: "seen", id: "broken", displayedAt: Date.now() });
  assert.equal(next.records.broken.encountered, true);
  assert.equal(next.records.broken.unavailable, false);
  assert.ok((await app.storage.get("broken")).firstSeenAt, "the photo itself is credited");
  assert.equal(wallPercent(await month()), 100);
  assert.equal((await month()).remaining, 0);
  assert.equal((await app.storage.get("broken")).decision, undefined, "counting never decides or deletes");
  db.close();
});

test("the unavailable page offers Try again and Count as reviewed outside the gesture layer", () => {
  const card = fs.readFileSync("components/pictopia/explore-card.tsx", "utf8");
  const gestureEnd = card.indexOf("</ExploreGesture>");
  const page = card.indexOf("Photo unavailable");
  assert.ok(page > gestureEnd, "buttons sit outside the swipe gesture so taps reach them on device");
  assert.match(card, /Try again/);
  assert.match(card, /Count as reviewed/);
  const review = fs.readFileSync("components/pictopia/adventure-review.tsx", "utf8");
  assert.match(review, /onCountUnavailable=\{countUnavailable\}/);
  assert.match(review, /scope === "full" && presence\[id\] === "absent"/, "only a full-access absence removes the photo");
});
