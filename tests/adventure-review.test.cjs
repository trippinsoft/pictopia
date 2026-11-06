const test = require('node:test');
const assert = require('node:assert/strict');
const { makeLoader } = require('./loader.cjs');
const { DatabaseSync, media, platform, boot } = require('./native-harness.cjs');
const { createExplore, reduceExplore, exploreCounts, exploreFeed, reconcileReview } = makeLoader()('lib/pictopia/explore.ts');
const { ExploreFeedController } = makeLoader()('lib/pictopia/explore-feed-controller.ts');
const { adventureComplete } = makeLoader()('lib/pictopia/adventures.ts');
const { nextReviewStep } = makeLoader()('lib/pictopia/review-guidance.ts');
const { reviewRailLines } = makeLoader()('lib/pictopia/review-rail.ts');
const { flightPath, flightAt, FLIGHT_MIN, FLIGHT_MAX } = makeLoader()('lib/pictopia/flight-math.ts');
const key = 'adventure:review-test:explore';
const flush = () => new Promise(resolve => setImmediate(resolve));
function services(app, p) { return makeLoader({ ...p.mocks, './repository': app, './media': { mediaService: app.mediaService } })('services/explore.ts'); }
function review(ids = ['a','b','c']) { return { ...createExplore(ids, 1), review: true }; }
function page(s, id, availableIds = s.ids) { return reduceExplore(s, { type: 'page', id: s.activeId, revision: s.revision, toId: id, availableIds }); }
/** Mirrors AdventureReview: the sequence is the snapshot minus what is in the trash, and the
 * pager re-anchors on the shown photograph whenever that sequence changes. */
function reviewHarness(ids = ['a','b','c','d'], completionPage = false) {
  let s = review(ids), tail = Promise.resolve(), hold = null, rendered;
  const scrolls = [], shown = [], errors = [], arrivals = [], ended = [];
  let controller;
  const build = () => {
    const live = s.ids.filter(id => controller.departing.has(id) || (!s.records[id]?.queued && !controller.hidden.has(id)));
    return completionPage ? [...live, 'explore-completion'] : live;
  };
  rendered = completionPage ? [...exploreFeed(s), 'explore-completion'] : exploreFeed(s);
  const commit = () => {
    const next = build();
    if (next.join() === rendered.join()) return;
    rendered = next;
    controller.relayout();
  };
  controller = new ExploreFeedController({
    read: () => s,
    pages: () => rendered,
    completionPage,
    save: action => {
      const run = tail.then(async () => {
        if (hold) await hold;
        s = reduceExplore(s, typeof action === 'function' ? action(s) : action);
        commit();
        return s;
      });
      tail = run.catch(() => {});
      return run;
    },
    scrollTo: index => scrolls.push(index),
    onPage: index => shown.push(index),
    onEnd: () => ended.push({ page: controller.page, queued: s.ids.filter(id => s.records[id]?.queued) }),
    onBusy: () => {},
    onError: message => errors.push(message),
    onFeed: () => commit(),
    prepare: async entry => { arrivals.push(entry); },
  }, s.activeId);
  return {
    controller, scrolls, shown, errors, arrivals, ended,
    session: () => s,
    pages: () => rendered,
    gate() { let release; hold = new Promise(resolve => { release = resolve; }); return () => { hold = null; release(); }; },
    settle: () => tail,
  };
}
test('free browsing and revisiting distinguish viewed, untouched, and queued photos', () => {
  let s = review(['a','b','c','d']);
  s = reduceExplore(s, { type: 'seen', id: 'a' });
  s = page(s, 'd', ['a']);
  assert.deepEqual(Object.keys(s.records), ['a'], 'skipping past photographs does not count them');
  s = reduceExplore(s, { type: 'seen', id: 'd' });
  s = page(s, 'a'); s = page(s, 'd');
  assert.equal(exploreCounts(s).explored, 2);
  assert.equal(exploreCounts(s).discarded, 0);
  assert.equal(s.activeId, 'd');
  assert.equal(page(s, null), s, 'scrolling beyond the final photograph never finishes');
  assert.equal(reduceExplore(s, { type: 'seen', id: 'b' }), s, 'late image callback cannot mark an offscreen photo');
});
test('review completion needs a deliberate move beyond the final photograph', () => {
  let s = review(['a', 'b']);
  const pages = ['a', 'b', 'explore-completion'];
  const shown = [];
  const controller = new ExploreFeedController({
    read: () => s, pages: () => pages, completionPage: true,
    save: async action => { s = reduceExplore(s, typeof action === 'function' ? action(s) : action); return s; },
    scrollTo: () => {}, onPage: index => shown.push(index), onBusy: () => {},
    onError: () => {}, onFeed: () => {}, prepare: async () => {},
  }, 'a');
  controller.settle(1, s.ids);
  assert.equal(controller.activeId, 'b');
  assert.equal(!!s.finished, false);
  controller.settle(2, s.ids);
  assert.equal(controller.activeId, null);
  assert.equal(shown.at(-1), 2);
  assert.equal(!!s.finished, false, 'the screen owns the explicit finish save');
  assert.equal(controller.claim(2, s.ids, false), false);
});
test('a review resumed on its final photograph completes on the next forward page', () => {
  let s = page(review(['a','b','c']), 'c', ['c']);
  let ends = 0;
  const c = new ExploreFeedController({
    read: () => s, pages: () => ['a','b','c','explore-completion'], completionPage: true,
    save: async action => { s = reduceExplore(s, typeof action === 'function' ? action(s) : action); return s; },
    scrollTo: () => {}, onPage: () => {}, onEnd: () => { ends++; },
    onBusy: () => {}, onError: () => {}, onFeed: () => {}, prepare: async () => {},
  }, s.activeId);
  assert.equal(c.page, 2);
  assert.equal(ends, 0);
  c.settle(3, s.ids);
  assert.equal(ends, 1);
  assert.equal(c.activeId, null);
});
test('rail keeps original positions, including discards, in 20, 100 and 200 photo adventures', () => {
  for (const count of [20, 100, 200]) {
    const ids = Array.from({ length: count }, (_, i) => `photo-${i}`);
    const queued = new Set([ids[0], ids[Math.floor(count / 2)]]);
    for (const center of [0, count / 4 + 0.5, count / 2, count - 1]) {
      const lines = reviewRailLines(ids, queued, center);
      assert.ok(lines.length <= 12);
      assert.ok(lines.every(line => line.index >= 0 && line.index < count));
      assert.ok(lines.every(line => line.id === ids[line.index]));
    }
    const middle = Math.floor(count / 2);
    assert.equal(reviewRailLines(ids, queued, middle).find(line => line.index === middle).discarded, true);
    queued.delete(ids[middle]);
    assert.equal(reviewRailLines(ids, queued, middle).find(line => line.index === middle).active, true);
    assert.equal(reviewRailLines(ids, queued, middle + 0.5).find(line => line.index === middle).offset, -8.5);
  }
});
test('a discarded photograph leaves the sequence, and the trash gives it back where it was', () => {
  let s = review();
  const discard = () => s = reduceExplore(s, { type: 'discard', id: s.activeId, revision: s.revision, direction: 'left' });
  discard();
  assert.equal(s.activeId, 'b', 'the next photograph takes over');
  assert.deepEqual(exploreFeed(s), ['b','c'], 'and the marked one is out of the scrolling sequence');
  assert.equal(s.records.a.queued, true);
  s = page(s, 'c'); discard();
  assert.equal(s.activeId, 'b', 'the saved place stays on a real photograph: the nearest earlier one (the end card is never a saved place)');
  assert.deepEqual(exploreFeed(s), ['b'], 'earlier photographs remain available and unmarked');
  assert.notEqual(s.finished, true, 'marking the final photograph never finishes');
  assert.notEqual(reconcileReview(s, []).finished, true);
  assert.equal(adventureComplete(s), false);
  s = reduceExplore(s, { type: 'restore', id: 'c' });
  assert.deepEqual(exploreFeed(s), ['b','c']);
  assert.equal(s.activeId, 'b', 'restoring never moves the user');
  assert.equal(s.records.c.queued, false);
  s = reduceExplore(s, { type: 'restore', id: 'a' });
  assert.deepEqual(exploreFeed(s), ['a','b','c'], 'in its original place');
  assert.equal(s.activeId, 'b', 'without moving the user');
  const explored = exploreCounts(s).explored;
  s = page(s, 'a'); s = page(s, 'b');
  assert.equal(exploreCounts(s).explored, explored, 'repeated browsing never inflates progress');
  assert.equal(reduceExplore(s, { type: 'finish' }), s, 'a stale end callback from the middle is ignored');
  s = page(s, 'c');
  s = reduceExplore(s, { type: 'finish' });
  assert.equal(s.finished, true); assert.equal(s.activeId, null);
  assert.equal(adventureComplete(s), true);
  s = reduceExplore(s, { type: 'back' });
  assert.equal(s.finished, false); assert.equal(s.activeId, 'c', 'and a review can be reopened from its closing screen');
  let only = review(['a']);
  only = reduceExplore(only, { type: 'discard', id: 'a', revision: 0, direction: 'right' });
  assert.equal(only.activeId, null); assert.equal(only.records.a.queued, true);
  assert.equal(only.finished, false);
});
test('reviews saved before the trash existed keep their finished state', () => {
  const legacy = review();
  legacy.ids.forEach(id => { legacy.records[id] = { encountered: true, unavailable: false, discarded: false, changedAt: 1 }; });
  const done = reconcileReview({ ...legacy, activeId: null }, [], true);
  assert.notEqual(reconcileReview({ ...review(), activeId: null }, []).finished, true, 'a null position alone proves no completion');
  assert.equal(done.finished, true);
  assert.equal(adventureComplete(done), true);
  const running = reconcileReview(review(), []);
  assert.equal(running.finished, undefined, 'an unfinished review is left exactly as it was');
});
for (const os of ['ios', 'android']) test(`${os} SQLite: atomic queue/session saves, rollback, restart, external restore and actual deletion`, async () => {
  const db = new DatabaseSync(':memory:'), fault = {}, p = platform({ os, library: ['a','b','c','d'] });
  let app = await boot(db,p,fault);
  await app.storage.put([media('a'),media('b'),media('c'),media('d')], { [key]: review(['a','b','c','d']) });
  let store = services(app,p).exploreStoreFor(key);
  let s = await store.load();
  await store.change({ type:'page', id:s.activeId, revision:s.revision, toId:'b', availableIds:['a'] });
  for (const id of s.ids) assert.equal((await app.storage.get(id)).decision, undefined);
  s = await store.load();
  const before = structuredClone(s);
  fault.key = key;
  await assert.rejects(store.change({ type:'discard', id:'b', revision:s.revision, direction:'right' }), /write failure/);
  fault.key = undefined;
  assert.deepEqual(await store.load(), before); assert.equal((await app.storage.get('b')).decision, undefined);
  s = await store.change(c => ({ type:'discard', id:c.activeId, revision:c.revision, direction:'right' }));
  assert.equal((await app.storage.get('b')).decision, 'delete'); assert.equal(s.records.b.queued, true); assert.deepEqual(p.requests, []);
  app = await boot(db,p); store = services(app,p).exploreStoreFor(key);
  assert.deepEqual(await store.load(), s);
  await app.repository.restore(['b']); s = await store.load();
  assert.equal(s.records.b.queued, false); assert.equal(s.history.length, 0);
  s = await store.change(c => ({ type:'discard', id:c.activeId, revision:c.revision, direction:'left' }));
  await store.change({ type:'undo' }); assert.equal((await app.storage.get('c')).decision, undefined);
  await app.storage.setValue('deletionAttempt', { id:'inflight', ids:['c'], phase:'requested' });
  await assert.rejects(store.change(c => ({ type:'discard', id:'c', revision:c.revision, direction:'left' })), /still being checked/);
  await app.storage.setValue('deletionAttempt', null);
  s = await store.change(c => ({ type:'discard', id:'c', revision:c.revision, direction:'left' }));
  assert.deepEqual(p.requests, []);
  p.onDelete = async ids => { p.deleteVisible(ids); return true; };
  await app.deleteMarked([await app.storage.get('c')], app.mediaService);
  s = await store.load();
  assert.equal(s.records.c.queued, false, 'verified OS deletion is never a pending badge');
  assert.deepEqual(s.ids, ['a','b','c','d'], 'the frozen snapshot stays navigable even for unavailable assets');
  assert.equal(p.requests.length, 1); db.close();
});
test('restoring from the trash clears the queue decision without deleting anything', async () => {
  const db = new DatabaseSync(':memory:'), p = platform({ library: ['a','b','c'] }); const app = await boot(db,p);
  await app.storage.put([media('a'),media('b'),media('c')], { [key]: review() });
  const store = services(app,p).exploreStoreFor(key);
  let s = await store.change(c => ({ type:'discard', id:c.activeId, revision:c.revision, direction:'left' }));
  assert.equal(s.activeId, 'b');
  assert.equal((await app.storage.get('a')).decision, 'delete');
  // The tray restores the photograph it is showing, not whatever was discarded last.
  s = await store.change({ type:'restore', id:'a' });
  assert.equal(s.records.a.queued, false);
  assert.equal(s.activeId, 'b', 'the main review stays where the user left it');
  assert.deepEqual(exploreFeed(s), ['a','b','c']);
  assert.equal((await app.storage.get('a')).decision, undefined);
  assert.deepEqual(s.history, [], 'and there is nothing left to undo twice');
  assert.deepEqual(p.requests, [], 'nothing was ever sent to the operating system');
  db.close();
});
test('legacy marks are preserved without silently adding deletion requests', async () => {
  const db = new DatabaseSync(':memory:'), p = platform(); const app = await boot(db,p);
  let legacy = createExplore(['a','b','c']);
  legacy = reduceExplore(legacy, { type:'discard', id:'a', revision:0, direction:'left' });
  await app.storage.put([media('a'),media('b'),media('c')], { [key]:legacy });
  const store = services(app,p).exploreStoreFor(key), loaded = await store.load();
  assert.equal(loaded.records.a.discarded, true); assert.equal(loaded.records.a.queued, undefined);
  assert.equal((await app.storage.get('a')).decision, undefined);
  assert.deepEqual(exploreFeed(loaded), ['a','b','c'], 'an older set-aside mark is not a deletion, so it stays in the sequence');
  assert.deepEqual(p.requests, []); db.close();
});
test('queue updates from another review are authoritative across overlapping sessions', () => {
  const s = reconcileReview(review(), [media('a',{decision:'delete'}),media('b'),media('c')]);
  assert.equal(s.records.a.queued, true);
  assert.deepEqual(exploreFeed(s), ['b','c'], 'a photograph queued elsewhere is already in the trash');
  const restored = reconcileReview(s, [media('a',{decision:'keep'})]);
  assert.equal(restored.records.a.queued, false);
});
test('the next photograph is swipeable before a discard is saved, and rapid discards keep their own photographs', async () => {
  const h = reviewHarness(['a','b','c','d']);
  const c = h.controller;
  const release = h.gate();
  const first = c.discard('a', 'left', Promise.resolve());
  await flush(); await flush(); await flush();
  assert.equal(c.busy, false, 'the lock is released as soon as the photograph is in the air');
  assert.equal(c.activeId, 'b');
  assert.deepEqual(h.pages(), ['b','c','d'], 'the flying photograph has already left the sequence');
  assert.equal(c.canDiscard('b'), true);
  const second = c.discard('b', 'right', Promise.resolve());
  await flush(); await flush(); await flush();
  assert.equal(c.activeId, 'c', 'the second discard skips the one still in the air');
  const third = c.discard('c', 'left', Promise.resolve());
  await flush(); await flush(); await flush();
  assert.equal(c.activeId, 'd');
  release();
  await Promise.all([first, second, third]);
  await h.settle();
  const s = h.session();
  assert.deepEqual(['a','b','c'].map(id => s.records[id].queued), [true,true,true], 'every swipe was saved exactly once');
  assert.deepEqual(exploreFeed(s), ['d']);
  assert.equal(s.activeId, 'd');
  assert.equal(c.activeId, 'd');
  assert.deepEqual(h.errors, []);
  assert.deepEqual(h.arrivals.map(entry => entry.id), ['b','c','d'], 'each arriving photograph is the right one');
});
test('Undo during an unfinished flight restores the same queued photograph once', async () => {
  const h = reviewHarness(['a','b'], true);
  let handoff; const animation = new Promise(resolve => { handoff = resolve; });
  const release = h.gate();
  const discard = h.controller.discard('a', 'left', animation);
  const undo = h.controller.undo();
  release();
  assert.equal(await undo, 'a');
  handoff();
  await discard;
  await h.settle();
  assert.deepEqual(exploreFeed(h.session()), ['a','b']);
  assert.equal(!!h.session().records.a?.queued, false);
  assert.equal(h.controller.activeId, 'a');
  assert.deepEqual(h.session().history, []);
  assert.deepEqual(h.ended, []);
});
test('discarding the final review photo finishes after its flight, even with earlier photos available', async () => {
  const h = reviewHarness(['a','b','c','d'], true);
  for (const position of [1,2,3]) h.controller.settle(position, ['a','b','c','d']);
  await h.settle();
  let land; const landed = new Promise(resolve => { land = resolve; });
  const discard = h.controller.discard('d', 'left', Promise.resolve(), landed);
  await flush(); await flush();
  assert.equal(h.controller.activeId, null, 'the last photo must not fall back to c');
  assert.equal(h.controller.busy, true, 'the final transition remains held until landing');
  assert.equal(h.shown.at(-1), 3, 'the completion page replaces the final photo');
  assert.equal(h.ended.length, 0, 'completion waits for the photograph to reach the trash');
  assert.deepEqual(exploreFeed(h.session()), ['a','b','c']);
  land(); await discard;
  assert.equal(h.controller.busy, false);
  assert.equal(h.ended.length, 1);
  assert.deepEqual(h.ended[0].queued, ['d']);
  assert.notEqual(h.session().finished, true, 'only an explicit Finish completes');
  assert.equal(h.session().activeId, 'c', 'the saved place stays on the last photograph still in the sequence');
});
test('jumping to the final photo and discarding it never navigates backward', async () => {
  const h = reviewHarness(['a','b','c'], true);
  h.controller.settle(2, ['c']);
  await h.settle();
  await h.controller.discard('c', 'right', Promise.resolve(), Promise.resolve());
  assert.equal(h.controller.activeId, null);
  assert.deepEqual(exploreFeed(h.session()), ['a','b']);
  assert.equal(h.ended.length, 1);
  assert.ok(!h.scrolls.includes(1), 'the feed never scrolls to an earlier photograph');
});
test('consecutive discards finish once when the final remaining photo lands', async () => {
  const h = reviewHarness(['a','b','c'], true);
  await h.controller.discard('a', 'left', Promise.resolve(), Promise.resolve());
  await h.controller.discard('b', 'right', Promise.resolve(), Promise.resolve());
  let land; const landed = new Promise(resolve => { land = resolve; });
  const final = h.controller.discard('c', 'left', Promise.resolve(), landed);
  await flush(); await flush();
  assert.equal(h.ended.length, 0);
  land(); await final;
  assert.equal(h.ended.length, 1);
  assert.deepEqual(h.ended[0].queued, ['a','b','c']);
});
test('discarding the last photograph leaves an empty sequence that restoring reopens', async () => {
  const h = reviewHarness(['a','b']);
  const c = h.controller;
  await c.discard('a', 'left', Promise.resolve());
  await c.discard('b', 'right', Promise.resolve());
  await h.settle();
  assert.equal(c.activeId, null, 'nothing is left to show');
  assert.deepEqual(h.pages(), []);
  assert.equal(h.session().finished, false, 'and the review has not ended itself');
  await c.action({ type: 'restore', id: 'b' });
  await h.settle();
  assert.deepEqual(h.pages(), ['b']);
  assert.equal(c.activeId, 'b');
  assert.deepEqual(h.errors, []);
});
test('a failed discard returns the photograph to its place and releases rapid-input locks', async () => {
  const s = review(); const positions = [], arrivals = [], errors = [];
  const c = new ExploreFeedController({read:()=>s,pages:()=>exploreFeed(s),save:async()=>{throw Error('Disk full');},scrollTo:index=>positions.push(index),onPage:()=>{},onBusy:()=>{},onError:message=>errors.push(message),onFeed:()=>{},prepare:async entry=>{arrivals.push(entry);} }, 'a');
  await assert.rejects(c.discard('a','left',Promise.resolve()), /wasn’t saved/);
  assert.equal(c.activeId,'a'); assert.equal(c.busy,false); assert.equal(c.canDiscard('a'),true);
  assert.equal(c.hidden.has('a'), false, 'the photograph is back in the sequence');
  assert.equal(arrivals.at(-1).from,'left'); assert.equal(positions.at(-1),0);
  assert.match(errors.at(-1), /last saved photo/);
});
test('the flight carries the photograph from the finger to the trash, shrinking all the way', () => {
  const frame = { width: 390, height: 600 };
  const target = { x: 350, y: 560 };
  const path = flightPath(frame, { x: -90, y: 20 }, target, 'left', 1800);
  assert.deepEqual(flightAt(path, 0), { x: -90, y: 20, scale: 1, rotate: -90/22, opacity: 1 });
  const landed = flightAt(path, 1);
  assert.equal(Math.round(landed.x), Math.round(target.x - frame.width / 2));
  assert.equal(Math.round(landed.y), Math.round(target.y - frame.height / 2));
  assert.ok(landed.scale < 0.12 && landed.scale > 0, `a trash-sized miniature, not nothing: ${landed.scale}`);
  for (const t of [0.1, 0.25, 0.5, 0.75, 0.9])
    assert.ok(Math.abs(flightAt(path, t).scale - (1 + (path.scale - 1) * t)) < 1e-10, `scale is linear at ${t}`);
  assert.equal(flightAt(path, 0.9).opacity, 1, 'the photograph stays visible while shrinking');
  assert.equal(landed.opacity, 0, 'it disappears into the can');
  assert.equal(Math.abs(landed.rotate), 0, 'and lands level');
  // Keeps shrinking the whole way, never growing back.
  let previous = 1;
  for (let t = 0.1; t <= 1.0001; t += 0.1) {
    const at = flightAt(path, t);
    assert.ok(at.scale < previous, `scale must fall at ${t.toFixed(1)}`);
    previous = at.scale;
  }
  // Carries on past the finger in the swipe's own direction before it curves back.
  assert.ok(flightAt(path, 0.25).x < -90, 'a left swipe keeps going left first');
  assert.ok(flightAt(path, 0.8).x > flightAt(path, 0.5).x, 'then bends toward the trash');
  assert.ok(flightAt(path, 0.5).y > 20 && flightAt(path, 1).y > flightAt(path, 0.5).y, 'falling as it goes');
  // Velocity changes the arc and the time in the air, within deliberate bounds.
  const gentle = flightPath(frame, { x: 70, y: 0 }, target, 'right', 0);
  assert.ok(flightPath(frame, { x: 70, y: 0 }, target, 'right', 2600).control.x > gentle.control.x);
  for (const speed of [0, 400, 1200, 4000])
    for (const size of [{ width: 320, height: 480 }, { width: 430, height: 900 }]) {
      const p = flightPath(size, { x: 64, y: 0 }, target, 'right', speed);
      assert.ok(p.duration >= FLIGHT_MIN && p.duration <= FLIGHT_MAX, `duration ${p.duration}`);
      assert.ok(p.scale > 0 && p.scale < 0.2, `miniature scale ${p.scale}`);
      assert.ok(Math.abs(p.control.x) <= size.width * 0.8 + 1, `the arc stays watchable: ${p.control.x}`);
    }
});
test('review instructions persist completion, interruption, dismissal and explicit replay', async () => {
  const saved = new Map(); let tail=Promise.resolve();
  const { reviewGuidance } = makeLoader({ './repository': { storage: {getValue:async key=>saved.get(key),setValue:async(key,value)=>saved.set(key,value)}, serialize:fn=>{ const p=tail.then(fn);tail=p;return p; } } })('services/review-guidance.ts');
  assert.equal(nextReviewStep(await reviewGuidance.load()),'browse');
  await reviewGuidance.complete('browse'); assert.equal(nextReviewStep(await reviewGuidance.load()),'discard');
  await reviewGuidance.complete('discard'); assert.equal(nextReviewStep(await reviewGuidance.load()),undefined);
  // Saved steps from the older five-step hints are harmless extras.
  assert.equal(nextReviewStep({ browse: true, discard: true, trash: false }), undefined);
  await reviewGuidance.reset(); assert.equal(nextReviewStep(await reviewGuidance.load()),'browse');
  await reviewGuidance.skip(); assert.equal(nextReviewStep(await reviewGuidance.load()),undefined);
  await reviewGuidance.reset(); assert.equal(nextReviewStep(await reviewGuidance.load()),'browse');
});
test('native favorite adapter never claims success after cancellation, mismatch or missing capability', async () => {
  let value=false, mode='ok'; const writes=[];
  const module = { reviewFavorite:async()=>value, setReviewFavorite:async(_,want)=>{if(mode==='cancel') throw Error('Canceled'); if(mode==='mismatch') return !want;value=want;return value;},shareReviewAsset:async()=> 'cancelled', reviewThumbnail:async()=> 'file://thumb' };
  const factory = (os='ios',version=30,native=module)=> makeLoader({ 'react-native':{Platform:{OS:os,Version:version}}, 'expo-modules-core':{requireOptionalNativeModule:()=>native}, './repository':{repository:{update:async(id,fn)=>writes.push(fn(media(id)))}} })('services/review-media.native.ts').reviewMedia;
  const service=factory(); assert.deepEqual(await service.favorite(media('a')),{supported:true,value:false});
  assert.equal(await service.setFavorite(media('a'),true),true); assert.equal(writes.at(-1).systemFavorite,true); assert.equal(writes.at(-1).favorite,false);
  assert.equal(await service.setFavorite(media('a'),false),false);
  assert.equal(await service.setFavorite(media('a'),true),true);
  assert.equal((await service.favorite(media('a'))).value,true, 'repeated favorite changes verify the native value');
  const count=writes.length; mode='cancel';await assert.rejects(service.setFavorite(media('a'),false));assert.equal(writes.length,count);
  mode='mismatch';await assert.rejects(service.setFavorite(media('a'),false));assert.equal(writes.length,count);
  assert.equal((await factory('android',29).favorite(media('a'))).supported,false);
  assert.equal((await factory('ios',30,{}).favorite(media('a'))).supported,false);
  await service.share(media('a')); assert.equal(writes.length,count,'sharing cancellation never modifies the library');
});

test('undo restores an earlier explicit Keep decision, without creating new Keeps while browsing', async () => {
  const db = new DatabaseSync(':memory:'), p = platform(); const app = await boot(db,p);
  await app.storage.put([media('a',{decision:'keep'}),media('b'),media('c')], { [key]:review() });
  const store = services(app,p).exploreStoreFor(key);
  await store.change(c => ({type:'discard',id:c.activeId,revision:c.revision,direction:'left'}));
  assert.equal((await app.storage.get('a')).decision,'delete');
  await store.change({type:'undo'}); assert.equal((await app.storage.get('a')).decision,'keep');
  assert.equal((await app.storage.get('b')).decision,undefined); assert.equal((await app.storage.get('c')).decision,undefined);
  assert.deepEqual(p.requests,[]); db.close();
});

test('reopening a review whose active photo was queued elsewhere shows a swipeable survivor', async () => {
  const db = new DatabaseSync(':memory:'), p = platform(), app = await boot(db, p);
  await app.storage.put([media('a', { decision: 'delete' }), media('b'), media('c')], { [key]: review() });
  const store = services(app, p).exploreStoreFor(key);
  const loaded = await store.load();
  assert.equal(loaded.activeId, 'b', 'active ID must identify the actual first visible photograph');
  assert.deepEqual(exploreFeed(loaded), ['b', 'c']);
  const saved = await store.change(s => ({ type: 'discard', id: 'b', revision: s.revision, direction: 'left' }));
  assert.equal(saved.records.b.queued, true, 'the first visible photo accepts a discard');
  assert.equal((await app.storage.get('b')).decision, 'delete');
  db.close();
});

test('Undo can restore an existing queued photo after reopening without local discard history', async () => {
  const db = new DatabaseSync(':memory:'), p = platform(), app = await boot(db, p);
  await app.storage.put([media('a', { decision: 'delete' }), media('b'), media('c')], { [key]: review() });
  const store = services(app, p).exploreStoreFor(key);
  let s = await store.load();
  const controller = new ExploreFeedController({
    read: () => s, pages: () => [...exploreFeed(s), 'explore-completion'], completionPage: true,
    save: async action => { s = await store.change(action); return s; },
    scrollTo: () => {}, onPage: () => {}, onBusy: () => {}, onError: () => {},
    onFeed: () => {}, prepare: async () => {},
  }, s.activeId);
  assert.equal(s.history.length, 0);
  assert.equal(await controller.undo(), 'a');
  assert.equal(s.activeId, 'a');
  assert.equal(!!s.records.a?.queued, false);
  assert.equal((await app.storage.get('a')).decision, undefined);
  assert.deepEqual(p.requests, [], 'Undo never invokes OS deletion');
  db.close();
});

test('browser nine-photo review resumes past queued photos, discards the first visible photo, and restores existing marks', async () => {
  const { IDBFactory } = require('fake-indexeddb');
  globalThis.indexedDB = new IDBFactory();
  const load = makeLoader({ 'react-native': { Platform: { OS: 'web' } }, './media': { mediaService: { remove: () => { throw Error('Browser must never delete originals'); } } } });
  const { storage } = load('services/repository.ts');
  await storage.init();
  const ids = ['a','b','c','d','e','f','g','h','i'];
  await storage.put(ids.map(id => media(id, ['a','e','i'].includes(id) ? { decision: 'delete' } : {})), {
    [key]: review(ids), 'file:b': new Blob(['original selected photograph']),
  });
  const store = load('services/explore.ts').exploreStoreFor(key);
  let s = await store.load();
  assert.equal(s.activeId, 'b');
  assert.equal(s.ids.indexOf(s.activeId) + 1, 2, 'the count is the original snapshot position');
  const controller = new ExploreFeedController({
    read: () => s, pages: () => [...exploreFeed(s), 'explore-completion'], completionPage: true,
    save: async action => { s = await store.change(action); return s; },
    scrollTo: () => {}, onPage: () => {}, onBusy: () => {}, onError: () => {},
    onFeed: () => {}, prepare: async () => {},
  }, s.activeId);
  assert.equal(controller.canDiscard('b'), true);
  await controller.discard('b', 'left', Promise.resolve(), Promise.resolve());
  assert.equal((await storage.get('b')).decision, 'delete');
  assert.equal(await controller.undo(), 'b');
  assert.equal((await storage.get('b')).decision, undefined);
  assert.equal(s.history.length, 0);
  assert.equal(await controller.undo(), 'i', 'existing queue marks remain restorable without local history');
  assert.equal((await storage.get('i')).decision, undefined);
  assert.equal(await (await storage.getValue('file:b')).text(), 'original selected photograph');
});

test('a mounted feed can claim its first visible page after its old active photo is queued elsewhere', () => {
  const s = reconcileReview(review(), [media('a', { decision: 'delete' }), media('b'), media('c')]);
  const controller = new ExploreFeedController({
    read: () => s, pages: () => [...exploreFeed(s), 'explore-completion'], completionPage: true,
    save: async () => s, scrollTo: () => {}, onPage: () => {}, onBusy: () => {}, onError: () => {},
    onFeed: () => {}, prepare: async () => {},
  }, 'a');
  assert.equal(controller.canDiscard('b'), false);
  assert.equal(controller.claim(0, ['b'], false), true);
  assert.equal(controller.activeId, 'b');
  assert.equal(controller.canDiscard('b'), true);
});
