const test = require("node:test");
const assert = require("node:assert/strict");
const { makeLoader } = require("./loader.cjs");
const z = makeLoader()("lib/pictopia/zoom-math.ts");
test("zoom is limited to 1×–3× and panning stays inside the photo's frame", () => {
  assert.equal(z.clampScale(0.4), 1); assert.equal(z.clampScale(7), 3); assert.equal(z.ZOOM_MAX, 3);
  assert.equal(z.clampOffset(500, 3, 300), 300); assert.equal(z.clampOffset(-500, 3, 300), -300);
  assert.equal(z.clampOffset(40, 1, 300), 0);
});
test("pinch keeps the focal point under the fingers", () => {
  const offset = z.focalOffset(50, 50, 0, 1, 2);
  assert.equal(offset, -50); // content point at +50 now renders at -50 + 2*50 = 50
});
test("double tap zooms toward the tapped point and back to the original size", () => {
  const zoomed = z.doubleTapTarget(1, { x: 300, y: 100 }, { width: 300, height: 200 });
  assert.equal(zoomed.scale, z.ZOOM_DOUBLE_TAP); assert.ok(zoomed.x < 0); assert.equal(zoomed.y, 0);
  assert.ok(Math.abs(zoomed.x) <= (zoomed.scale - 1) * 150);
  assert.deepEqual(z.doubleTapTarget(2.5, { x: 0, y: 0 }, { width: 300, height: 200 }), { scale: 1, x: 0, y: 0 });
});
test("only a still single tap at normal zoom selects an answer", () => {
  assert.equal(z.tapSelects(1, false, 2), true);
  assert.equal(z.tapSelects(1.6, false, 0), false);
  assert.equal(z.tapSelects(1, true, 0), false);
  assert.equal(z.tapSelects(1, false, 30), false);
});
test("a zoomed photo in the explorer can be dragged only until its own edges reach the screen", () => {
  const frame = { width: 400, height: 800 };
  // Landscape 4:3 shows 400×300; at 2× it is 800×600: 200 px each way sideways, none vertically.
  assert.deepEqual(z.panLimit(2, { width: 4000, height: 3000 }, frame), { x: 200, y: 0 });
  assert.deepEqual(z.panLimit(1, { width: 4000, height: 3000 }, frame), { x: 0, y: 0 });
  const tall = z.panLimit(3, { width: 3000, height: 4000 }, frame);
  assert.equal(tall.x, 400); assert.ok(Math.abs(tall.y - 400) < 1e-9); // 400×533 → 1200×1600
  assert.equal(z.clampTo(900, 200), 200); assert.equal(z.clampTo(-900, 200), -200); assert.equal(z.clampTo(-5, 0), 0);
});
test("double tap in the explorer zooms toward the tapped spot within the photo and back", () => {
  const frame = { width: 400, height: 800 }, photo = { width: 4000, height: 3000 };
  const zoomed = z.toggleZoomAt(1, { x: 150, y: 300 }, photo, frame);
  assert.equal(zoomed.scale, z.ZOOM_DOUBLE_TAP);
  assert.equal(zoomed.x, -225); // 150 × 1.5, inside the 300 px limit
  assert.equal(zoomed.y, 0); // 300 px tall photo × 2.5 = 750 still fits vertically
  assert.deepEqual(z.toggleZoomAt(2, { x: 0, y: 0 }, photo, frame), { scale: 1, x: 0, y: 0 });
});
