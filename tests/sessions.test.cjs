require("fake-indexeddb/auto");
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeLoader } = require("./loader.cjs");
const load = makeLoader();
const { storage, repository } = load("services/repository.ts");
const { defaultPreferences } = load("lib/flickwell/types.ts");
const { dateKeys, SCAN_VERSION } = load("lib/flickwell/logic.ts");
const { remainingSeconds, milestone } = load("lib/flickwell/sessions.ts");
const asset = (id, created, extra = {}) => ({
  id,
  uri: "file:///" + id,
  name: id + ".jpg",
  type: "photo",
  created,
  modified: created,
  width: 100,
  height: 100,
  duration: 0,
  ...dateKeys(created),
  favorite: false,
  screenshot: false,
  active: true,
  ...extra,
});
async function fresh(items) {
  const all = await storage.query({ limit: 1000 });
  await storage.put(
    all.map((m) => ({ ...m, active: false })),
    { session: null, groups: [] },
  );
  await storage.put(items);
}
test("Smart Sessions preserve decisions, timers, real recommendations and continuity", async (t) => {
  await storage.init();
  await t.test(
    "2/5/10-minute Quick Wins use bounded unreviewed batches and prioritize screenshots",
    async () => {
      for (const minutes of [2, 5, 10]) {
        const items = Array.from({ length: 80 }, (_, i) =>
          asset("q" + i, i + 1, {
            screenshot: i === 50,
            decision: i === 0 ? "keep" : undefined,
            favorite: i === 1,
          }),
        );
        await fresh(items);
        const s = await repository.start(
          "quick",
          { ...defaultPreferences, showReviewed: true },
          false,
          minutes,
        );
        assert.equal(s.ids[0], "q50");
        assert.equal(s.ids.length, minutes * 6);
        assert.equal(s.minutes, minutes);
        assert.ok(!s.ids.includes("q0") && !s.ids.includes("q1"));
        assert.equal(new Set(s.ids).size, s.ids.length);
      }
    },
  );
  await t.test(
    "Memory Lane is chronological; starting another collection resumes exact position and order",
    async () => {
      await fresh([asset("new", 30), asset("old", 10), asset("middle", 20)]);
      const s = await repository.start("memory", defaultPreferences, false, 2);
      assert.deepEqual(s.ids, ["old", "middle", "new"]);
      await repository.decide("keep");
      await repository.addTime(s.id, 1000);
      await storage.init();
      const resumed = await repository.start("random", defaultPreferences, false, 10);
      assert.equal(resumed.id, s.id);
      assert.equal(resumed.position, 1);
      assert.equal(resumed.elapsedMs, 1000);
      assert.equal(resumed.minutes, 2);
      assert.deepEqual(resumed.ids, s.ids);
    },
  );
  await t.test(
    "Timer checkpoints serialize with decisions, cap at budget, ignore stale sessions and finished sessions",
    async () => {
      await fresh([asset("a", 1), asset("b", 2)]);
      const s = await repository.start("quick", defaultPreferences, false, 2);
      await Promise.all([repository.addTime(s.id, 1000), repository.decide("delete")]);
      let saved = await storage.getValue("session");
      assert.equal(saved.position, 1);
      assert.equal(saved.marked, 1);
      assert.equal(saved.elapsedMs, 1000);
      await repository.addTime("unrelated", 1000);
      assert.equal((await storage.getValue("session")).elapsedMs, 1000);
      await storage.put([], { session: { ...saved, elapsedMs: 119000 } });
      await repository.addTime(s.id, 5000);
      saved = await storage.getValue("session");
      assert.equal(remainingSeconds(saved), 0);
      assert.equal(saved.complete, false);
      await repository.finish(s.id);
      await repository.addTime(s.id, 1000);
      assert.equal((await storage.getValue("session")).elapsedMs, 120000);
      assert.equal((await storage.get("a")).active, true);
      assert.equal((await storage.get("b")).decision, undefined);
    },
  );
  await t.test(
    "Finishing early saves summary, leaves remaining media untouched, undo reopens original position",
    async () => {
      await fresh([asset("a", 1), asset("b", 2)]);
      const s = await repository.start("quick", defaultPreferences, false, 5);
      await repository.decide("delete");
      await repository.finish(s.id);
      const finished = await storage.getValue("session:" + s.id);
      assert.equal(finished.finishedEarly, true);
      assert.equal(finished.complete, true);
      assert.equal(finished.marked, 1);
      assert.equal((await repository.skip()).position, 1);
      const undone = await repository.undo();
      assert.equal(undone.complete, false);
      assert.equal(undone.finishedEarly, false);
      assert.equal(undone.position, 0);
      assert.equal((await storage.get("a")).decision, undefined);
      assert.equal((await storage.get("b")).decision, undefined);
    },
  );
  await t.test(
    "Best of the Bunch only uses accessible current scan groups; keeper first, no invented fallback",
    async () => {
      await fresh([
        asset("best", 1, { scan: { hash: "same", version: SCAN_VERSION + ":1" } }),
        asset("other", 2, { scan: { hash: "same", version: SCAN_VERSION + ":2" } }),
        asset("unrelated", 3),
      ]);
      const group = { id: "exact-same", kind: "exact", ids: ["other", "best"], best: "best" };
      await storage.setValue("groups", [group]);
      let s = await repository.start("best", defaultPreferences, true, 2);
      assert.deepEqual(s.ids, ["best", "other"]);
      assert.deepEqual(s.groups, [group]);
      await repository.finish(s.id);
      await repository.update("other", (m) => ({ ...m, modified: 9 }));
      s = await repository.start("best", defaultPreferences, true, 2);
      assert.deepEqual(s.ids, []);
      assert.equal(s.complete, true);
      await repository.update("other", (m) => ({ ...m, modified: 2 }));
      s = await repository.start("best", defaultPreferences, false, 2);
      assert.deepEqual(s.ids, []);
    },
  );
  await t.test("Simple milestones recognize real review counts only", () => {
    assert.equal(milestone(0), null);
    assert.equal(milestone(9), null);
    assert.match(milestone(10), /10 memories reviewed/);
    assert.equal(milestone(11), null);
  });
});
