// Native lifecycle scenarios for the review timer: the clock receives the same signals the app
// gets from React Native's AppState on iOS (active → inactive → background → active).
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeLoader } = require("./loader.cjs");
const { ReviewClock } = makeLoader()("lib/pictopia/review-clock.ts");
const { DatabaseSync, media, platform, boot } = require("./native-harness.cjs");

function clockAt() {
  let now = 1_000_000;
  const clock = new ReviewClock(() => now);
  return {
    clock,
    /** Advances wall time with the 1-second interval sampling, like the running app. */
    run(ms, step = 1000) {
      for (let t = 0; t < ms; t += step) {
        now += Math.min(step, ms - t);
        clock.sample();
      }
    },
    /** Time passes with the JS thread suspended (iOS background): no samples at all. */
    suspend(ms) {
      now += ms;
    },
  };
}
const reviewing = (c) => c.set({ focused: true, active: true, visible: true, ready: true });

test("counts only while focused, active, visible and showing a usable photo", () => {
  const t = clockAt();
  t.clock.set({ focused: true });
  t.run(5000);
  assert.equal(t.clock.unsaved, 0, "no photo ready yet");
  t.clock.set({ ready: true });
  t.run(5000);
  assert.equal(t.clock.unsaved, 5000);
  t.clock.set({ focused: false }); // navigated to Home
  t.run(10000);
  assert.equal(t.clock.unsaved, 5000);
});

test("backgrounding pauses; returning resumes automatically, even after several minutes", () => {
  const t = clockAt();
  reviewing(t.clock);
  t.run(75000); // 1:15 of review, as in the TestFlight report
  t.clock.set({ active: false }); // inactive
  t.clock.set({ active: false }); // background
  t.suspend(5 * 60 * 1000);
  t.clock.set({ active: true });
  t.run(10000);
  assert.equal(t.clock.unsaved, 85000, "resumed after the return; no background time counted");
});

test("screen lock and app switcher behave like backgrounding", () => {
  const t = clockAt();
  reviewing(t.clock);
  t.run(3000);
  t.clock.set({ active: false }); // lock: active → inactive → background
  t.suspend(60000);
  t.clock.set({ active: true }); // unlock
  t.run(2000);
  t.clock.set({ active: false }); // app switcher: inactive only
  t.run(4000); // JS keeps ticking while inactive
  t.clock.set({ active: true });
  t.run(1000);
  assert.equal(t.clock.unsaved, 6000);
});

test("a missed lifecycle event or stalled JS thread never credits the gap", () => {
  const t = clockAt();
  reviewing(t.clock);
  t.run(2000);
  t.suspend(120000); // suspended without an AppState event reaching JS
  t.run(2000);
  // The sample spanning the suspension is dropped whole; only the second after it counts.
  assert.equal(t.clock.unsaved, 3000);
});

test("time is never double-counted across signal changes and flushes", () => {
  const t = clockAt();
  reviewing(t.clock);
  let saved = 0;
  for (let i = 0; i < 30; i++) {
    t.run(700, 350);
    t.clock.set({ ready: i % 3 !== 0 }); // photo transitions toggle readiness
    saved += t.clock.take(i % 5 === 0);
  }
  saved += t.clock.take(true);
  // Only intervals where every signal held true were credited.
  assert.ok(saved > 0 && saved <= 30 * 700, `saved ${saved}`);
  assert.equal(t.clock.unsaved, 0);
});

test("flushes respect the repository's 5-second chunk and retry failed saves", () => {
  const t = clockAt();
  reviewing(t.clock);
  t.run(3000);
  assert.equal(t.clock.take(), 0, "below the periodic threshold");
  t.run(1000);
  assert.equal(t.clock.take(), 4000);
  t.run(12000);
  const chunks = [];
  for (let n = t.clock.take(true); n; n = t.clock.take(true)) chunks.push(n);
  assert.deepEqual(chunks, [5000, 5000, 2000]);
  t.clock.restore(2000);
  assert.equal(t.clock.take(true), 2000);
});

test("elapsed time survives termination and relaunch at the saved value", async () => {
  const p = platform({ library: ["a", "b"] });
  const db = new DatabaseSync(":memory:");
  let app = await boot(db, p);
  await app.repository.ingest([media("a", { created: 2 }), media("b", { created: 1 })], 1);
  const s = await app.repository.start("quick", await app.repository.preferences(), false, 2);
  const t = clockAt();
  reviewing(t.clock);
  t.run(9000);
  for (let n = t.clock.take(true); n; n = t.clock.take(true)) await app.repository.addTime(s.id, n);
  t.clock.set({ active: false }); // flushed on background, then the app is killed
  app = await boot(db, p); // relaunch
  const resumed = await app.storage.getValue("session");
  assert.equal(resumed.elapsedMs, 9000);
  const fresh = clockAt();
  reviewing(fresh.clock);
  fresh.run(3000);
  await app.repository.addTime(s.id, fresh.clock.take(true));
  assert.equal((await app.storage.getValue("session")).elapsedMs, 12000);
});
