const test = require('node:test');
const assert = require('node:assert/strict');
const { makeLoader } = require('./loader.cjs');
const { DatabaseSync, boot, platform, media } = require('./native-harness.cjs');
const { createProgressResource } = makeLoader()('lib/pictopia/progress-resource.ts');
const tick = () => new Promise(resolve => setImmediate(resolve));

function hookHarness(resource) {
  let slots = [], position = 0, effect;
  const foreground = new Set();
  const app = { ready: true, libraryReliable: true, revision: 0 };
  const useLibraryProgress = makeLoader({
    react: { useState(initial) { const i = position++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], value => { slots[i] = value; }]; }, useCallback: fn => fn },
    'expo-router': { useFocusEffect: fn => { effect = fn; } },
    'react-native': { AppState: { addEventListener: (_, fn) => { foreground.add(fn); return { remove: () => foreground.delete(fn) }; } } },
    '@/services/progress': { progressResource: resource },
    './provider': { usePictopia: () => app },
  })('components/pictopia/use-library-progress.ts').useLibraryProgress;
  const render = () => { position = 0; return useLibraryProgress(); };
  render();
  return { app, render, focus: () => effect(), foreground: () => foreground.forEach(fn => fn('active')) };
}

test('initial loading, tab switches, returning from reviews, foreground and failed refresh keep shared values', async () => {
  let resolve, reject;
  let reads = 0;
  const resource = createProgressResource(() => { reads++; return new Promise((yes, no) => { resolve = yes; reject = no; }); });
  const a = hookHarness(resource), b = hookHarness(resource);
  assert.equal(a.render().initialLoading, true);
  let blur = a.focus();
  await tick();
  blur(); // Leave while SQLite is still reading.
  const blurB = b.focus();
  assert.equal(reads, 1, 'overlapping tabs share a single in-flight read');
  const snapshot = { progress: { explored: 396, accessible: 14086, accessibleExplored: 396 } };
  resolve(snapshot); await tick();
  assert.equal(b.render().progress.explored, 396);
  assert.equal(b.render().percent, 2);
  blurB(); blur = a.focus(); await tick();
  assert.equal(a.render().progress.explored, 396, 'refocusing preserves the saved result');
  reject(Error('database busy')); await tick();
  assert.equal(a.render().error, true);
  assert.equal(a.render().initialLoading, false);
  assert.equal(a.render().progress.explored, 396, 'refresh error retains statistics');
  a.foreground(); await tick();
  assert.equal(a.render().refreshing, true);
  assert.equal(a.render().progress.explored, 396);
  resolve({ progress: { ...snapshot.progress, explored: 397, accessibleExplored: 397 } }); await tick();
  assert.equal(a.render().progress.explored, 397);
  assert.equal(a.render().error, false);
  blur(); a.app.revision++; a.render(); blur = a.focus(); await tick();
  resolve({ progress: { ...snapshot.progress, explored: 398 } }); await tick();
  assert.equal(a.render().progress.explored, 398, 'review revision refreshes saved progress');
  blur(); a.app.libraryReliable = false; a.render(); blur = a.focus();
  assert.equal(a.render().progress.explored, 398, 'interrupted library sync cannot clear valid statistics');
  blur();
});

test('a newer saved revision during an in-flight read triggers another read without losing the last value', async () => {
  const replies = [];
  const resource = createProgressResource(() => new Promise(resolve => replies.push(resolve)));
  const pending = resource.refresh(1); await tick();
  resource.refresh(1); assert.equal(replies.length, 1);
  resource.refresh(2);
  replies[0](396); await tick();
  assert.equal(resource.get().value, 396);
  assert.equal(resource.get().refreshing, true);
  assert.equal(replies.length, 2);
  replies[1](397); await pending;
  assert.equal(resource.get().value, 397);
  assert.equal(resource.get().refreshing, false);
});

test('initial read failure is an error with no invented zero; retry recovers', async () => {
  let fail = true;
  const r = createProgressResource(async () => { if (fail) throw Error('storage unavailable'); return 7; });
  await r.refresh(); assert.deepEqual(r.get(), { error: true, refreshing: false });
  fail = false; await r.refresh(); assert.deepEqual(r.get(), { value: 7, error: false, refreshing: false });
});

function services(app, p) {
  return makeLoader({ ...p.mocks, './repository': app, './media': { mediaService: app.mediaService } });
}
async function fixture(fault = {}) {
  const db = new DatabaseSync(':memory:'), p = platform(), app = await boot(db, p, fault), load = services(app, p);
  const { createExplore, reduceExplore } = load('lib/pictopia/explore.ts');
  let session = { ...createExplore(['a','b']), review: true };
  session = reduceExplore(session, { type: 'seen', id: 'a' });
  session = reduceExplore(session, { type: 'page', id: 'a', revision: session.revision, toId: 'b', availableIds: ['a','b'] });
  session = reduceExplore(session, { type: 'seen', id: 'b' });
  session = reduceExplore(session, { type: 'finish' });
  const meta = id => ({ version: 1, id, kind: 'detour', count: 2, createdAt: 1, startedAt: 2, finishedAt: 3 });
  await app.storage.put([media('a', { firstSeenAt: 1 }), media('b', { firstSeenAt: 1 }), media('v', { type: 'video', firstSeenAt: 1 })], {
    'adventures:v1': { version: 1, curated: true, slots: ['good'], parked: ['bad'], started: ['good','good','bad','missing','unfinished'], recent: [], finished: 25 },
    'adventure:good': meta('good'), 'adventure:good:explore': session,
    'adventure:bad': meta('bad'), 'adventure:bad:explore': { ...createExplore(['a','b']), review: true, finished: true },
    'adventure:unfinished': { ...meta('unfinished'), finishedAt: undefined }, 'adventure:unfinished:explore': { ...session, finished: false },
  });
  return { db, p, app, load, session };
}

test('historical backfill verifies distinct adventures, ignores counter/false endings, and preserves existing awards', async () => {
  const { db, app, load } = await fixture();
  const badges = load('services/badges.ts');
  const { evaluateBadges } = load('lib/pictopia/badges.ts');
  const old = evaluateBadges(undefined, { explorer: 396, adventurer: 25 }, 1).state;
  delete old.verification; // A pre-audit saved award, not a current verified receipt.
  await app.storage.setValue('badges:v1', old);
  const r = await badges.badgeStore.evaluate();
  assert.equal(r.values.adventurer, 1);
  assert.deepEqual(r.audit.verified, ['good']);
  assert.deepEqual(r.audit.unverified, ['bad']);
  assert.equal(r.audit.legacyCount, 25);
  assert.equal(r.state.earned.adventurer.tier, 1, 'only the supported completion is confirmed');
  assert.equal(r.state.legacy.adventurer.tier, 4, 'the original claim is archived intact');
  assert.equal(r.values.explorer, 2, 'video and duplicate snapshots never add photo credit');
  assert.equal(r.values.declutterer, 0);
  assert.equal(r.newlyEarned.some(b => b.family === 'adventurer' || b.family === 'explorer'), false);
  assert.ok((await app.storage.getValue('adventure:good')).completionProof);
  const session = await app.storage.getValue('adventure:good:explore');
  await app.storage.setValue('adventure:good:explore', { ...session, finished: false, activeId: 'b' });
  assert.equal((await badges.badgeStore.evaluate()).values.adventurer, 1, 'reopening cannot erase or duplicate a validated completion');
  db.close();
});

test('failed badge backfill rolls back completion proofs and awards, then retries once', async () => {
  const fault = {}, { db, app, load } = await fixture(fault);
  const badges = load('services/badges.ts');
  fault.key = 'badges:v1';
  await assert.rejects(badges.badgeStore.evaluate(), /Simulated write failure/);
  assert.equal(await app.storage.getValue('badges:v1'), undefined);
  assert.equal((await app.storage.getValue('adventure:good')).completionProof, undefined);
  delete fault.key;
  const r = await badges.badgeStore.evaluate();
  assert.equal(r.values.adventurer, 1); assert.deepEqual(r.newlyEarned, []);
  db.close();
});

test('finish validates saved review, commits metadata and counter atomically and is idempotent after restart', async () => {
  const fault = {}, { db, app, p, load, session } = await fixture(fault);
  const { adventureStore } = load('services/adventures.ts');
  const meta = { version: 1, id: 'new', kind: 'detour', count: 2, createdAt: 1 };
  await app.storage.put([], { 'adventure:new': meta, 'adventure:new:explore': { ...session, finished: false, activeId: 'a' } });
  await adventureStore.finish('new');
  assert.equal((await app.storage.getValue('adventure:new')).finishedAt, undefined, 'incomplete reviews are refused');
  await app.storage.setValue('adventure:new:explore', session);
  fault.key = 'adventures:v1';
  await assert.rejects(adventureStore.finish('new'), /Simulated write failure/);
  assert.equal((await app.storage.getValue('adventure:new')).finishedAt, undefined);
  delete fault.key;
  await adventureStore.finish('new');
  assert.equal((await app.storage.getValue('adventures:v1')).finished, 26);
  assert.ok((await app.storage.getValue('adventure:new')).completionProof);
  const again = await boot(db, p);
  await services(again, p)('services/adventures.ts').adventureStore.finish('new');
  assert.equal((await app.storage.getValue('adventures:v1')).finished, 26);
  db.close();
});

test('Progress and badge values share a serialized snapshot after repeated encounters and failed persistence', async () => {
  const fault = {}, { db, app, load } = await fixture(fault);
  const { progressResource } = load('services/progress.ts');
  const { exploreStoreFor } = load('services/explore.ts');
  const session = { ...load('lib/pictopia/explore.ts').createExplore(['a','b']), review: true };
  const key = 'adventure:repeat:explore';
  await app.storage.setValue(key, session);
  const store = exploreStoreFor(key);
  await store.change({ type: 'seen', id: 'a' }); await store.change({ type: 'seen', id: 'a' });
  await progressResource.refresh();
  const first = progressResource.get().value;
  assert.equal(first.progress.explored, first.badges.values.explorer);
  assert.equal(first.videos.explored, 1);
  assert.equal(first.badges.values.explorer, 2);
  fault.key = key;
  await assert.rejects(store.change({ type: 'discard', id: 'a', revision: (await store.load()).revision, direction: 'left' }));
  assert.equal((await app.storage.progress()).pending, 0);
  fault.key = 'badges:v1'; await progressResource.refresh();
  assert.equal(progressResource.get().value, first);
  assert.equal(progressResource.get().error, true);
  delete fault.key; await progressResource.refresh();
  assert.equal(progressResource.get().value.progress.explored, progressResource.get().value.badges.values.explorer);
  db.close();
});

test('all badge thresholds award only at the threshold, including reported Explorer I and Adventurer IV', () => {
  const b = makeLoader()('lib/pictopia/badges.ts');
  for (const def of b.BADGES) for (const [i, threshold] of def.tiers.entries()) {
    assert.equal(b.tierFor(def, threshold - 1), i);
    assert.equal(b.tierFor(def, threshold), i + 1);
  }
  const explorer = b.badgeView(b.BADGES[0], undefined, 396);
  assert.equal(explorer.tier, 1); assert.equal(explorer.label, '100 photos explored'); assert.equal(explorer.next, 500);
  const adventurer = b.badgeView(b.BADGES[5], undefined, 25);
  assert.equal(adventurer.tier, 4); assert.equal(adventurer.next, 50);
});
