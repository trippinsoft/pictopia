const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync, media, platform, boot } = require('./native-harness.cjs');
const { makeLoader } = require('./loader.cjs');
const { createExplore } = makeLoader()('lib/pictopia/explore.ts');
function store(app, key) {
  return makeLoader({ './repository': app, './media': { mediaService: app.mediaService }, 'react-native': { Platform: { OS: 'ios' } } })('services/explore.ts').exploreStoreFor(key);
}
const review = ids => ({ ...createExplore(ids, 100), review: true });

test('displaying the final photo records it without leaving it, finishing, or making a decision', async () => {
  const db = new DatabaseSync(':memory:'), app = await boot(db, platform());
  const key = 'adventure:last:explore';
  await app.storage.put([media('a'), media('b')], { [key]: review(['a', 'b']) });
  const s = store(app, key);
  await s.change({ type: 'seen', id: 'a', displayedAt: 400 });
  let session = await s.change(current => ({ type: 'page', id: current.activeId, toId: 'b', revision: current.revision, availableIds: ['a', 'b'] }));
  assert.equal((await app.storage.get('b')).firstSeenAt, undefined, 'preloading the destination is not an encounter');
  session = await s.change({ type: 'seen', id: 'b', displayedAt: 500 });
  assert.equal(session.activeId, 'b'); assert.ok(!session.finished);
  assert.equal((await app.storage.get('b')).firstSeenAt, 500);
  const first = (await app.storage.get('a')).firstSeenAt;
  await s.change({ type: 'seen', id: 'b', displayedAt: 700 });
  assert.equal((await app.storage.progress()).explored, 2);
  assert.equal((await app.storage.progress()).pending, 0);
  assert.equal((await app.storage.get('a')).firstSeenAt, first);
  for (const id of ['a', 'b']) assert.equal((await app.storage.get(id)).decision, undefined);
  db.close();
});

test('qualified encounters survive delayed storage without moving a newer adventure position', async () => {
  const db = new DatabaseSync(':memory:'), app = await boot(db, platform());
  const key = 'adventure:delayed:explore';
  await app.storage.put([media('a'), media('b'), media('offscreen')], { [key]: review(['a', 'b']) });
  const s = store(app, key);
  await s.change(current => ({ type: 'page', id: 'a', toId: 'b', revision: current.revision, availableIds: [] }));
  await s.change({ type: 'seen', id: 'a' });
  assert.equal((await app.storage.get('a')).firstSeenAt, undefined, 'an unqualified late load callback cannot count an old page');
  const session = await s.change({ type: 'seen', id: 'a', displayedAt: 500 });
  assert.equal(session.activeId, 'b'); assert.equal((await app.storage.get('a')).firstSeenAt, 500);
  for (const displayedAt of [0, 50, NaN, Date.now() + 10000]) await s.change({ type: 'seen', id: 'b', displayedAt });
  await s.change({ type: 'seen', id: 'offscreen', displayedAt: 500 });
  assert.equal((await app.storage.get('b')).firstSeenAt, undefined);
  assert.equal((await app.storage.get('offscreen')).firstSeenAt, undefined);
  assert.equal((await app.storage.progress()).pending, 0);
  db.close();
});

test('paging past loaded photos does not count preloads or rapidly skipped photos', async () => {
  const db = new DatabaseSync(':memory:'), app = await boot(db, platform());
  const key = 'adventure:preload:explore';
  await app.storage.put([media('a'), media('b'), media('c')], { [key]: review(['a', 'b', 'c']) });
  const s = store(app, key);
  await s.change(current => ({ type: 'page', id: current.activeId, toId: 'c', revision: current.revision, availableIds: ['a', 'b', 'c'] }));
  assert.equal((await app.storage.progress()).explored, 0, 'loaded image cache is not visibility evidence');
  await s.change({ type: 'seen', id: 'c', displayedAt: 500 });
  assert.equal((await app.storage.progress()).explored, 1);
  assert.equal((await app.storage.get('a')).firstSeenAt, undefined);
  assert.equal((await app.storage.get('b')).firstSeenAt, undefined);
  db.close();
});

test('an interrupted encounter transaction rolls back both records and retries idempotently after restart', async () => {
  const db = new DatabaseSync(':memory:'), p = platform(), fault = {};
  let app = await boot(db, p, fault);
  const key = 'adventure:interrupted:explore';
  await app.storage.put([media('a')], { [key]: review(['a']) });
  fault.key = key;
  await assert.rejects(() => store(app, key).change({ type: 'seen', id: 'a', displayedAt: 500 }), /Simulated write failure/);
  assert.equal((await app.storage.get('a')).firstSeenAt, undefined);
  assert.equal((await app.storage.getValue(key)).records.a, undefined);
  app = await boot(db, p);
  const s = store(app, key);
  await s.change({ type: 'seen', id: 'a', displayedAt: 500 });
  await s.change({ type: 'seen', id: 'a', displayedAt: 500 });
  assert.equal((await app.storage.progress()).explored, 1);
  assert.equal((await app.storage.get('a')).firstSeenAt, 500);
  assert.deepEqual(p.requests, []);
  db.close();
});

test('qualified classic encounters survive advancing, finishing and switching sessions without replacing the active session', async () => {
  const db = new DatabaseSync(':memory:'), app = await boot(db, platform());
  const old = { id: 'old', ids: ['a', 'b'], started: 100, activeAt: 900, position: 1, complete: true };
  const current = { id: 'current', ids: ['c'], started: 1000, position: 0, complete: false };
  await app.storage.put([media('a'), media('b'), media('c')], { session: current, 'session:old': old });
  await app.repository.encounter('a', 'old', 500);
  assert.equal((await app.storage.get('a')).firstSeenAt, 500);
  assert.deepEqual(await app.storage.getValue('session'), current);
  assert.equal((await app.storage.getValue('session:old')).activeAt, 900, 'late credit does not make this the newest experience');
  await app.repository.encounter('b', 'old');
  await app.repository.encounter('c', 'old', 500);
  assert.equal((await app.storage.get('b')).firstSeenAt, undefined);
  assert.equal((await app.storage.get('c')).firstSeenAt, undefined);
  await app.storage.setValue('session:old', { ...old, complete: false });
  await app.repository.encounter('b', 'old');
  assert.equal((await app.storage.get('b')).firstSeenAt, undefined, 'archived unfinished sessions also require qualified visibility evidence');
  db.close();
});

test('same-library-ID edits and date corrections preserve first-seen history, including concurrent sync', async () => {
  const db = new DatabaseSync(':memory:'), app = await boot(db, platform());
  await app.storage.put([media('a')]);
  await Promise.all([app.repository.encounter('a', undefined, 500), app.repository.ingest([media('a', { width: 1500, created: 10000, modified: 10000, month: '1970-01' })], 1)]);
  assert.equal((await app.storage.get('a')).firstSeenAt, 500);
  await app.repository.encounter('a', undefined, 400);
  assert.equal((await app.storage.get('a')).firstSeenAt, 400, 'the earliest qualified encounter wins regardless of write order');
  await app.repository.encounter('a', undefined, 900);
  assert.equal((await app.storage.get('a')).firstSeenAt, 400);
  assert.equal((await app.storage.progress()).explored, 1);
  db.close();
});

test('permission shrink and expansion preserve lifetime history and never invent cleanup', async () => {
  const db = new DatabaseSync(':memory:'), app = await boot(db, platform());
  await app.repository.ingest([media('a'), media('b'), media('c')], 1);
  await app.repository.encounter('a', undefined, 500);
  await app.repository.encounter('b', undefined, 600);
  await app.repository.ingest([media('a')], 2); await app.repository.reconcile(2);
  assert.deepEqual({ ...await app.storage.progress() }, { accessible: 1, accessibleExplored: 1, explored: 2, remaining: 0, pending: 0, deleted: 0, deletedBytes: 0, unknownSizes: 0 });
  await app.repository.ingest([media('a'), media('b'), media('c'), media('new')], 3); await app.repository.reconcile(3);
  assert.equal((await app.storage.progress()).explored, 2);
  assert.equal((await app.storage.progress()).remaining, 2);
  assert.equal((await app.storage.progress()).deleted, 0);
  assert.equal((await app.storage.get('new')).firstSeenAt, undefined);
  db.close();
});

test('prototype browsing stays isolated from lifetime encounters and production decisions', async () => {
  const db = new DatabaseSync(':memory:'), app = await boot(db, platform());
  const key = 'verticalExplore:v1';
  await app.storage.put([media('a'), media('b')], { [key]: createExplore(['a', 'b'], 100) });
  const s = store(app, key);
  await s.change({ type: 'seen', id: 'a', displayedAt: 500 });
  await s.change(current => ({ type: 'page', id: current.activeId, toId: 'b', revision: current.revision, availableIds: ['a', 'b'] }));
  assert.equal((await app.storage.progress()).explored, 0);
  assert.equal((await app.storage.progress()).pending, 0);
  db.close();
});
