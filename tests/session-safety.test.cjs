const test = require("node:test");
const assert = require("node:assert/strict");
const { makeLoader } = require("./loader.cjs");
const { DatabaseSync, media, platform, boot } = require("./native-harness.cjs");
const { defaultPreferences } = makeLoader()("lib/pictopia/types.ts");
const { countsAsReviewTime, sessionTally } = makeLoader()("lib/pictopia/sessions.ts");
const prefs = { ...defaultPreferences, includeFavorites: true };
// Distinct creation times give a deterministic newest-first "recent" order: a, b, c, d, e.
const library = ["a", "b", "c", "d", "e"].map((id, i) =>
  media(id, { created: 1000 - i, size: 10 }),
);
async function started(p = platform({ library: library.map((m) => m.id), records: library })) {
  const db = new DatabaseSync(":memory:");
  const app = await boot(db, p);
  await app.repository.ingest(library, 1);
  const s = await app.repository.start("recent", prefs);
  assert.deepEqual(s.ids, ["a", "b", "c", "d", "e"]);
  return { db, app, p, s };
}
function consistent(session) {
  const ids = session.history.map((h) => h.id);
  assert.equal(new Set(ids).size, ids.length, "no duplicate decisions");
  assert.deepEqual(ids, session.ids.slice(0, ids.length), "no skipped items");
  assert.equal(session.position, ids.length);
  assert.equal(session.reviewed, ids.length);
  assert.equal(session.kept + session.marked, session.reviewed);
}

test("every committed decision persists and resumes at the exact position after restart", async () => {
  const { db, app, p } = await started();
  await app.repository.decide("keep", "a");
  await app.repository.decide("delete", "b");
  await app.repository.decide("keep", "c");
  // Simulated force-quit: a fresh process on the same database.
  let restarted = await boot(db, p);
  let s = await restarted.storage.getValue("session");
  consistent(s);
  assert.equal(s.position, 3);
  assert.equal(s.ids[s.position], "d");
  assert.equal((await restarted.storage.get("b")).decision, "delete");
  assert.equal((await restarted.repository.start("random", prefs)).id, s.id, "resumes, not new");
  // Undo works across the persistence boundary and is itself durable.
  s = await restarted.repository.undo();
  assert.equal(s.position, 2);
  assert.equal((await restarted.storage.get("c")).decision, undefined);
  restarted = await boot(db, p);
  s = await restarted.storage.getValue("session");
  consistent(s);
  assert.equal(s.ids[s.position], "c");
  assert.equal((await restarted.storage.stats()).pending, 1);
});

test("rapid swipes cannot duplicate, skip or lose decisions", async () => {
  const { app } = await started();
  // A double-fired gesture on the same displayed item commits exactly once.
  const doubled = await Promise.allSettled([
    app.repository.decide("delete", "a"),
    app.repository.decide("delete", "a"),
    app.repository.decide("keep", "a"),
  ]);
  assert.deepEqual(
    doubled.map((r) => r.status),
    ["fulfilled", "rejected", "rejected"],
  );
  assert.match(doubled[1].reason.message, /no longer the current item/);
  // Back-to-back swipes on successive items all land, in order.
  await Promise.all([
    app.repository.decide("keep", "b"),
    app.repository.decide("delete", "c"),
    app.repository.decide("keep", "d"),
  ]);
  const s = await app.storage.getValue("session");
  consistent(s);
  assert.deepEqual(
    s.history.map((h) => [h.id, h.decision]),
    [
      ["a", "delete"],
      ["b", "keep"],
      ["c", "delete"],
      ["d", "keep"],
    ],
  );
  assert.equal((await app.storage.stats()).pending, 2);
  // A stale skip is rejected rather than skipping an item the user never saw.
  await assert.rejects(() => app.repository.skip("a"), /no longer the current item/);
  assert.equal((await app.storage.getValue("session")).position, 4);
});

test("concurrent sync, analysis, timer and decisions never corrupt session state", async () => {
  const { app, s } = await started();
  const scan = { hash: "h", version: "v" };
  await Promise.all([
    app.repository.decide("delete", "a"),
    app.repository.ingest(
      library.map((m) => ({ ...m })),
      2,
    ),
    app.repository.update("a", (m) => ({ ...m, scan })),
    app.repository.addTime(s.id, 1000),
    app.repository.decide("keep", "b"),
    app.repository.ingest(
      library.map((m) => ({ ...m })),
      3,
    ),
    app.repository.addTime(s.id, 1000),
  ]);
  const saved = await app.storage.getValue("session");
  consistent(saved);
  assert.equal(saved.position, 2);
  assert.equal((await app.storage.get("a")).decision, "delete", "sync preserved the decision");
  assert.deepEqual((await app.storage.get("a")).scan, scan, "sync preserved analysis");
  assert.equal((await app.storage.get("b")).decision, "keep");
  // An item that becomes inaccessible mid-session cannot be decided, but can be skipped.
  await app.repository.ingest(
    library.filter((m) => m.id !== "c"),
    4,
  );
  await app.repository.reconcile(4);
  await assert.rejects(() => app.repository.decide("keep", "c"), /no longer accessible/);
  const skipped = await app.repository.skip("c");
  assert.equal(skipped.position, 3);
  assert.deepEqual(
    skipped.history.map((h) => h.id),
    ["a", "b"],
    "a skip records no decision",
  );
});

test("the deletion queue stays consistent with recorded decisions", async () => {
  const { app, p } = await started();
  await app.repository.decide("delete", "a");
  await app.repository.decide("delete", "b");
  await app.repository.decide("keep", "c");
  p.onDelete = async (ids) => {
    p.library.delete(ids[0]); // only "a" is actually deleted
    throw Error("Could not delete file.");
  };
  const r = await app.deleteMarked([media("a"), media("b")], app.mediaService);
  assert.deepEqual(r.confirmed, ["a"]);
  assert.deepEqual(r.remaining, ["b"]);
  const stats = await app.storage.stats();
  assert.equal(stats.pending, 1);
  assert.deepEqual(
    (await app.storage.query({ decision: "delete", limit: 10 })).map((m) => m.id),
    ["b"],
  );
  // Session history is unchanged by deletion; undo works on the kept item.
  let s = await app.storage.getValue("session");
  consistent(s);
  s = await app.repository.undo();
  assert.equal(s.position, 2);
  await app.repository.decide("keep", "c");
  // An in-flight deletion locks the item's decision.
  await app.storage.setValue("deletionAttempt", {
    id: "x",
    ids: ["d"],
    scope: "full",
    started: 1,
    phase: "requested",
  });
  await app.storage.put([{ ...(await app.storage.get("d")), decision: "delete" }]);
  await assert.rejects(() => app.repository.decide("keep", "d"), /still being checked/);
  assert.equal((await app.storage.getValue("session")).position, 3);
  // Undoing back onto an item that was confirmed deleted is refused, not silently "restored".
  await app.storage.setValue("deletionAttempt", null);
  await app.storage.put([], {
    session: {
      ...(await app.storage.getValue("session")),
      history: s.history.slice(0, 1),
      position: 1,
    },
  });
  await assert.rejects(() => app.repository.undo(), /no longer available/);
  assert.equal((await app.storage.get("a")).active, false);
});

test("re-deciding an item awaiting deletion verification stops tracking it", async () => {
  const { app } = await started();
  await app.storage.put([], {
    deletionPending: [{ id: "a", scope: "limited", os: "unknown", since: 1 }],
  });
  await app.repository.decide("delete", "a");
  assert.equal((await app.storage.getValue("deletionPending")).length, 1, "still marked");
  await app.repository.undo();
  assert.deepEqual(await app.storage.getValue("deletionPending"), [], "no longer marked");
});

test("review time only accrues while foregrounded, visible and showing media", () => {
  const base = { active: true, visible: true, ready: true, delta: 1000 };
  assert.equal(countsAsReviewTime(base), true);
  assert.equal(countsAsReviewTime({ ...base, active: false }), false, "AppState inactive");
  assert.equal(countsAsReviewTime({ ...base, visible: false }), false, "browser tab hidden");
  assert.equal(countsAsReviewTime({ ...base, ready: false }), false, "media still loading");
  assert.equal(countsAsReviewTime({ ...base, delta: 60000 }), false, "suspended gap");
  assert.equal(countsAsReviewTime({ ...base, delta: -5 }), false, "clock moved backwards");
});

test("restored items stop counting as set aside; verified deletions still count", async () => {
  const { app, p } = await started();
  await app.repository.decide("delete", "a");
  await app.repository.decide("delete", "b");
  await app.repository.decide("keep", "c");
  await app.repository.decide("delete", "d");
  let session = await app.storage.getValue("session");
  assert.deepEqual(await app.repository.tally(session), { reviewed: 4, kept: 1, setAside: 3 });
  // Restoring from the queue returns the item to unreviewed: neither set aside nor kept.
  await app.repository.restore(["b"]);
  assert.deepEqual(await app.repository.tally(session), { reviewed: 3, kept: 1, setAside: 2 });
  assert.equal((await app.storage.stats()).pending, 2, "matches the live queue");
  // A verified deletion was set aside and acted on, so it still counts.
  const r = await app.deleteMarked([media("a")], app.mediaService);
  assert.deepEqual(r.confirmed, ["a"]);
  assert.ok((await app.storage.get("a")).deletedAt > 0);
  assert.deepEqual(await app.repository.tally(session), { reviewed: 3, kept: 1, setAside: 2 });
  assert.equal((await app.storage.stats()).pending, 1);
  // A restored item that later leaves view is not resurrected as set aside.
  p.library.delete("b");
  await app.repository.ingest(
    library.filter((m) => !["a", "b"].includes(m.id)),
    9,
  );
  await app.repository.reconcile(9);
  assert.deepEqual(await app.repository.tally(session), { reviewed: 3, kept: 1, setAside: 2 });
  // Restoring everything clears the set-aside count entirely; the saved record is unchanged.
  await app.repository.restore(["d"]);
  session = await app.storage.getValue("session");
  assert.equal(session.marked, 3, "historical counter untouched");
  assert.deepEqual(await app.repository.tally(session), { reviewed: 2, kept: 1, setAside: 1 });
});

test("session tallies count each item once from its current state", () => {
  const session = {
    history: [
      { id: "a", decision: "delete", position: 0 },
      { id: "b", decision: "keep", position: 1 },
      { id: "c", decision: "delete", position: 2 },
      { id: "x", decision: "delete", position: 3 },
    ],
  };
  const current = [
    media("a", { decision: "delete" }),
    media("a", { decision: "delete" }),
    media("b", { decision: "keep" }),
    media("c"), // restored
    undefined, // record missing
    media("z", { decision: "delete" }), // not part of this session
  ];
  assert.deepEqual(sessionTally(session, current), { reviewed: 2, kept: 1, setAside: 1 });
});
