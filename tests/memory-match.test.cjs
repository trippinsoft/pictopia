const test = require('node:test');
const assert = require('node:assert/strict');
const { makeLoader } = require('./loader.cjs');
const { media } = require('./native-harness.cjs');
const load = makeLoader();
const { memoryController, initialMemoryState, memoryGrid, memoryPairs, MEMORY_FLIP_MS, MEMORY_MATCH_MS } = load('lib/pictopia/memory-match.ts');
const { memoryDeck, cardPhoto, unavailable } = load('lib/pictopia/pitstops.ts');
function fixture(pairs = 4) {
  const deck = Array.from({ length: pairs }, (_, i) => [`p${i}#a`, `p${i}#b`]).flat();
  let state = initialMemoryState(), next = 0, matches = 0;
  const pending = new Map();
  const clock = { set(fn, ms) { pending.set(++next, { fn, ms }); return next; }, clear(id) { pending.delete(id); } };
  const controller = memoryController(deck, value => state = value, () => matches++, clock);
  const options = { active: true, ready: true, reduced: false, reader: false };
  controller.configure(options);
  return { deck, controller, pending, get state() { return state; }, get matches() { return matches; },
    configure(change) { Object.assign(options, change); controller.configure(options); },
    tick() { const callbacks = [...pending.values()]; pending.clear(); callbacks.forEach(({ fn }) => fn()); },
    get delay() { return [...pending.values()][0]?.ms; },
    pair(id) { assert.equal(controller.select(`${id}#a`), true); this.tick(); assert.equal(controller.select(`${id}#b`), true); this.tick(); },
  };
}
test('four pairs by default, optional six; unique eligible photographs only', () => {
  const photos = Array.from({ length: 8 }, (_, i) => media(`p${i}`));
  const pool = [...photos, photos[0], media('screenshot', { screenshot: true }), media('video', { type: 'video' }), media('queued', { decision: 'delete' }), media('gone', { active: false })];
  assert.equal(memoryDeck(pool, 5).length, 8);
  for (const pairs of [4, 6]) {
    const deck = memoryDeck(pool, 5, pairs);
    assert.equal(deck.length, pairs * 2);
    assert.equal(new Set(deck).size, deck.length);
    assert.equal(new Set(deck.map(cardPhoto)).size, pairs);
    assert.ok(deck.every(card => /^p\d#/.test(card)));
  }
  assert.equal(unavailable('memoryMatch', { photos: 4, years: 1, captureDates: false }), undefined);
});
test('pair preference persists through the existing store and invalid values default to four', async () => {
  const values = new Map();
  const { pitStopStore } = makeLoader({
    'react-native': { Platform: { OS: 'web' } },
    './repository': { storage: { getValue: async key => values.get(key), setValue: async (key, value) => values.set(key, value) } },
    './explore': {},
  })('services/pitstops.ts');
  assert.equal(await pitStopStore.memoryPairs(), 4);
  await pitStopStore.saveMemoryPairs(6); assert.equal(await pitStopStore.memoryPairs(), 6);
  await pitStopStore.saveMemoryPairs(4); assert.equal(await pitStopStore.memoryPairs(), 4);
  for (const value of [undefined, null, 8, '6', {}, NaN]) assert.equal(memoryPairs(value), 4);
});
test('rapid and duplicate taps lock throughout reveal, mismatch hold and animated flip-back', () => {
  const f = fixture();
  assert.equal(f.controller.select('unknown'), false);
  assert.equal(f.controller.select('p0#a'), true);
  assert.equal(f.delay, 300);
  assert.equal(f.controller.select('p0#a'), false);
  assert.equal(f.controller.select('p1#a'), false);
  f.tick(); assert.equal(f.controller.select('p0#a'), false);
  assert.equal(f.controller.select('p1#a'), true);
  assert.equal(f.controller.select('p2#a'), false);
  f.tick(); assert.equal(f.state.phase, 'mismatch');
  assert.equal(f.state.open.length, 2); assert.equal(f.delay, 1050);
  assert.equal(f.controller.select('p2#a'), false);
  f.tick(); assert.equal(f.state.phase, 'closing'); assert.equal(f.delay, MEMORY_FLIP_MS);
  assert.equal(f.state.open.length, 0); assert.equal(f.controller.select('p2#a'), false);
  f.tick(); assert.equal(f.controller.select('p2#a'), true); assert.equal(f.matches, 0);
});
test('both board sizes keep matches visible, emit one haptic event per pair, and finish after settling', () => {
  for (const pairs of [4, 6]) {
    const f = fixture(pairs);
    for (let i = 0; i < pairs; i++) {
      f.pair(`p${i}`);
      assert.equal(f.state.phase, 'matching'); assert.equal(f.delay, MEMORY_MATCH_MS);
      assert.equal(f.state.open.length, 2); assert.equal(f.state.matched.length, (i + 1) * 2);
      assert.equal(f.matches, i + 1);
      for (const card of f.deck) assert.equal(f.controller.select(card), false);
      f.tick(); assert.equal(f.state.phase, i === pairs - 1 ? 'complete' : 'ready');
      assert.equal(f.controller.select(`p${i}#a`), false);
    }
    assert.equal(f.pending.size, 0); f.tick(); assert.equal(f.matches, pairs);
  }
});
test('exiting or restarting at every transition cancels callbacks, even already queued ones', () => {
  for (const steps of [0, 1, 2, 3, 4, 5]) {
    const f = fixture();
    const actions = [() => f.controller.select('p0#a'), () => f.tick(), () => f.controller.select('p1#a'), () => f.tick(), () => f.tick()];
    actions.slice(0, steps).forEach(fn => fn());
    const stale = [...f.pending.values()]; const state = f.state;
    f.controller.dispose(); assert.equal(f.pending.size, 0);
    stale.forEach(({ fn }) => fn()); f.tick();
    assert.equal(f.state, state); assert.equal(f.controller.select('p2#a'), false);
    const fresh = fixture(); assert.deepEqual(fresh.state, initialMemoryState());
    assert.equal(fresh.controller.select('p0#a'), true);
  }
  const f = fixture(); f.pair('p0'); const stale = [...f.pending.values()];
  f.controller.dispose(); stale.forEach(({ fn }) => fn());
  assert.equal(f.state.phase, 'matching'); assert.equal(f.matches, 1);
});
test('background and unavailable media pause the game; screen readers get three seconds', () => {
  const f = fixture(); f.configure({ ready: false }); assert.equal(f.controller.select('p0#a'), false);
  f.configure({ ready: true, reader: true }); f.controller.select('p0#a'); f.tick(); f.controller.select('p1#a'); f.tick();
  assert.equal(f.delay, 3000);
  const stale = [...f.pending.values()]; f.configure({ active: false });
  stale.forEach(({ fn }) => fn()); assert.equal(f.state.phase, 'mismatch'); assert.equal(f.pending.size, 0);
  f.configure({ active: true }); assert.equal(f.delay, 3000); f.tick(); f.tick();
  assert.equal(f.state.phase, 'ready');
});
test('reduced motion removes rotation delays without skipping mismatch time or duplicating matches', () => {
  const f = fixture(); f.configure({ reduced: true });
  f.controller.select('p0#a'); assert.equal(f.delay, 0); f.tick();
  f.controller.select('p1#a'); f.tick(); assert.equal(f.delay, 1050);
  f.tick(); assert.equal(f.delay, 0); f.tick();
  f.pair('p0'); f.tick(); assert.equal(f.matches, 1);
});
test('four- and six-pair boards fit small and standard phones, including native safe areas', () => {
  for (const [width, height, insets] of [[320,568,40], [375,667,40], [390,844,81], [393,852,93], [360,640,48]]) {
    const availableWidth = width - 32, availableHeight = height - insets - 56 - 40 - 44 - 16;
    for (const pairs of [4, 6]) {
      const grid = memoryGrid(availableWidth, availableHeight, pairs);
      assert.equal(grid.columns, pairs === 4 ? 2 : 3);
      assert.ok(grid.cardWidth * grid.columns + grid.gap * (grid.columns - 1) <= availableWidth + 0.01);
      assert.ok(grid.height <= availableHeight + 0.01, `${width}×${height}, ${pairs} pairs`);
      assert.ok(grid.cardWidth >= 88 && grid.cardHeight >= 64);
    }
  }
  assert.ok(memoryGrid(343, 180, 6).height > 180, 'short landscape windows scroll instead of crushing photos');
});
