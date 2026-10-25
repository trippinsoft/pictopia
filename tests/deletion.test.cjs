const test = require("node:test");
const assert = require("node:assert/strict");
const { makeLoader } = require("./loader.cjs");
const { DatabaseSync, media, platform, boot, never, tick } = require("./native-harness.cjs");
const logic = makeLoader()("lib/pictopia/deletion.ts");
const hooks = () => {
  const calls = [];
  return {
    calls,
    beforeRequest: async (ids, scope) => void calls.push(["before", ids, scope]),
    afterRequest: async (os) => void calls.push(["after", os]),
  };
};
const items = (...ids) => ids.map((id) => media(id, { decision: "delete" }));
async function seeded(p, sizes = { a: 100, b: 200, c: 400 }) {
  const db = new DatabaseSync(":memory:");
  const app = await boot(db, p);
  await app.storage.put(
    Object.entries(sizes).map(([id, size]) => media(id, { decision: "delete", size })),
  );
  return { db, app };
}
const cleanup = async (app) =>
  (await app.storage.getValue("confirmedCleanup")) ?? { count: 0, estimatedBytes: 0 };
const queued = async (app) =>
  (await app.storage.query({ decision: "delete", limit: 100 })).map((m) => m.id).sort();

// PIC-001: platform deletion verification (services/media.native.ts)

test("full access: OS success with verified absence confirms every item", async () => {
  const p = platform();
  const h = hooks();
  const { mediaService } = await boot(new DatabaseSync(":memory:"), p);
  const r = await mediaService.remove(items("a", "b"), h);
  assert.equal(r.status, "confirmed");
  assert.deepEqual(r.confirmed, ["a", "b"]);
  assert.deepEqual(h.calls, [
    ["before", ["a", "b"], "full"],
    ["after", "success"],
  ]);
});

test("limited access: items outside the selection are never requested or confirmed", async () => {
  const p = platform({ access: "limited", selected: ["a"] });
  const { mediaService } = await boot(new DatabaseSync(":memory:"), p);
  const r = await mediaService.remove(items("a", "b"), hooks());
  assert.deepEqual(p.requests, [["a"]]);
  assert.deepEqual(r.confirmed, ["a"]);
  assert.deepEqual(r.skipped, ["b"]);
  assert.equal(r.status, "partial");
  assert.ok(p.library.has("b"), "unselected asset still exists");
});

test("limited access: disappearing from view without OS success is never proof of deletion", async () => {
  const p = platform({ access: "limited" });
  // The OS fails, and meanwhile the asset drops out of the limited selection.
  p.onDelete = async () => {
    p.selected.delete("a");
    throw Error("Couldn't remove assets: unknown error");
  };
  const { mediaService } = await boot(new DatabaseSync(":memory:"), p);
  const r = await mediaService.remove(items("a", "b"), hooks());
  assert.equal(r.os, "error");
  assert.deepEqual(r.confirmed, []);
  assert.deepEqual(r.uncertain, ["a"]);
  assert.deepEqual(r.remaining, ["b"]);
  assert.equal(r.status, "uncertain");
});

test("Android 14 partial access behaves like iOS limited access", async () => {
  const p = platform({ os: "android", access: "limited", selected: ["a", "b"] });
  p.onDelete = async (ids) => {
    // Android deletes row by row and can fail part-way.
    p.library.delete(ids[0]);
    throw Error("Could not delete file.");
  };
  const { mediaService } = await boot(new DatabaseSync(":memory:"), p);
  const r = await mediaService.remove(items("a", "b"), hooks());
  assert.deepEqual(r.confirmed, [], "absence under partial access without OS success is unproven");
  assert.deepEqual(r.uncertain, ["a"]);
  assert.deepEqual(r.remaining, ["b"]);
});

test("partial success under full access confirms only verified-absent items", async () => {
  const p = platform({ os: "android" });
  p.onDelete = async (ids) => {
    p.library.delete(ids[0]);
    throw Error("Could not delete file.");
  };
  const { mediaService } = await boot(new DatabaseSync(":memory:"), p);
  const r = await mediaService.remove(items("a", "b", "c"), hooks());
  assert.equal(r.status, "partial");
  assert.deepEqual(r.confirmed, ["a"]);
  assert.deepEqual(r.remaining, ["b", "c"]);
});

test("cancellation is recognized on iOS and Android and never confirms deletion", async () => {
  for (const [os, failure] of [
    ["ios", Error("Couldn't remove assets: (PHPhotosErrorDomain error 3072.)")],
    ["android", Error("User didn't grant write permission to requested files.")],
    ["ios", false],
  ]) {
    const p = platform({ os });
    p.onDelete = async () => {
      if (failure) throw failure;
      return false;
    };
    const { mediaService } = await boot(new DatabaseSync(":memory:"), p);
    const r = await mediaService.remove(items("a", "b"), hooks());
    assert.equal(r.status, "cancelled", os);
    assert.deepEqual(r.confirmed, []);
    assert.deepEqual(r.remaining, ["a", "b"]);
  }
});

test("permission changes during the OS request prevent confirmation", async () => {
  for (const next of ["limited", "none"]) {
    const p = platform();
    p.onDelete = async (ids) => {
      p.deleteVisible(ids);
      p.access = next;
      return true;
    };
    const { mediaService } = await boot(new DatabaseSync(":memory:"), p);
    const r = await mediaService.remove(items("a"), hooks());
    assert.deepEqual(r.confirmed, [], next);
    assert.deepEqual(r.uncertain, ["a"], next);
  }
  // A scope change while verifying makes absence ambiguous as well.
  const p = platform();
  let n = 0;
  p.onLookup = async () => {
    if (++n === 2) p.access = "limited";
  };
  const { mediaService } = await boot(new DatabaseSync(":memory:"), p);
  const r = await mediaService.remove(items("a"), hooks());
  assert.deepEqual(r.confirmed, []);
});

test("inaccessible, changed and unreadable assets are handled without false success", async () => {
  const p = platform({ library: ["a", "b", "c", "d"] });
  p.library.delete("b"); // gone before the request: never sent
  const { mediaService } = await boot(new DatabaseSync(":memory:"), p);
  const changed = media("c", { decision: "delete", width: 10 }); // edited outside Pictopia
  p.onDelete = async (ids) => {
    p.deleteVisible(ids);
    p.lookupErrors.add("d"); // post-deletion lookup fails
    return true;
  };
  const r = await mediaService.remove([...items("a", "b"), changed, ...items("d")], hooks());
  assert.deepEqual(p.requests, [["a", "d"]]);
  assert.deepEqual(r.confirmed, ["a"]);
  assert.deepEqual(r.uncertain, ["d"]);
  assert.deepEqual(r.skipped, ["b", "c"]);
  // Lookup errors are never treated as deletion, even when an enumeration omits the item.
  assert.ok(!r.confirmed.includes("d"));
});

test("no OS request is made without access or without a persisted journal", async () => {
  const p = platform({ access: "none" });
  const { mediaService } = await boot(new DatabaseSync(":memory:"), p);
  await assert.rejects(() => mediaService.remove(items("a"), hooks()), /Photo access changed/);
  p.access = "all";
  await assert.rejects(() =>
    mediaService.remove(items("a"), {
      beforeRequest: async () => {
        throw Error("disk full");
      },
      afterRequest: async () => {},
    }),
  );
  assert.deepEqual(p.requests, []);
});

test("classification rules and user-facing messages are accurate", () => {
  assert.equal(logic.verdict("absent", "unknown", "full", "full"), "confirmed");
  assert.equal(logic.verdict("absent", "success", "limited", "limited"), "confirmed");
  assert.equal(logic.verdict("absent", "unknown", "limited", "limited"), "uncertain");
  assert.equal(logic.verdict("absent", "success", "full", "limited"), "uncertain");
  assert.equal(logic.verdict("absent", "success", undefined, "limited"), "uncertain");
  assert.equal(logic.verdict("unknown", "success", "full", "full"), "uncertain");
  assert.equal(logic.verdict("present", "success", "full", "full"), "remaining");
  assert.equal(logic.accessScope({ granted: true }), "limited");
  assert.equal(logic.deletionErrorKind(Error("Media Library permission is required")), "error");
  const r = logic.summarize("error", {
    requested: ["a", "b", "c"],
    confirmed: ["a"],
    remaining: ["b"],
    uncertain: ["c"],
    skipped: ["d"],
  });
  assert.equal(r.status, "partial");
  const message = logic.deletionMessage(r);
  assert.match(message, /^1 item confirmed deleted/);
  assert.match(message, /1 item was not deleted/);
  assert.match(message, /1 item could not be verified/);
  assert.match(message, /1 item was unavailable/);
  assert.equal(
    logic.deletionMessage(logic.summarize("cancelled", { ...r, confirmed: [], uncertain: [] })),
    "Deletion cancelled. Everything stays in your review queue.",
  );
  assert.doesNotMatch(
    logic.deletionMessage(logic.summarize("success", { ...r, confirmed: [], remaining: [] })),
    /deleted\./,
  );
});

// PIC-002: journaled deletion, atomic finalization and startup recovery (services/deletion.ts)

test("a completed deletion leaves the queue, counts once and clears the journal", async () => {
  const p = platform();
  const { app } = await seeded(p);
  const r = await app.deleteMarked([media("a"), media("b")], app.mediaService);
  assert.equal(r.status, "confirmed");
  assert.deepEqual(await queued(app), ["c"]);
  assert.equal((await app.storage.get("a")).active, false);
  assert.deepEqual(await cleanup(app), { count: 2, estimatedBytes: 300 });
  assert.equal(await app.storage.getValue("deletionAttempt"), null);
  assert.equal(await app.recoverDeletions(app.mediaService), null);
  assert.deepEqual(await cleanup(app), { count: 2, estimatedBytes: 300 });
});

test("restored or unmarked items are not sent, and cancellation keeps the queue", async () => {
  const p = platform();
  const { app } = await seeded(p);
  await app.repository.restore(["b"]);
  p.onDelete = async () => {
    throw Error("Couldn't remove assets: (PHPhotosErrorDomain error 3072.)");
  };
  const r = await app.deleteMarked([media("a"), media("b")], app.mediaService);
  assert.deepEqual(p.requests, [["a"]]);
  assert.equal(r.status, "cancelled");
  assert.deepEqual(await queued(app), ["a", "c"]);
  assert.deepEqual(await cleanup(app), { count: 0, estimatedBytes: 0 });
  assert.equal(await app.storage.getValue("deletionAttempt"), null);
});

test("interrupted before the OS request: recovery keeps the queue and counts nothing", async () => {
  const p = platform();
  const { db, app } = await seeded(p);
  // Crash immediately after the journal is written, before the OS call.
  void app.mediaService.remove([media("a", { decision: "delete" })], {
    beforeRequest: async (ids, scope) => {
      await app.storage.setValue("deletionAttempt", {
        id: "x",
        ids,
        scope,
        started: 1,
        phase: "requested",
      });
      await never();
    },
    afterRequest: async () => {},
  });
  await tick();
  assert.deepEqual(p.requests, []);
  const restarted = await boot(db, p);
  const r = await restarted.recoverDeletions(restarted.mediaService);
  assert.deepEqual(r, { interrupted: true, confirmed: [], remaining: ["a"], uncertain: [] });
  assert.deepEqual(await queued(restarted), ["a", "b", "c"]);
  assert.deepEqual(await cleanup(restarted), { count: 0, estimatedBytes: 0 });
  assert.equal(await restarted.storage.getValue("deletionAttempt"), null);
});

test("interrupted during OS confirmation: full access verifies, limited access stays pending", async (t) => {
  await t.test("full access", async () => {
    const p = platform();
    const { db, app } = await seeded(p);
    p.onDelete = async (ids) => {
      p.deleteVisible(ids); // the user approved, then the app was terminated
      return never();
    };
    void app.deleteMarked([media("a"), media("b")], app.mediaService);
    await tick();
    assert.equal((await app.storage.getValue("deletionAttempt")).phase, "requested");
    const restarted = await boot(db, p);
    const r = await restarted.recoverDeletions(restarted.mediaService);
    assert.deepEqual(r.confirmed.sort(), ["a", "b"]);
    assert.deepEqual(await cleanup(restarted), { count: 2, estimatedBytes: 300 });
    assert.deepEqual(await queued(restarted), ["c"]);
  });
  await t.test("limited access", async () => {
    const p = platform({ access: "limited" });
    const { db, app } = await seeded(p);
    p.onDelete = async (ids) => {
      p.deleteVisible(ids);
      return never();
    };
    void app.deleteMarked([media("a")], app.mediaService);
    await tick();
    let restarted = await boot(db, p);
    let r = await restarted.recoverDeletions(restarted.mediaService);
    assert.deepEqual(r.uncertain, ["a"], "no OS result recorded, so absence is unproven");
    assert.deepEqual(await cleanup(restarted), { count: 0, estimatedBytes: 0 });
    assert.equal((await restarted.storage.get("a")).decision, "delete", "decision preserved");
    assert.equal(await restarted.storage.getValue("deletionAttempt"), null);
    assert.deepEqual(
      (await restarted.storage.getValue("deletionPending")).map((x) => x.id),
      ["a"],
    );
    // Repeated recovery while still ambiguous changes nothing.
    r = await restarted.recoverDeletions(restarted.mediaService);
    assert.deepEqual(r, { interrupted: false, confirmed: [], remaining: [], uncertain: ["a"] });
    // Once the user grants full access, absence becomes authoritative and counts exactly once.
    p.access = "all";
    restarted = await boot(db, p);
    r = await restarted.recoverDeletions(restarted.mediaService);
    assert.deepEqual(r.confirmed, ["a"]);
    assert.deepEqual(await cleanup(restarted), { count: 1, estimatedBytes: 100 });
    assert.deepEqual(await restarted.storage.getValue("deletionPending"), []);
    assert.equal(await restarted.recoverDeletions(restarted.mediaService), null);
    assert.deepEqual(await cleanup(restarted), { count: 1, estimatedBytes: 100 });
  });
});

test("interrupted after OS confirmation: the recorded OS success confirms under limited access", async () => {
  const p = platform({ access: "limited" });
  const { db, app } = await seeded(p);
  let deleted = false;
  p.onLookup = async () => {
    if (deleted) await never(); // terminated while verifying
  };
  p.onDelete = async (ids) => {
    p.deleteVisible(ids);
    deleted = true;
    return true;
  };
  void app.deleteMarked([media("a"), media("b")], app.mediaService);
  await tick();
  const journal = await app.storage.getValue("deletionAttempt");
  assert.equal(journal.phase, "returned");
  assert.equal(journal.os, "success");
  p.onLookup = null;
  const restarted = await boot(db, p);
  const r = await restarted.recoverDeletions(restarted.mediaService);
  assert.deepEqual(r.confirmed.sort(), ["a", "b"]);
  assert.deepEqual(await cleanup(restarted), { count: 2, estimatedBytes: 300 });
});

test("interrupted during local persistence: the update is atomic and recovery counts once", async () => {
  const p = platform();
  const db = new DatabaseSync(":memory:");
  const fault = {};
  const app = await boot(db, p, fault);
  await app.storage.put([
    media("a", { decision: "delete", size: 100 }),
    media("b", { decision: "delete", size: 200 }),
  ]);
  fault.key = "confirmedCleanup"; // the final write fails and stays failing (power loss)
  await assert.rejects(() => app.deleteMarked([media("a"), media("b")], app.mediaService));
  assert.ok(!p.library.has("a") && !p.library.has("b"), "the OS did delete them");
  // Rolled back as a unit: nothing half-applied.
  assert.deepEqual(await queued(app), ["a", "b"]);
  assert.equal((await app.storage.get("a")).active, true);
  assert.deepEqual(await cleanup(app), { count: 0, estimatedBytes: 0 });
  assert.equal((await app.storage.getValue("deletionAttempt")).os, "success");
  for (let i = 0; i < 3; i++) {
    const restarted = await boot(db, p);
    await restarted.recoverDeletions(restarted.mediaService);
    assert.deepEqual(await cleanup(restarted), { count: 2, estimatedBytes: 300 }, `run ${i}`);
    assert.deepEqual(await queued(restarted), []);
  }
});

test("journals written by earlier versions are recovered conservatively", async () => {
  for (const [access, expected] of [
    ["all", { confirmed: ["a"], uncertain: [] }],
    ["limited", { confirmed: [], uncertain: ["a"] }],
  ]) {
    const p = platform({ access });
    const { db, app } = await seeded(p);
    await app.storage.setValue("deletionAttempt", { ids: ["a", "b"], started: 1 });
    p.library.delete("a");
    const restarted = await boot(db, p);
    const r = await restarted.recoverDeletions(restarted.mediaService);
    assert.deepEqual(r.confirmed, expected.confirmed, access);
    assert.deepEqual(r.uncertain, expected.uncertain, access);
    assert.deepEqual(r.remaining, ["b"]);
    assert.equal(await restarted.storage.getValue("deletionAttempt"), null);
  }
});

test("queue edits respect in-flight and pending deletions", async () => {
  const p = platform({ access: "limited" });
  const { app } = await seeded(p);
  await app.storage.setValue("deletionAttempt", {
    id: "x",
    ids: ["a"],
    scope: "limited",
    started: 1,
    phase: "requested",
  });
  await assert.rejects(() => app.repository.restore(["a"]), /still being checked/);
  assert.equal((await app.storage.get("a")).decision, "delete");
  await app.storage.put([], {
    deletionAttempt: null,
    deletionPending: [{ id: "a", scope: "limited", os: "unknown", since: 1 }],
  });
  await app.repository.restore(["a"]);
  assert.deepEqual(await app.storage.getValue("deletionPending"), []);
  assert.equal((await app.storage.get("a")).decision, undefined);
  // A second deletion cannot start while another journal is unresolved.
  await app.storage.setValue("deletionAttempt", { id: "y", ids: ["zzz"], started: 1 });
  p.onLookup = async () => {};
  const r = await app.deleteMarked([media("b")], app.mediaService);
  assert.equal(r.requested.length, 1, "the stale journal was recovered first");
  assert.equal(await app.storage.getValue("deletionAttempt"), null);
});

test("recovery racing a live finalization never double counts", async () => {
  const p = platform();
  const { app } = await seeded(p);
  let release;
  const gate = new Promise((r) => (release = r));
  let deleted = false,
    held = false;
  p.onDelete = async (ids) => {
    p.deleteVisible(ids);
    deleted = true;
    return true;
  };
  p.onLookup = async () => {
    if (deleted && !held) {
      held = true;
      await gate; // the live deletion's verification stalls...
    }
  };
  const deletion = app.deleteMarked([media("a"), media("b")], app.mediaService);
  await tick();
  const recovery = app.recoverDeletions(app.mediaService); // ...while recovery finalizes it
  await recovery;
  release();
  const r = await deletion;
  assert.deepEqual(await cleanup(app), { count: 2, estimatedBytes: 300 });
  assert.deepEqual(r.confirmed, ["a", "b"], "the user still hears what was verified");
  assert.deepEqual(await queued(app), ["c"]);
});
