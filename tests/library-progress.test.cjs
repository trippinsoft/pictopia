const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync, media, platform, boot } = require('./native-harness.cjs');
const { makeLoader } = require('./loader.cjs');

test('first-seen history survives decisions, Undo, sync, external removal and restart; new photos remain unseen', async () => {
  const db = new DatabaseSync(':memory:');
  const p = platform();
  let app = await boot(db, p);
  await app.storage.put([media('a'), media('b'), media('video', { type: 'video' })]);
  await app.repository.migrateProgress();
  await app.repository.start('recent', { includeFavorites: true, showReviewed: true });
  await app.repository.encounter('a');
  const first = (await app.storage.get('a')).firstSeenAt;
  await app.repository.encounter('a');
  assert.equal((await app.storage.get('a')).firstSeenAt, first);
  // Both flows share the exact same persisted photo record.
  const load = makeLoader({ './repository': app, './media': { mediaService: app.mediaService }, 'react-native': { Platform: { OS: 'ios' } } });
  const { createExplore } = load('lib/pictopia/explore.ts');
  const { exploreStoreFor } = load('services/explore.ts');
  const key = 'adventure:test:explore';
  await app.storage.setValue(key, { ...createExplore(['a', 'b']), review: true });
  const store = exploreStoreFor(key);
  await store.change({ type: 'seen', id: 'a' });
  assert.equal((await app.storage.progress()).explored, 1);
  let s = await store.load();
  await store.change({ type: 'discard', id: 'a', revision: s.revision, direction: 1 });
  assert.equal((await app.storage.progress()).pending, 1);
  await store.change({ type: 'undo' });
  assert.equal((await app.storage.progress()).pending, 0);
  assert.equal((await app.storage.progress()).explored, 1);
  await app.repository.ingest([media('a'), media('new')], 20);
  await app.repository.reconcile(20);
  assert.equal((await app.storage.get('a')).firstSeenAt, first);
  assert.deepEqual({ ...await app.storage.progress() }, { accessible: 2, accessibleExplored: 1, explored: 1, remaining: 1, pending: 0, deleted: 0, deletedBytes: 0, unknownSizes: 0 });
  await app.repository.ingest([media('new')], 21);
  await app.repository.reconcile(21);
  app = await boot(db, p);
  assert.equal((await app.storage.progress()).explored, 1, 'external removal preserves history');
  assert.equal((await app.storage.progress()).remaining, 1);
  db.close();
});

test('migration backfills saved adventure encounters and classic choices once, including inactive and deleted photos', async () => {
  const db = new DatabaseSync(':memory:');
  const app = await boot(db, platform());
  await app.storage.put([media('old', { active: false }), media('decision', { decision: 'keep' }), media('deleted', { active: false, deletedAt: 1, size: 2048 }), media('missingSize', { active: false, deletedAt: 1 }), media('unseen')], {
    'adventures:v1': { started: ['old'], slots: [], parked: [] },
    'adventure:old:explore': { ids: ['old', 'unseen'], records: { old: { encountered: true }, unseen: { encountered: false } } },
  });
  await app.repository.migrateProgress();
  const first = (await app.storage.get('old')).firstSeenAt;
  await app.repository.restore(['decision']);
  await app.repository.migrateProgress();
  assert.equal((await app.storage.get('old')).firstSeenAt, first);
  assert.deepEqual({ ...await app.storage.progress() }, { accessible: 2, accessibleExplored: 1, explored: 4, remaining: 1, pending: 0, deleted: 2, deletedBytes: 2048, unknownSizes: 1 });
  db.close();
});

test('unloaded or stale classic cards cannot count a different session photo', async () => {
  const db = new DatabaseSync(':memory:');
  const app = await boot(db, platform());
  await app.storage.put([media('a'), media('b')], { session: { id: 's', ids: ['a', 'b'], position: 0, complete: false } });
  await app.repository.encounter('b', 's');
  await app.repository.encounter('a', 'other');
  assert.equal((await app.storage.progress()).explored, 0);
  await app.repository.encounter('a', 's');
  assert.equal((await app.storage.progress()).explored, 1);
  assert.ok((await app.storage.getValue('session')).activeAt);
  db.close();
});

test('verified deletion keeps first-seen accomplishment and bytes across relaunch', async () => {
  const db = new DatabaseSync(':memory:');
  const p = platform({ library: ['a'] });
  let app = await boot(db, p);
  await app.storage.put([media('a', { decision: 'delete', size: 4096 })]);
  await app.repository.encounter('a');
  const first = (await app.storage.get('a')).firstSeenAt;
  await app.deleteMarked([await app.storage.get('a')], app.mediaService);
  app = await boot(db, p);
  assert.deepEqual({ ...await app.storage.progress() }, { accessible: 0, accessibleExplored: 0, explored: 1, remaining: 0, pending: 0, deleted: 1, deletedBytes: 4096, unknownSizes: 0 });
  assert.equal((await app.storage.get('a')).firstSeenAt, first);
  db.close();
});
