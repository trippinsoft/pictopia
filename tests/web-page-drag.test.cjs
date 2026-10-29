const test = require("node:test"),
  assert = require("node:assert/strict");
const { makeLoader } = require("./loader.cjs");
const { WebPageDrag } = makeLoader()("lib/pictopia/web-page-drag.ts");
const pointer = (y, time = 0, x = 0, id = 1) => ({ id, x, y, time });
function fixture(position = 2, immediate = true) {
  const activity = [],
    requests = [];
  const surface = {
    scrollTop: position * 600,
    clientHeight: 600,
    scrollHeight: 6000,
    style: { scrollSnapType: "y mandatory" },
    scrollTo(options) {
      requests.push(options);
      if (immediate) this.scrollTop = options.top;
    },
  };
  const drag = new WebPageDrag((active) => activity.push(active));
  return { drag, surface, activity, requests };
}
test("mouse/touch vertical dragging reveals adjacent pages exactly, holds midway, returns with the finger and cancels without advancing", () => {
  const { drag, surface, activity, requests } = fixture();
  assert.equal(drag.start(pointer(400), surface, true), true);
  assert.equal(drag.move(pointer(100, 300)), true);
  assert.equal(surface.scrollTop, 1500, "half current/half next page");
  assert.equal(surface.style.scrollSnapType, "none", "CSS snap must not fight a held drag");
  assert.deepEqual(requests, []);
  assert.deepEqual(activity, [true], "hold remains active; debounce cannot commit a page");
  drag.move(pointer(400, 600));
  assert.equal(surface.scrollTop, 1200);
  drag.end(pointer(400, 800), false);
  assert.deepEqual(requests, [{ top: 1200, behavior: "smooth" }]);
  assert.equal(surface.style.scrollSnapType, "y mandatory");
  assert.deepEqual(activity, [true, false]);
});
for (const direction of [-1, 1]) {
  test(`drag ${direction < 0 ? "up" : "down"} completes precisely one adjacent page`, () => {
    const { drag, surface, requests } = fixture();
    drag.start(pointer(400), surface, true);
    drag.move(pointer(400 + direction * 240, 400));
    drag.end(pointer(400 + direction * 240, 600), false);
    assert.equal(requests[0].top, 1200 - direction * 600);
    assert.equal(surface.scrollTop, 1200 - direction * 600);
  });
}
test("short fast flick advances, short slow drag returns, and a held flick loses stale velocity", () => {
  for (const [moveTime, releaseTime, expected] of [
    [20, 25, 1800],
    [300, 320, 1200],
    [20, 300, 1200],
  ]) {
    const { drag, surface, requests } = fixture();
    drag.start(pointer(400), surface, true);
    drag.move(pointer(370, moveTime));
    drag.end(pointer(370, releaseTime), false);
    assert.equal(requests[0].top, expected);
  }
});
test("horizontal discard owns the entire gesture, even if it later drifts vertically", () => {
  const { drag, surface, activity, requests } = fixture();
  drag.start(pointer(400), surface, true);
  assert.equal(drag.move(pointer(405, 20, 40)), false);
  assert.equal(drag.move(pointer(200, 40, 80)), false);
  assert.equal(drag.end(pointer(100, 60, 120), false), false);
  assert.equal(surface.scrollTop, 1200);
  assert.deepEqual(requests, []);
  assert.deepEqual(activity, [], "taps and sideways discards never hold the feed");
});
test("vertical ownership cannot switch into discard on a later diagonal move", () => {
  const { drag, surface } = fixture();
  drag.start(pointer(400), surface, true);
  assert.equal(drag.move(pointer(380, 20, 20)), true);
  assert.equal(drag.move(pointer(100, 400, 200)), true);
  assert.equal(surface.scrollTop, 1500);
  assert.equal(drag.end(pointer(100, 600, 200), false), true);
});
test("cancellation returns to origin and reduced motion avoids smooth animation", () => {
  const { drag, surface, requests } = fixture();
  drag.start(pointer(400), surface, true);
  drag.move(pointer(100, 400));
  assert.equal(drag.cancel(true), true);
  assert.deepEqual(requests, [{ top: 1200, behavior: "auto" }]);
  assert.equal(surface.scrollTop, 1200);
  assert.equal(surface.style.scrollSnapType, "y mandatory");
});
test("catching a page mid-snap continues from where it was headed; a tap there lets the snap finish", () => {
  const { drag, surface, activity, requests } = fixture(2, false);
  drag.start(pointer(400), surface, true);
  drag.move(pointer(100, 300));
  drag.end(pointer(100, 500), false);
  assert.equal(requests.at(-1).top, 1800);
  surface.scrollTop = 1650; // Still animating toward page 3.
  assert.equal(drag.start(pointer(400, 600), surface, true), true, "rapid flicks are never ignored");
  drag.move(pointer(370, 620));
  assert.equal(surface.scrollTop, 1680, "the page follows the finger from where it is");
  drag.end(pointer(370, 625), false);
  assert.equal(requests.at(-1).top, 2400, "a short flick moves one page past the previous target");
  assert.equal(surface.style.scrollSnapType, "none");
  assert.deepEqual(activity, [true], "the feed stays held through both flicks");
  // A tap during the next snap must not strand the feed off-page.
  surface.scrollTop = 2000;
  drag.start(pointer(400, 900), surface, true);
  assert.equal(drag.end(pointer(401, 950), false), false);
  assert.equal(requests.at(-1).top, 2400);
  surface.scrollTop = 2400;
  drag.scrolled();
  assert.deepEqual(activity, [true, false]);
  assert.equal(surface.style.scrollSnapType, "y mandatory");
});
test("a drag that catches a programmatic Next/discard scroll continues from that scroll's target page", () => {
  const { drag, surface, requests } = fixture(2, false);
  surface.scrollTop = 1250; // Animating from page 2 toward page 3.
  drag.start(pointer(300), surface, true, 3);
  drag.move(pointer(500, 20));
  drag.end(pointer(500, 30), false);
  assert.equal(requests.at(-1).top, 1200, "flick down from page 3 lands on page 2, not page 1");
});
test("boundaries, disabled controls, duplicate pointer callbacks and disposal cannot make extra moves", () => {
  const { drag, surface, requests } = fixture(0);
  assert.equal(drag.start(pointer(400), surface, false), false);
  drag.start(pointer(400), surface, true);
  assert.equal(drag.start(pointer(400, 0, 0, 2), surface, true), false);
  assert.equal(drag.move(pointer(700, 300, 0, 2)), false);
  drag.move(pointer(700, 300));
  drag.end(pointer(700, 500), false);
  assert.equal(surface.scrollTop, 0);
  assert.equal(drag.end(pointer(700, 600), false), false);
  assert.equal(requests.length, 1);
  drag.start(pointer(400), surface, true);
  drag.move(pointer(100, 300));
  drag.dispose();
  assert.equal(surface.style.scrollSnapType, "y mandatory");
  assert.equal(drag.end(pointer(100, 500), false), false);
});

test("release stays active through sparse smooth-scroll events, so the feed settles on the new page without snapping back or locking", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const load = makeLoader();
  const { createExplore, reduceExplore } = load("lib/pictopia/explore.ts");
  const { ExploreFeedController } = load("lib/pictopia/explore-feed-controller.ts");
  let session = createExplore(["a", "b", "c", "d"]),
    active = false;
  const { surface, requests } = fixture(0, false);
  let quiet;
  const actions = [],
    jumps = [];
  const controller = new ExploreFeedController(
    {
      read: () => session,
      save: async (action) => {
        const built = typeof action === "function" ? action(session) : action;
        actions.push(built);
        return (session = reduceExplore(session, built));
      },
      scrollTo: (page) => jumps.push(page),
      onPage() {},
      onBusy() {},
      onError(message) {
        assert.fail(message);
      },
    },
    0,
  );
  // Mirrors the feed's quiet-scroll settle.
  const schedule = () => {
    clearTimeout(quiet);
    quiet = setTimeout(() => {
      if (active) return;
      controller.settle(Math.round(surface.scrollTop / 600), session.ids);
    }, 140);
  };
  const drag = new WebPageDrag((value) => {
    active = value;
    clearTimeout(quiet);
    if (!value) schedule();
  });
  t.after(() => drag.dispose());
  for (const direction of [-1, -1, 1, -1]) {
    const origin = controller.page;
    assert.equal(drag.start(pointer(400), surface, true), true);
    drag.move(pointer(400 + direction * 240, 300));
    drag.end(pointer(400 + direction * 240, 500), false);
    assert.equal(active, true, "pointer-up must not release the settlement guard");
    schedule();
    t.mock.timers.tick(200);
    assert.equal(controller.page, origin, "a fractional offset mid-snap is never committed");
    surface.scrollTop = requests.at(-1).top;
    drag.scrolled();
    assert.equal(active, false);
    t.mock.timers.tick(140);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(controller.page, origin - direction);
    assert.equal(session.position, origin - direction);
  }
  assert.deepEqual(actions.map((action) => action.id), ["a", "b", "c", "b"]);
  assert.deepEqual(session.ids, ["a", "b", "c", "d"]);
});

test("interrupted smooth scrolling recovers its target and releases the lock even without final scroll events", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { drag, surface, activity, requests } = fixture(2, false);
  t.after(() => drag.dispose());
  drag.start(pointer(400), surface, true);
  drag.move(pointer(100, 300));
  drag.end(pointer(100, 500), false);
  assert.deepEqual(activity, [true]);
  for (let i = 0; i < 40; i++) t.mock.timers.tick(32);
  assert.deepEqual(requests.at(-1), { top: 1800, behavior: "auto" });
  assert.deepEqual(activity, [true, false]);
  assert.equal(surface.style.scrollSnapType, "y mandatory");
  surface.scrollTop = 1800;
  assert.equal(drag.start(pointer(400), surface, true), true);
  drag.move(pointer(380, 300));
  drag.cancel(false);
  surface.scrollTop = 1800;
  drag.scrolled();
  assert.equal(drag.start(pointer(400), surface, true), true, "cancel must also leave the next drag available");
});

test("DOM target polling releases settling when RN Web omits the final event; disposal cancels pending recovery", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { drag, surface, activity, requests } = fixture(2, false);
  drag.start(pointer(400), surface, true);
  drag.move(pointer(100, 300));
  drag.end(pointer(100, 500), false);
  surface.scrollTop = 1800;
  t.mock.timers.tick(32);
  assert.deepEqual(activity, [true, false]);
  assert.equal(drag.start(pointer(400), surface, true), true);
  drag.move(pointer(100, 300));
  drag.end(pointer(100, 500), false);
  drag.dispose();
  const count = requests.length;
  for (let i = 0; i < 40; i++) t.mock.timers.tick(32);
  assert.equal(requests.length, count, "unmount must not issue a late scroll recovery");
});
