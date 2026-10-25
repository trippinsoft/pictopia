require("fake-indexeddb/auto");
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeLoader } = require("./loader.cjs");
const load = makeLoader();
const logic = load("lib/pictopia/logic.ts");
const { defaultPreferences } = load("lib/pictopia/types.ts");
const { storage, repository } = load("services/repository.ts");
function media(id, extra = {}) {
  const created = new Date("2025-06-12T12:00:00Z").getTime();
  return {
    id,
    uri: "file:///private/" + id,
    name: id + ".jpg",
    type: "photo",
    created,
    modified: created,
    width: 1000,
    height: 1000,
    duration: 0,
    ...logic.dateKeys(created),
    favorite: false,
    screenshot: false,
    active: true,
    ...extra,
  };
}
function session(ids) {
  return {
    id: "s",
    collection: "recent",
    ids,
    position: 0,
    reviewed: 0,
    kept: 0,
    marked: 0,
    started: 0,
    history: [],
    complete: false,
  };
}
test("deciding marks locally and advances exactly once", () => {
  const m = media("a"),
    s = session(["a", "b"]);
  const r = logic.applyDecision(s, m, "delete");
  assert.equal(r.media.decision, "delete");
  assert.equal(r.session.position, 1);
  assert.equal(r.session.marked, 1);
  assert.equal(m.decision, undefined);
  assert.equal(s.position, 0);
});
test("wrong asset and completed session cannot be decided", () => {
  assert.throws(() => logic.applyDecision(session(["a"]), media("b"), "keep"));
  assert.throws(() =>
    logic.applyDecision({ ...session(["a"]), complete: true }, media("a"), "keep"),
  );
});
test("undo restores the previous queue decision and counters", () => {
  const r = logic.applyDecision(session(["a"]), media("a", { decision: "delete" }), "keep");
  const u = logic.undoDecision(r.session, r.media);
  assert.equal(u.media.decision, "delete");
  assert.equal(u.session.kept, 0);
  assert.equal(u.session.complete, false);
  assert.equal(u.session.position, 0);
});
test("undo cannot target an unrelated item", () => {
  const r = logic.applyDecision(session(["a"]), media("a"), "keep");
  assert.throws(() => logic.undoDecision(r.session, media("b")));
});
test("monthly grouping and calendar keys are deterministic in local time", () => {
  const d = new Date(2025, 11, 31, 23, 30);
  assert.deepEqual(logic.dateKeys(d.getTime()), { month: "2025-12", day: "12-31" });
});
test("shuffle is stable, seeded, and preserves all identities", () => {
  const ids = Array.from({ length: 100 }, (_, i) => i);
  assert.deepEqual(logic.shuffle(ids, 9), logic.shuffle(ids, 9));
  assert.notDeepEqual(logic.shuffle(ids, 9), logic.shuffle(ids, 10));
  assert.deepEqual(
    logic.shuffle(ids, 9).sort((a, b) => a - b),
    ids,
  );
});
test("query excludes reviewed, inaccessible, and favorite assets by default choices", () => {
  assert.equal(logic.matches(media("a", { decision: "keep" }), { unreviewed: true }), false);
  assert.equal(logic.matches(media("a", { active: false }), {}), false);
  assert.equal(
    logic.matches(media("a", { systemFavorite: true }), { excludeFavorites: true }),
    false,
  );
});
test("similarity requires temporal proximity, ratio, and genuine perceptual evidence", () => {
  const a = media("a", { scan: { perceptual: "0".repeat(64) } }),
    b = media("b", { scan: { perceptual: "1".repeat(6) + "0".repeat(58) } });
  assert.equal(logic.similar(a, b), true);
  assert.equal(logic.similar(a, { ...b, created: a.created + 120001 }), false);
  assert.equal(
    logic.similar(a, { ...b, scan: { perceptual: "1".repeat(7) + "0".repeat(57) } }),
    false,
  );
  assert.equal(logic.similar(a, media("x")), false);
});
test("quality metrics are real and constant images have no edge variance", () => {
  const constant = new Uint8ClampedArray(32 * 32 * 4).fill(128);
  const flat = logic.pixelAnalysis(constant, 32, 32);
  assert.equal(flat.sharpness, 0);
  assert.equal(flat.perceptual.length, 64);
  const noisy = constant.slice();
  for (let i = 0; i < 1024; i++) noisy[i * 4] = i % 2 ? 255 : 0;
  assert.ok(logic.pixelAnalysis(noisy, 32, 32).sharpness > flat.sharpness);
});
test("entitlements expire, lifetime remains active, and inactive never gates open", () => {
  const e = { active: true, expires: 100, verifiedAt: 0 };
  assert.equal(logic.entitlementActive(e, 99), true);
  assert.equal(logic.entitlementActive(e, 100), false);
  assert.equal(logic.entitlementActive({ ...e, expires: null }, 1000), true);
  assert.equal(logic.entitlementActive({ ...e, active: false }, 0), false);
});
test("storage estimates distinguish unknown and zero", () => {
  assert.equal(logic.bytes(undefined), "Size unavailable");
  assert.equal(logic.bytes(0), "0 B");
  assert.equal(logic.bytes(1048576), "1.0 MB");
});
test("database and repository persist session, queue, undo, changes, groups, and reconciliation", async (t) => {
  await storage.init();
  await repository.ingest(
    [
      media("a", { created: 1, screenshot: true, size: 100 }),
      media("b", { created: 2, size: 200 }),
      media("c", { created: 3, favorite: true, size: 400 }),
    ],
    1,
  );
  await t.test("quick clean excludes favorites and prioritizes screenshots", async () => {
    const s = await repository.start("quick", defaultPreferences);
    assert.deepEqual(s.ids, ["a", "b"]);
  });
  await t.test("decision and position commit together and survive reopening", async () => {
    await repository.decide("delete");
    await storage.init();
    assert.equal((await storage.get("a")).decision, "delete");
    assert.equal((await storage.getValue("session")).position, 1);
    assert.equal((await storage.stats()).pendingBytes, 100);
  });
  await t.test("undo clears only the corresponding decision", async () => {
    await repository.undo();
    assert.equal((await storage.get("a")).decision, undefined);
    assert.equal((await storage.getValue("session")).position, 0);
  });
  await t.test("restoring a pending item clears the queue", async () => {
    await repository.decide("delete");
    await repository.restore(["a"]);
    assert.equal((await storage.stats()).pending, 0);
  });
  await t.test("changed identity never inherits a previous decision", async () => {
    await storage.put([media("b", { decision: "keep" })]);
    await repository.ingest([media("b", { width: 400 })], 2);
    assert.equal((await storage.get("b")).decision, undefined);
  });
  await t.test(
    "modification invalidates analysis without replacing stable review identity",
    async () => {
      const m = media("b", { width: 400, decision: "keep", scan: { hash: "abc", version: "old" } });
      await storage.put([m]);
      await repository.ingest([{ ...m, modified: m.modified + 1 }], 2);
      assert.equal((await storage.get("b")).scan, undefined);
      assert.equal((await storage.get("b")).decision, "keep");
    },
  );
  await t.test("exact groups require file hashes, not names or dimensions", async () => {
    await storage.put([
      media("d", {
        scan: {
          hash: "same",
          version: `${logic.SCAN_VERSION}:${new Date("2025-06-12T12:00:00Z").getTime()}`,
        },
      }),
      media("e", {
        scan: {
          hash: "same",
          version: `${logic.SCAN_VERSION}:${new Date("2025-06-12T12:00:00Z").getTime()}`,
        },
      }),
      media("f"),
    ]);
    const groups = await repository.groups();
    assert.deepEqual(groups.find((g) => g.kind === "exact").ids.sort(), ["d", "e"]);
    assert.equal(
      groups.some((g) => g.ids.includes("f")),
      false,
    );
  });
  await t.test(
    "reconciliation makes inaccessible references inactive but retains decisions",
    async () => {
      await repository.ingest([media("b", { width: 400 })], 3);
      await repository.reconcile(3);
      assert.equal((await storage.get("a")).active, false);
      assert.equal((await storage.get("b")).active, true);
      assert.equal((await storage.get("b")).decision, "keep");
    },
  );
});
// Native deletion verification is covered in tests/deletion.test.cjs.
test("cached scan failures do not cause an infinite retry loop", () => {
  assert.equal(
    logic.matches(media("error", { scanError: "Unavailable" }), { scanMissing: true }),
    false,
  );
});
test("stale analysis cannot be labeled an exact duplicate", async () => {
  await storage.put([
    media("stale1", { scan: { hash: "old", version: "old" } }),
    media("stale2", { scan: { hash: "old", version: "old" } }),
  ]);
  const groups = await repository.groups();
  assert.equal(
    groups.some((g) => g.ids.includes("stale1")),
    false,
  );
});
