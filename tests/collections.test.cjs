const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync, media, platform, boot } = require('./native-harness.cjs');
const { makeLoader } = require('./loader.cjs');
async function setup(rows, fault = {}) {
  const db = new DatabaseSync(':memory:'), p = platform({ library: rows.map(m => m.id) }), app = await boot(db, p, fault);
  await app.storage.put(rows);
  const load = makeLoader({ ...p.mocks, './repository': app, './media': { mediaService: app.mediaService } });
  return { db, p, app, ...load('services/collections.ts'), ...load('services/explore.ts') };
}
async function exploreBatch(h, state) {
  const s = h.exploreStoreFor(h.currentBatch(state).sessionKey);
  for (const id of (await s.load()).ids) await s.change({ type: 'seen', id, displayedAt: Date.now() });
  await s.change(current => ({ type: 'page', id: current.activeId, revision: current.revision, toId: current.ids.at(-1), availableIds: current.ids }));
  await s.change({ type: 'finish' });
  return (await s.load()).ids;
}
test('full months exceed curated limits and automatically include credit from other experiences', async () => {
  const rows = Array.from({ length: 260 }, (_, i) => media(`p${String(i).padStart(3, '0')}`));
  const h = await setup(rows);
  for (const m of rows.slice(0, 15)) await h.app.repository.encounter(m.id);
  let state = await h.collectionStore.open('month:2025-06');
  assert.deepEqual(await h.collectionStore.summary(state.scope), { total: 260, explored: 15, remaining: 245 });
  const visited = [];
  for (let i = 0; i < 3; i++) {
    const ids = await exploreBatch(h, state); visited.push(...ids);
    assert.ok(ids.length <= h.COLLECTION_BATCH);
    if (i < 2) state = await h.collectionStore.next(state.scope);
  }
  assert.equal(visited.length, 245); assert.equal(new Set(visited).size, 245);
  assert.deepEqual(await h.collectionStore.summary(state.scope), { total: 260, explored: 260, remaining: 0 });
  assert.deepEqual(await h.collectionStore.summary('year:2025'), { total: 260, explored: 260, remaining: 0 });
  assert.equal((await h.app.storage.progress()).pending, 0);
  assert.deepEqual(h.p.requests, []);
  const completeKey = h.currentBatch(state).sessionKey;
  assert.equal(h.currentBatch(await h.collectionStore.open(state.scope)).sessionKey, completeKey);
  h.p.library.add('imported'); await h.app.repository.ingest([media('imported')], 2);
  state = await h.collectionStore.open(state.scope);
  assert.notEqual(h.currentBatch(state).sessionKey, completeKey);
  assert.deepEqual((await h.exploreStoreFor(h.currentBatch(state).sessionKey).load()).ids, ['imported']);
  assert.equal((await h.collectionStore.summary(state.scope)).remaining, 1);
  h.db.close();
});
test('all-photo browsing uses stable cursors across tied timestamps with no omissions or repeats', async () => {
  const rows = Array.from({ length: 250 }, (_, i) => media(`p${String(i).padStart(3, '0')}`, { firstSeenAt: 1 }));
  const h = await setup(rows);
  await h.collectionStore.open('year:2025');
  let state = await h.collectionStore.next('year:2025', true);
  const all = [];
  for (let i = 0; i < 3; i++) {
    all.push(...await exploreBatch(h, state));
    if (i < 2) state = await h.collectionStore.next(state.scope);
  }
  assert.equal(all.length, 250); assert.equal(new Set(all).size, 250);
  assert.equal(h.currentBatch(await h.collectionStore.next(state.scope)).sessionKey, h.currentBatch(state).sessionKey);
  const before = await h.collectionStore.previous(state.scope);
  assert.equal(before.position, state.position - 1);
  assert.equal(h.currentBatch(await h.collectionStore.next(state.scope)).sessionKey, h.currentBatch(state).sessionKey);
  h.db.close();
});
test('collection-specific resume survives switching and relaunch without touching the classic session', async () => {
  const h = await setup([media('a'), media('b'), media('shot', { screenshot: true })]);
  const classic = await h.app.repository.start('random', { includeFavorites: true, showReviewed: true });
  const state = await h.collectionStore.open('month:2025-06');
  const key = h.currentBatch(state).sessionKey;
  await h.exploreStoreFor(key).change(s => ({ type: 'page', id: s.activeId, revision: s.revision, toId: 'b', availableIds: ['a', 'b'] }));
  await h.collectionStore.open('screenshots');
  const resumed = await h.collectionStore.open('month:2025-06');
  assert.equal(h.currentBatch(resumed).sessionKey, key);
  assert.equal((await h.exploreStoreFor(key).load()).activeId, 'b');
  assert.equal((await h.app.storage.getValue('session')).id, classic.id);
  const reopened = await boot(h.db, h.p);
  assert.equal((await reopened.storage.getValue(`photoCollection:${state.scope}`)).batches[0].sessionKey, key);
  h.db.close();
});
test('collection and adventure marks share the guarded queue, including Undo and interrupted writes', async () => {
  const fault = {}, h = await setup([media('a'), media('b')], fault);
  const state = await h.collectionStore.open('recent'), key = h.currentBatch(state).sessionKey, s = h.exploreStoreFor(key);
  const current = await s.load(), id = current.activeId;
  await s.change({ type: 'discard', id, revision: current.revision, direction: 'right' });
  assert.equal((await h.app.storage.get(id)).decision, 'delete');
  assert.equal((await h.app.storage.progress()).pending, 1);
  await s.change({ type: 'undo' });
  assert.equal((await h.app.storage.get(id)).decision, undefined);
  const adventure = 'adventure:shared:explore';
  const { createExplore } = makeLoader()('lib/pictopia/explore.ts');
  await h.app.storage.setValue(adventure, { ...createExplore([id]), review: true });
  await h.exploreStoreFor(adventure).change(c => ({ type: 'discard', id, revision: c.revision, direction: 'left' }));
  assert.equal((await s.load()).records[id].queued, true);
  await s.change({ type: 'restore', id });
  assert.equal((await h.app.storage.get(id)).decision, undefined);
  assert.ok((await h.app.storage.get(id)).firstSeenAt);
  assert.equal((await h.app.storage.progress()).deleted, 0);
  fault.key = key;
  const other = (await s.load()).ids.find(i => i !== id);
  await assert.rejects(() => s.change({ type: 'seen', id: other, displayedAt: Date.now() }), /Simulated write failure/);
  assert.equal((await h.app.storage.get(other)).firstSeenAt, undefined);
  assert.deepEqual(h.p.requests, []);
  h.db.close();
});
test('classic collections restore their own unfinished snapshots and preserve decision history', async () => {
  const h = await setup([media('a'), media('shot', { screenshot: true })]);
  const prefs = { includeFavorites: true, showReviewed: true };
  const recent = await h.app.repository.start('recent', prefs);
  const screenshots = await h.app.repository.start('screenshots', prefs);
  assert.notEqual(screenshots.id, recent.id); assert.equal(screenshots.collection, 'screenshots');
  assert.equal((await h.app.repository.start('recent', prefs)).id, recent.id);
  assert.equal((await h.app.repository.start('screenshots', prefs)).id, screenshots.id);
  assert.equal((await h.app.storage.getValue(`session:${recent.id}`)).complete, false);
  h.db.close();
});

test('changed access opens current photos while preserving the old collection snapshot and lifetime credit', async () => {
  const h = await setup([media('old')]);
  const state = await h.collectionStore.open('month:2025-06'), oldKey = h.currentBatch(state).sessionKey;
  await h.app.repository.encounter('old');
  await h.app.repository.reconcile(2);
  h.p.library.clear(); h.p.library.add('new');
  await h.app.repository.ingest([media('new')], 3);
  const next = await h.collectionStore.open(state.scope);
  assert.notEqual(h.currentBatch(next).sessionKey, oldKey);
  assert.deepEqual((await h.app.storage.getValue(oldKey)).ids, ['old']);
  assert.deepEqual((await h.exploreStoreFor(h.currentBatch(next).sessionKey).load()).ids, ['new']);
  assert.equal((await h.app.storage.progress()).explored, 1);
  assert.equal((await h.app.storage.progress()).accessibleExplored, 0);
  assert.equal((await h.app.storage.progress()).deleted, 0);
  h.db.close();
});
test('explicit reset does not resurrect archived classic sessions, while history remains available', async () => {
  const h = await setup([media('a'), media('shot', { screenshot: true })]);
  const prefs = { includeFavorites: true, showReviewed: true };
  const old = await h.app.repository.start('recent', prefs);
  await h.app.repository.start('screenshots', prefs);
  await h.app.repository.reset();
  const fresh = await h.app.repository.start('recent', prefs);
  assert.notEqual(fresh.id, old.id);
  assert.equal((await h.app.storage.getValue(`session:${old.id}`)).id, old.id);
  h.db.close();
});

test('adventure and full-preview encounters automatically credit the same months and years', async () => {
  const h = await setup([media('june'), media('unseen'), media('july', { month: '2025-07' })]);
  const { createExplore } = makeLoader()('lib/pictopia/explore.ts');
  const key = 'adventure:calendar-credit:explore';
  await h.app.storage.setValue(key, { ...createExplore(['june']), review: true });
  await h.exploreStoreFor(key).change({ type: 'seen', id: 'june', displayedAt: Date.now() });
  await h.app.repository.encounter('july');
  assert.deepEqual(await h.collectionStore.summary('month:2025-06'), { total: 2, explored: 1, remaining: 1 });
  assert.deepEqual(await h.collectionStore.summary('year:2025'), { total: 3, explored: 2, remaining: 1 });
  const state = await h.collectionStore.open('month:2025-06');
  assert.deepEqual((await h.exploreStoreFor(h.currentBatch(state).sessionKey).load()).ids, ['unseen']);
  await h.app.repository.ingest([media('june', { month: '2025-07', created: 1751400000000 })], 2);
  assert.equal((await h.collectionStore.summary('month:2025-07')).explored, 2);
  h.db.close();
});

test('albums and folders open as collections in the album order, read live, with album progress and continuing stretches', async () => {
  const rows = Array.from({ length: 130 }, (_, i) => media(`a${String(i).padStart(3, '0')}`));
  const db = new DatabaseSync(':memory:'), p = platform({ library: rows.map(m => m.id) }), app = await boot(db, p);
  await app.storage.put(rows);
  // The album holds 125 of them in its own order, plus one Pictopia doesn't know.
  let members = [...rows.slice(0, 125).map(m => m.id).reverse(), 'unknown-asset'];
  const albums = { albumService: { supported: true, list: async () => [{ id: 'trip', title: 'Trip', count: members.length, kind: 'album' }], members: async () => members } };
  const load = makeLoader({ ...p.mocks, './repository': app, './media': { mediaService: app.mediaService }, './albums': albums });
  const h = { app, ...load('services/collections.ts'), ...load('services/explore.ts') };
  assert.equal(h.isPhotoCollection('album:trip'), true);
  assert.equal(h.collectionTitle('album:trip', 'Trip'), 'Trip');
  await app.repository.encounter('a124'); // explored elsewhere first
  assert.deepEqual(await h.collectionStore.summary('album:trip'), { total: 125, explored: 1, remaining: 124 });
  let state = await h.collectionStore.open('album:trip', 'Trip');
  assert.equal(state.title, 'Trip', 'the album name is kept for Continue');
  const first = (await h.exploreStoreFor(h.currentBatch(state).sessionKey).load()).ids;
  assert.equal(first.length, 120);
  assert.equal(first[0], 'a123', 'album order, skipping what was already explored');
  for (const id of first) await h.exploreStoreFor(h.currentBatch(state).sessionKey).change({ type: 'seen', id, displayedAt: Date.now() });
  state = await h.collectionStore.next('album:trip');
  const second = (await h.exploreStoreFor(h.currentBatch(state).sessionKey).load()).ids;
  assert.deepEqual(second, ['a003', 'a002', 'a001', 'a000'], 'the next stretch continues where the last ended');
  // Removed from the album outside Pictopia: membership is read live.
  members = members.filter(id => id !== 'a000');
  assert.equal((await h.collectionStore.summary('album:trip')).total, 124);
});

test('largest videos page by size, not by date', async () => {
  const rows = [media('v1', { type: 'video', size: 10 }), media('v2', { type: 'video', size: 300 }), media('v3', { type: 'video', size: 50 }), media('p1')];
  const h = await setup(rows);
  const state = await h.collectionStore.open('videos-large');
  assert.deepEqual((await h.exploreStoreFor(h.currentBatch(state).sessionKey).load()).ids, ['v2', 'v3', 'v1']);
  assert.equal(h.collectionTitle('videos-large'), 'Largest videos');
});
