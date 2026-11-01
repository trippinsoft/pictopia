const test = require("node:test");
const assert = require("node:assert/strict");
const { makeLoader } = require("./loader.cjs");
const { orderRoundController, ORDER_FEEDBACK_MS } = makeLoader()("lib/pictopia/order-round.ts");
function fixture() {
  const pending = new Map(), scores = []; let id = 0;
  const timers = { set: (fn, delay) => { pending.set(++id, { fn, delay }); return id; }, clear: id => pending.delete(id) };
  const round = orderRoundController(["a", "b"], "a", value => scores.push(value), timers);
  return { round, pending, scores, tick: () => { const callbacks = [...pending.values()]; pending.clear(); callbacks.forEach(({fn}) => fn()); } };
}
test("correct answer locks immediately and scores once after 1.8 seconds", () => {
  const f = fixture();
  assert.equal(f.round.select("a"), true);
  assert.equal(f.round.select("b"), false);
  assert.equal(f.round.select("a"), false);
  assert.deepEqual(f.scores, []);
  assert.equal([...f.pending.values()][0].delay, ORDER_FEEDBACK_MS);
  assert.ok(ORDER_FEEDBACK_MS >= 1500 && ORDER_FEEDBACK_MS <= 2000);
  f.tick(); f.round.advance(); f.round.skip();
  assert.deepEqual(f.scores, [true]);
});
test("incorrect answer counts once and unavailable skips do not count as wrong", () => {
  const f = fixture(); assert.equal(f.round.select("unknown"), false);
  f.round.select("b"); f.tick(); assert.deepEqual(f.scores, [false]);
  const skipped = fixture(); skipped.round.skip(); skipped.round.skip(); skipped.tick(); assert.deepEqual(skipped.scores, [undefined]);
});
test("leaving cancels auto advancement; background pauses it until active", () => {
  const f = fixture(); f.round.select("a"); f.round.configure(false, true); f.tick(); assert.deepEqual(f.scores, []);
  f.round.configure(true, true); f.tick(); assert.deepEqual(f.scores, [true]);
  const gone = fixture(); gone.round.select("b"); gone.round.dispose(); gone.tick(); gone.round.advance(); assert.deepEqual(gone.scores, []);
});
test("screen readers get an untimed result with manual progression", () => {
  const f = fixture(); f.round.configure(true, false); f.round.select("a"); f.tick(); assert.deepEqual(f.scores, []);
  f.round.advance(); f.round.advance(); assert.deepEqual(f.scores, [true]);
});
test("stacked photos keep their aspect ratio, fit together, and share unused height", () => {
  const { orderPhotoFrames, ORDER_GAP, ORDER_MIN_HEIGHT } = makeLoader()("lib/pictopia/order-round.ts");
  const L = { width: 4032, height: 3024 }, P = { width: 3024, height: 4032 };
  const close = (a, b) => Math.abs(a - b) < 0.01;
  for (const area of [{ width: 359, height: 520 }, { width: 377, height: 650 }, { width: 414, height: 720 }]) {
    for (const pair of [[L, P], [P, L], [L, L], [P, P]]) {
      const frames = orderPhotoFrames(area, pair);
      assert.ok(frames[0].height + frames[1].height + ORDER_GAP <= area.height + 0.5, "both visible without scrolling");
      frames.forEach((f, i) => { assert.ok(f.width <= area.width + 0.01); assert.ok(close(f.width / f.height, pair[i].width / pair[i].height), "no distortion"); });
    }
    // A landscape photo takes only the height it needs at full width (when that is under half);
    // the portrait photo gets the rest.
    const [land, port] = orderPhotoFrames(area, [L, P]);
    if (area.width * 0.75 < (area.height - ORDER_GAP) / 2) {
      assert.ok(close(land.width, area.width));
      assert.ok(close(port.height, area.height - ORDER_GAP - land.height));
      assert.ok(port.height > (area.height - ORDER_GAP) / 2);
    }
  }
  // Two landscape photos on a tall screen both run the full width.
  const tall = orderPhotoFrames({ width: 377, height: 650 }, [L, L]);
  assert.ok(tall.every(f => close(f.width, 377)));
  const [panorama] = orderPhotoFrames({ width: 343, height: 470 }, [{ width: 8000, height: 1000 }, P]);
  assert.equal(panorama.width, 343); assert.equal(panorama.height, ORDER_MIN_HEIGHT);
  assert.ok(orderPhotoFrames({ width: 343, height: 470 }, [{ width: 0, height: 0 }, P])[0].height > 0);
});
