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

test('largest videos resolves missing sizes before ranking and preserves old snapshots and decisions', async () => {
  const rows = [
    media('new-small', { type: 'video', created: 300, decision: 'keep' }),
    media('old-big', { type: 'video', created: 100 }),
    media('scanned', { type: 'video', created: 200, scan: { size: 200, version: 'test' } }),
    media('unknown', { type: 'video', created: 400 }),
  ];
  const h = await setup(rows);
  const calls = [];
  h.app.mediaService.size = async m => {
    calls.push(m.id);
    if (m.id === 'unknown') throw Error('Metadata unavailable');
    return m.id === 'old-big' ? 300 : 10;
  };
  const { createExplore } = makeLoader()('lib/pictopia/explore.ts');
  const oldKey = 'collection:videos-large:legacy:explore';
  await h.app.storage.setValue(oldKey, { ...createExplore(['unknown', 'new-small', 'scanned', 'old-big']), review: true });
  await h.app.storage.setValue('photoCollection:videos-large', {
    scope: 'videos-large', batches: [{ sessionKey: oldKey, mode: 'unseen' }], position: 0, openedAt: 1,
  });
  const state = await h.collectionStore.open('videos-large');
  const key = h.currentBatch(state).sessionKey;
  assert.notEqual(key, oldKey);
  assert.deepEqual((await h.exploreStoreFor(key).load()).ids, ['old-big', 'scanned', 'new-small', 'unknown']);
  assert.deepEqual((await h.app.storage.getValue(oldKey)).ids, ['unknown', 'new-small', 'scanned', 'old-big']);
  assert.equal((await h.app.storage.get('old-big')).size, 300);
  assert.equal((await h.app.storage.get('new-small')).decision, 'keep');
  assert.equal((await h.app.storage.get('unknown')).size, undefined);
  assert.ok(!calls.includes('scanned'));
  assert.equal(h.currentBatch(await h.collectionStore.open('videos-large')).sessionKey, key);
  assert.deepEqual(h.p.requests, []);
  h.db.close();
});

test('largest videos ranks the entire library before limiting a batch', async () => {
  const rows = Array.from({ length: 510 }, (_, i) => media(`v${i}`, { type: 'video', created: 1000 - i }));
  const h = await setup(rows);
  h.app.mediaService.size = async m => Number(m.id.slice(1)) + 1;
  const state = await h.collectionStore.open('videos-large');
  const ids = (await h.exploreStoreFor(h.currentBatch(state).sessionKey).load()).ids;
  assert.equal(ids.length, 120);
  assert.equal(ids[0], 'v509');
  assert.equal(ids[119], 'v390');
  h.db.close();
});

test('Largest videos resumes its saved position independently of a size-ranked replay, even after restarting', async () => {
  const h = await setup([100, 300, 200, 50].map((size, i) => media(`video${i}`, { type: 'video', size })));
  const first = await h.collectionStore.open('videos-large');
  const normalKey = h.currentBatch(first).sessionKey;
  const normal = h.exploreStoreFor(normalKey);
  await normal.change({ type: 'seen', id: 'video1', displayedAt: Date.now() });
  await normal.change(s => ({ type: 'page', id: s.activeId, revision: s.revision, toId: 'video2', availableIds: s.ids }));
  await normal.change({ type: 'seen', id: 'video2', displayedAt: Date.now() });
  const replay = await h.collectionStore.next('videos-large', true);
  assert.deepEqual((await h.exploreStoreFor(h.currentBatch(replay).sessionKey).load()).ids, ['video1', 'video2', 'video0', 'video3']);
  await h.collectionStore.open('recent');
  const app = await boot(h.db, h.p);
  const load = makeLoader({ ...h.p.mocks, './repository': app, './media': { mediaService: app.mediaService } });
  const { collectionStore } = load('services/collections.ts');
  assert.equal(h.currentBatch(await collectionStore.open('videos-large')).sessionKey, normalKey);
  assert.equal((await load('services/explore.ts').exploreStoreFor(normalKey).load()).activeId, 'video2');
  const oldest = await collectionStore.open('videos');
  const { ids } = await app.storage.getValue(h.currentBatch(oldest).sessionKey);
  assert.deepEqual(ids, ['video0', 'video3'], 'Continue in All videos sees the same global history');
  await exploreBatch(h, oldest);
  assert.equal((await collectionStore.summary('videos')).remaining, 0);
  const all = await collectionStore.next('videos', true);
  assert.deepEqual((await app.storage.getValue(h.currentBatch(all).sessionKey)).ids, ['video0', 'video1', 'video2', 'video3']);
  h.p.library.add('new-video');
  await app.repository.ingest([media('new-video', { type: 'video', size: 500 })], 2);
  assert.deepEqual((await app.storage.getValue(h.currentBatch(await collectionStore.open('videos')).sessionKey)).ids, ['new-video']);
  h.db.close();
});

test('All Photos replays every 120-item batch from newest first without adding unique or streak credit', async () => {
  const rows = Array.from({ length: 245 }, (_, i) => media(`p${String(i).padStart(3, '0')}`, { firstSeenAt: 1 }));
  const h = await setup(rows);
  await h.collectionStore.open('recent');
  let state = await h.collectionStore.next('recent', true);
  const visited = [];
  const before = await h.app.storage.progress();
  for (const count of [120, 120, 5]) {
    assert.equal(h.currentBatch(state).hasMore, count === 120);
    const ids = await exploreBatch(h, state);
    assert.equal(ids.length, count);
    visited.push(...ids);
    if (count === 120) state = await h.collectionStore.next('recent');
  }
  assert.deepEqual(visited, rows.map(m => m.id).reverse());
  assert.deepEqual(await h.app.storage.progress(), before);
  assert.equal(await h.app.storage.getValue('dailyActivity:v1'), undefined);
  h.p.library.add('new-photo');
  await h.app.repository.ingest([media('new-photo', { created: rows[0].created + 1 })], 2);
  state = await h.collectionStore.open('recent');
  assert.deepEqual(await exploreBatch(h, state), ['new-photo']);
  const day = await h.app.storage.getValue('dailyActivity:v1');
  assert.deepEqual(day.today.ids, ['new-photo']);
  assert.equal((await h.app.storage.progress()).explored, before.explored + 1);
  h.db.close();
});

for (const os of ['ios', 'android']) {
  test(`Review Again respects queue, limited access and unknown media on ${os}`, async () => {
    const rows = [
      media('queued', { decision: 'delete', firstSeenAt: 1 }),
      media('kept', { decision: 'keep', systemFavorite: true, firstSeenAt: 1 }),
      media('deleted', { deletedAt: 10 }),
      media('private'),
      media('cloud-lookup-failed'),
      media('pending', { decision: 'delete' }),
    ];
    const db = new DatabaseSync(':memory:');
    const p = platform({ os, library: rows.map(m => m.id), access: 'limited', selected: rows.filter(m => m.id !== 'private').map(m => m.id) });
    p.lookupErrors.add('cloud-lookup-failed');
    const lookup = p.ml.getAssetInfoAsync;
    const downloadOptions = [];
    p.ml.getAssetInfoAsync = async (id, options) => {
      downloadOptions.push(options.shouldDownloadFromNetwork);
      return lookup(id);
    };
    const app = await boot(db, p);
    await app.storage.put(rows, { deletionAttempt: { ids: ['pending'] } });
    const load = makeLoader({ ...p.mocks, './repository': app, './media': { mediaService: app.mediaService } });
    const h = { app, ...load('services/collections.ts'), ...load('services/explore.ts') };
    const state = await h.collectionStore.next('recent', true);
    const store = h.exploreStoreFor(h.currentBatch(state).sessionKey);
    const session = await store.load();
    assert.deepEqual(new Set(session.ids), new Set(['queued', 'kept']));
    assert.equal(session.records.queued.queued, true);
    await store.change({ type: 'seen', id: 'queued', displayedAt: Date.now() });
    await store.change(s => ({ type: 'discard', id: 'queued', revision: s.revision, direction: 'left' }));
    assert.equal((await store.load()).history.length, 0, 'a pre-existing discard cannot be added twice');
    await exploreBatch(h, state);
    assert.equal((await app.storage.get('queued')).decision, 'delete');
    assert.equal((await app.storage.get('kept')).decision, 'keep');
    assert.equal((await app.storage.get('kept')).systemFavorite, true);
    assert.equal((await app.storage.get('cloud-lookup-failed')).firstSeenAt, undefined);
    assert.deepEqual(await app.storage.getValue('deletionAttempt'), { ids: ['pending'] });
    assert.ok(downloadOptions.length > 0);
    assert.ok(downloadOptions.every(option => option === false), 'replay never downloads originals to test visibility');
    assert.deepEqual(p.requests, []);
    db.close();
  });
}

test('Screenshot Sweep retains its normal 50-item adventure segments and replays independently in groups of 50', async () => {
  const rows = Array.from({ length: 107 }, (_, i) => media(`shot${String(i).padStart(3, '0')}`, { screenshot: true }));
  rows.push(media('favorite', { screenshot: true, systemFavorite: true }));
  const h = await setup(rows);
  const load = makeLoader({ ...h.p.mocks, './repository': h.app, './media': { mediaService: h.app.mediaService } });
  const { adventureStore, adventureSessionKey } = load('services/adventures.ts');
  const { badgeStore } = load('services/badges.ts');
  const sweep = await adventureStore.choose({ kind: 'screenshots' }, 1, true);
  await adventureStore.open(sweep.id, true);
  const store = h.exploreStoreFor(adventureSessionKey(sweep.id));
  const swept = [];
  for (const count of [50, 50, 7]) {
    const { ids } = await store.load();
    assert.equal(ids.length, count);
    swept.push(...ids);
    for (const id of ids) await store.change({ type: 'seen', id, displayedAt: Date.now() });
    const saved = await store.load();
    await store.change({ type: 'finish', endId: ids.at(-1), expectedRevision: saved.revision });
    await adventureStore.finish(sweep.id);
    if (count === 50) {
      const next = swept.length === 50 ? await adventureStore.open(sweep.id, true) : await adventureStore.continue(sweep.id);
      assert.equal(next.id, sweep.id);
    }
  }
  assert.equal(new Set(swept).size, 107);
  assert.equal((await adventureStore.segmentStatus(sweep.id)).complete, true);
  assert.equal(await adventureStore.choose({ kind: 'screenshots' }, 2, true), undefined);
  const earned = (await badgeStore.evaluate()).values.adventurer;
  let replay = await h.collectionStore.next('screenshots', true);
  const replayed = [];
  for (const count of [50, 50, 7]) {
    const ids = await exploreBatch(h, replay);
    assert.equal(ids.length, count);
    replayed.push(...ids);
    if (count === 50) replay = await h.collectionStore.next('screenshots');
  }
  assert.deepEqual(replayed, rows.slice(0, -1).map(m => m.id));
  assert.equal((await badgeStore.evaluate()).values.adventurer, earned);
  h.p.library.add('new-shot');
  await h.app.repository.ingest([media('new-shot', { screenshot: true })], 2);
  const fresh = await adventureStore.choose({ kind: 'screenshots' }, 3, true);
  assert.deepEqual((await h.exploreStoreFor(adventureSessionKey(fresh.id)).load()).ids, ['new-shot']);
  h.db.close();
});

test('Recents keeps its latest 100 mixed items and Favorites includes previously reviewed favorites', async () => {
  const rows = Array.from({ length: 104 }, (_, i) => media(`m${String(i).padStart(3, '0')}`, {
    type: i % 2 ? 'video' : 'photo', screenshot: i % 4 === 0, firstSeenAt: 1, favorite: i === 102,
  }));
  const h = await setup(rows);
  const recents = await h.collectionStore.open('recents');
  const ids = await exploreBatch(h, recents);
  assert.deepEqual(ids, rows.slice(4).map(m => m.id).reverse());
  assert.equal(h.currentBatch(await h.collectionStore.open('recents')).sessionKey, h.currentBatch(recents).sessionKey);
  const favorite = await h.collectionStore.open('favorites');
  assert.deepEqual(await exploreBatch(h, favorite), ['m102']);
  assert.deepEqual(await exploreBatch(h, await h.collectionStore.open('favorites')), ['m102']);
  assert.deepEqual(['recent', 'videos', 'videos-large', 'screenshots', 'recents', 'favorites', 'month:2025-06'].filter(h.canReviewAgain),
    ['recent', 'videos', 'videos-large', 'screenshots']);
  h.db.close();
});

test('Largest videos replay advances without repeating when the last size-ranked item disappears', async () => {
  const rows = Array.from({ length: 123 }, (_, i) => media(`video${i}`, { type: 'video', size: 200 - i, firstSeenAt: 1 }));
  const h = await setup(rows);
  let state = await h.collectionStore.next('videos-large', true);
  assert.equal(h.currentBatch(state).hasMore, true);
  await exploreBatch(h, state);
  h.p.library.delete('video119');
  h.p.library.add('new-largest');
  await h.app.repository.ingest([media('new-largest', { type: 'video', size: 5_000 })], 2);
  state = await h.collectionStore.next('videos-large');
  assert.deepEqual(await exploreBatch(h, state), ['new-largest', 'video120', 'video121', 'video122']);
  assert.equal(h.currentBatch(state).hasMore, false);
  h.db.close();
});
