// Data contract for existing installs. A library saved by the current release must open after
// any redesign with every saved key, exploration record, pending deletion and entitlement intact.
// New features may add keys; they must never rename, reshape or drop these.
const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync, media, platform, boot, CREATED } = require("./native-harness.cjs");

const DAY = 86400000;
const library = [
  media("seen", { firstSeenAt: CREATED + DAY }),
  media("fresh"),
  media("queued", { decision: "delete", firstSeenAt: CREATED + DAY, size: 2048 }),
  media("kept", { decision: "keep", firstSeenAt: CREATED + DAY }),
  media("gone", { decision: "delete", deletedAt: CREATED + 2 * DAY, firstSeenAt: CREATED + DAY, size: 4096 }),
  media("shot", { screenshot: true }),
  media("clip", { type: "video", duration: 12 }),
  media("old", { created: CREATED - 400 * DAY, month: "2024-05", day: "05-08", firstSeenAt: CREATED }),
];
// Values in the shapes the released app writes today.
const saved = {
  preferences: { haptics: true, autoplay: false, includeFavorites: false, showReviewed: false, reverse: false, appearance: "system" },
  entitlement: { active: true, expires: CREATED + 30 * DAY, verifiedAt: CREATED, managementURL: null },
  "adventures:v1": { slots: [{ adventure: { id: "adv-1" } }], parked: ["adv-2"], started: ["adv-1"], recent: ["day:06-12"], finished: 3, curated: true },
  "adventure:adv-1": { version: 1, id: "adv-1", kind: "day", source: "day:06-12", hint: { title: "On This Day", detail: "June 12, across 2 years" }, count: 2, createdAt: CREATED },
  "adventure:adv-1:explore": { version: 2, ids: ["seen", "queued"], index: 1, review: true, records: { queued: { queued: true } } },
  "verticalExplore:v1": { version: 2, ids: ["seen", "fresh"], index: 0 },
  "photoCollections:v1": ["month:2025-06", "recent"],
  "photoCollection:month:2025-06": { scope: "month:2025-06", batches: [{ sessionKey: "collection:month:2025-06:1:explore", mode: "unseen" }], position: 0, openedAt: CREATED },
  "adventureFeedback:v1": { likes: { day: 2 }, ratings: {} },
  "reviewGuidance:v1": { browse: true, discard: true },
  deletionPending: [{ id: "queued", since: CREATED }],
  confirmedCleanup: { count: 1, estimatedBytes: 4096 },
  sessionHistory: ["s-legacy"],
  "session:s-legacy": { id: "s-legacy", collection: "recent", ids: ["kept"], index: 1, kept: 1, marked: 0, finished: true },
  "memoryMatch:pairs": 4,
};

async function seed(db) {
  const app = await boot(db, platform({ library: library.map((m) => m.id), records: library }));
  await app.storage.put(library, saved);
  return app;
}

test("a library saved by the current release reopens with every saved value unchanged", async () => {
  const db = new DatabaseSync(":memory:");
  await seed(db);
  const app = await boot(db, platform({ library: library.map((m) => m.id), records: library }));
  for (const [key, value] of Object.entries(saved))
    assert.deepEqual(await app.storage.getValue(key), value, `saved key ${key} must still read back unchanged`);
  assert.equal(db.prepare("PRAGMA user_version").get().user_version, 1, "schema version stays 1 unless a tested migration exists");
});

test("exploration history, pending and confirmed deletions survive a restart", async () => {
  const db = new DatabaseSync(":memory:");
  const before = await (await seed(db)).storage.progress();
  const app = await boot(db, platform({ library: library.map((m) => m.id), records: library }));
  const after = await app.storage.progress();
  assert.deepEqual(after, before);
  assert.equal((await app.storage.get("queued")).decision, "delete", "a pending deletion stays pending");
  assert.equal((await app.storage.get("gone")).deletedAt, CREATED + 2 * DAY, "a verified deletion keeps its date");
  assert.equal((await app.storage.get("seen")).firstSeenAt, CREATED + DAY, "first-seen time never moves");
  assert.equal((await app.storage.get("clip")).type, "video", "videos stay indexed as videos");
  assert.equal((await app.storage.get("shot")).screenshot, true, "screenshot classification is kept");
});

test("photo progress counts photographs only, so videos never change library percentages", async () => {
  const db = new DatabaseSync(":memory:");
  const app = await seed(db);
  const progress = await app.storage.progress();
  const stats = await app.storage.stats();
  assert.equal(stats.videos, 1);
  assert.equal(progress.accessible + progress.deleted, library.filter((m) => m.type === "photo").length);
});

test("exploring a video records its own first-seen time without changing photo progress", async () => {
  const db = new DatabaseSync(":memory:");
  const app = await seed(db);
  const before = await app.storage.progress();
  await app.repository.encounter("clip");
  assert.ok((await app.storage.get("clip")).firstSeenAt, "the video is remembered as explored");
  assert.deepEqual(await app.storage.progress(), before, "photo percentages are untouched");
  assert.deepEqual({ ...(await app.storage.videoProgress()) }, { total: 1, explored: 1, remaining: 0 });
});
