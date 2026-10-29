const test = require("node:test");
const assert = require("node:assert/strict");
const { makeLoader } = require("./loader.cjs");
const load = makeLoader();
const { deckReducer, initialDeck, canCommit, isReviewing } = load("lib/pictopia/swipe-machine.ts");
const { DeckController, SETTLE_TIMEOUT_MS, ANIMATION_TIMEOUT_MS, SAVE_TIMEOUT_MS } = load(
  "lib/pictopia/deck-controller.ts",
);
const { commitDirection, swipeDecision, decisionDirection } = load("lib/pictopia/swipe-physics.ts");
const { plural } = load("lib/pictopia/text.ts");

const run = (events, s = initialDeck) => events.reduce(deckReducer, s);
const flush = () => new Promise((r) => setImmediate(r));
/** Fake clock: timers fire only when the test advances time. */
function fakeTimers() {
  let now = 0,
    seq = 0;
  const timers = new Map();
  return {
    setTimer(fn, ms) {
      const id = ++seq;
      timers.set(id, { at: now + ms, fn });
      return () => timers.delete(id);
    },
    async advance(ms) {
      const until = now + ms;
      for (;;) {
        const due = [...timers.entries()]
          .filter(([, t]) => t.at <= until)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].fn();
        await flush();
      }
      now = until;
      await flush();
    },
    get pending() {
      return timers.size;
    },
  };
}
/** Session double: each id advances to the next; saves can be held, failed, or never answered. */
function harness(ids = ["a", "b", "c", "d"]) {
  const timers = fakeTimers();
  const calls = [],
    errors = [];
  let position = 0,
    mode = "auto";
  const held = [];
  const controller = new DeckController({
    setTimer: timers.setTimer,
    onChange: () => {},
    onError: (m) => errors.push(m),
    decide: (decision, id) => {
      calls.push([decision, id]);
      const apply = () => {
        if (ids[position] !== id) throw Error("This photo is no longer the current item.");
        position++;
        return ids[position];
      };
      if (mode === "auto") return Promise.resolve().then(apply);
      if (mode === "fail") return Promise.reject(Error("Disk full"));
      if (mode === "hang") return new Promise(() => {});
      return new Promise((resolve, reject) =>
        held.push(() => {
          try {
            resolve(apply());
          } catch (e) {
            reject(e);
          }
        }),
      );
    },
  });
  const show = (id) => {
    controller.sync(id);
    controller.watchTop(id, false);
  };
  return {
    controller,
    timers,
    calls,
    errors,
    held,
    show,
    setMode: (m) => (mode = m),
    get position() {
      return position;
    },
    current: () => ids[position],
  };
}

// State machine

test("a photo is interactive only once its own media has settled", () => {
  let s = run([{ type: "sync", current: "a" }]);
  assert.equal(canCommit(s, "a"), false, "waiting for media");
  s = run([{ type: "settled", id: "z" }], s);
  assert.equal(canCommit(s, "a"), false, "another photo's load event never unlocks this one");
  s = run([{ type: "settled", id: "a" }], s);
  assert.equal(canCommit(s, "a"), true);
  assert.equal(isReviewing(s), true);
});

test("provider refreshes and repeated syncs never discard readiness", () => {
  let s = run([
    { type: "sync", current: "a" },
    { type: "settled", id: "a" },
  ]);
  for (let i = 0; i < 5; i++) s = deckReducer(s, { type: "sync", current: "a" });
  assert.equal(canCommit(s, "a"), true);
  // Leaving and returning to the same photo (undo, then redo) keeps its readiness too.
  s = run(
    [
      { type: "sync", current: "b" },
      { type: "sync", current: "a" },
    ],
    s,
  );
  assert.equal(canCommit(s, "a"), true);
});

test("save and fly-out can finish in either order; the next photo follows the save", () => {
  const ready = run([
    { type: "sync", current: "a" },
    { type: "settled", id: "a" },
    { type: "commit", id: "a", decision: "keep" },
  ]);
  for (const order of [
    ["animated", "saved"],
    ["saved", "animated"],
  ]) {
    let s = ready;
    for (const type of order) s = deckReducer(s, { type, id: "a", current: "b" });
    assert.equal(s.top, "b", order.join(" then "));
    assert.equal(s.committing, undefined);
  }
  // Midway, the session moving on does not swap the card under the animation.
  const mid = run(
    [
      { type: "saved", id: "a", current: "b" },
      { type: "sync", current: "b" },
    ],
    ready,
  );
  assert.equal(mid.top, "a");
  assert.equal(isReviewing(mid), true, "the timer keeps running between photos");
});

test("duplicate commits, late events and failures cannot act on the wrong photo", () => {
  let s = run([
    { type: "sync", current: "a" },
    { type: "settled", id: "a" },
    { type: "commit", id: "a", decision: "delete" },
  ]);
  assert.equal(run([{ type: "commit", id: "a", decision: "keep" }], s), s, "second commit ignored");
  assert.equal(run([{ type: "saved", id: "b", current: "c" }], s), s, "foreign save ignored");
  s = run([{ type: "failed", id: "a" }], s);
  assert.equal(s.top, "a");
  assert.equal(canCommit(s, "a"), true, "a failed save returns to the same, ready photo");
  assert.equal(
    run([{ type: "commit", id: "b", decision: "keep" }], s),
    s,
    "only the top photo can be decided",
  );
  const recorded = run(
    [
      { type: "commit", id: "a", decision: "keep" },
      { type: "saved", id: "a", current: "b" },
    ],
    s,
  );
  assert.equal(run([{ type: "failed", id: "a" }], recorded), recorded, "success is final");
});

// Controller: timers, slow media, slow or failed saves, repeated presses

test("repeated button presses in the same frame record exactly one decision", async () => {
  const h = harness();
  h.show("a");
  h.controller.settled("a");
  const accepted = [1, 2, 3, 4, 5].map(() => h.controller.commit("keep"));
  assert.deepEqual(accepted, [true, false, false, false, false]);
  await flush();
  assert.deepEqual(h.calls, [["keep", "a"]]);
});

test("rapid swipes through a batch decide each photo once, in order", async () => {
  const h = harness();
  h.show("a");
  for (const id of ["a", "b", "c"]) {
    h.controller.settled(id);
    assert.equal(h.controller.commit(id === "b" ? "delete" : "keep"), true, id);
    h.controller.commit("keep"); // a stray extra tap during the transition
    h.controller.animated(id);
    await flush();
    h.show(h.current());
  }
  assert.deepEqual(h.calls, [
    ["keep", "a"],
    ["delete", "b"],
    ["keep", "c"],
  ]);
  assert.equal(h.controller.state.top, "d");
});

test("slow image loading never leaves controls locked indefinitely", async () => {
  const h = harness();
  h.show("a");
  await h.timers.advance(SETTLE_TIMEOUT_MS - 1);
  assert.equal(canCommit(h.controller.state, "a"), false, "still loading: not yet interactive");
  await h.timers.advance(1);
  assert.equal(canCommit(h.controller.state, "a"), true, "watchdog unlocks after the timeout");
  // A load that does report in cancels its watchdog.
  const fast = harness();
  fast.show("a");
  fast.controller.settled("a");
  assert.equal(fast.timers.pending, 0);
  // Unavailable photos settle at once with their placeholder.
  const missing = harness();
  missing.controller.sync("a");
  missing.controller.watchTop("a", true);
  assert.equal(canCommit(missing.controller.state, "a"), true);
  assert.equal(missing.controller.commit("keep", false), false, "but cannot be decided");
});

test("an interrupted fly-out animation still completes the transition", async () => {
  const h = harness();
  h.show("a");
  h.controller.settled("a");
  h.controller.commit("keep");
  await flush();
  assert.equal(h.controller.state.top, "a", "saved, waiting for the animation");
  await h.timers.advance(ANIMATION_TIMEOUT_MS);
  assert.equal(h.controller.state.top, "b");
  assert.equal(h.controller.state.committing, undefined);
});

test("a slow save holds only that photo and finishes cleanly", async () => {
  const h = harness();
  h.setMode("hold");
  h.show("a");
  h.controller.settled("a");
  h.controller.commit("delete");
  h.controller.animated("a");
  assert.equal(h.controller.commit("keep"), false, "no second decision while saving");
  h.held.shift()();
  await flush();
  assert.equal(h.controller.state.top, "b");
  assert.deepEqual(h.calls, [["delete", "a"]]);
});

test("failed and unanswered saves return to the same photo with a message", async () => {
  const failing = harness();
  failing.setMode("fail");
  failing.show("a");
  failing.controller.settled("a");
  failing.controller.commit("keep");
  failing.controller.animated("a");
  await flush();
  assert.equal(failing.controller.state.top, "a");
  assert.equal(canCommit(failing.controller.state, "a"), true);
  assert.deepEqual(failing.errors, ["Disk full"]);

  const hanging = harness();
  hanging.setMode("hang");
  hanging.show("a");
  hanging.controller.settled("a");
  hanging.controller.commit("keep");
  await hanging.timers.advance(SAVE_TIMEOUT_MS);
  assert.equal(canCommit(hanging.controller.state, "a"), true, "never locked forever");
  assert.match(hanging.errors[0], /longer than usual/);
});

test("a late save that lands after a timeout is not recorded twice", async () => {
  const h = harness();
  h.setMode("hold");
  h.show("a");
  h.controller.settled("a");
  h.controller.commit("keep");
  await h.timers.advance(SAVE_TIMEOUT_MS);
  assert.equal(h.controller.state.committing, undefined);
  // The user retries; then the original save completes, and the retry is rejected.
  h.controller.commit("keep");
  h.held.shift()();
  await flush();
  h.held.shift()();
  await flush();
  h.controller.animated("a");
  await h.timers.advance(ANIMATION_TIMEOUT_MS);
  assert.equal(h.position, 1, "the photo advanced exactly once");
  assert.equal(h.controller.state.top, "b");
  assert.equal(h.errors.length, 1, "only the timeout message; the losing retry stays silent");
});

// Physics and copy

test("swipe physics: threshold or flick commits; direction respects reversed swipes", () => {
  assert.equal(commitDirection(130, 0, 120), 1);
  assert.equal(commitDirection(-130, 0, 120), -1);
  assert.equal(commitDirection(60, 0, 120), 0, "short drag springs back");
  assert.equal(commitDirection(40, 1200, 120), 1, "quick flick commits");
  assert.equal(commitDirection(10, 1200, 120), 0, "a tap-sized flick does not");
  assert.equal(swipeDecision(1, false), "keep");
  assert.equal(swipeDecision(1, true), "delete");
  for (const reversed of [false, true])
    for (const d of ["keep", "delete"])
      assert.equal(swipeDecision(decisionDirection(d, reversed), reversed), d);
});

test("counts read naturally", () => {
  assert.equal(plural(1, "item"), "1 item");
  assert.equal(plural(2, "item"), "2 items");
  assert.equal(plural(0, "item"), "0 items");
  assert.equal(plural(1, "memory", "memories"), "1 memory");
  assert.equal(plural(3, "memory", "memories"), "3 memories");
});
