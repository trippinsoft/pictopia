const test = require('node:test');
const assert = require('node:assert/strict');
const { makeLoader } = require('./loader.cjs');
const { DatabaseSync, boot, platform, media } = require('./native-harness.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));

async function fixture(ids, rows) {
  const db = new DatabaseSync(':memory:'), app = await boot(db, platform());
  await app.storage.put(rows);
  const read = makeLoader({ './repository': app, './albums': { albumService: { members: async () => ids } } })('services/album-covers.ts').albumCoverReader;
  return { db, app, read };
}

test('album covers skip missing, inactive and deleted members, preserve album order and never write exploration', async () => {
  const ids = ['missing', 'inactive', 'deleted', 'b', 'a', 'b', 'outside'];
  const rows = [media('inactive', { active: false }), media('deleted', { deletedAt: 1 }), media('a'), media('b'), media('not-in-album')];
  const { db, app, read } = await fixture(ids, rows);
  const before = await app.storage.progress();
  const reader = await read('whatsapp', new AbortController().signal);
  assert.equal((await reader.next()).id, 'b');
  assert.equal((await reader.next()).id, 'a');
  assert.equal(await reader.next(), undefined);
  assert.deepEqual(await app.storage.progress(), before);
  assert.equal((await app.storage.get('a')).firstSeenAt, undefined);
  assert.equal((await app.storage.get('a')).decision, undefined);
  assert.deepEqual(ids, ['missing', 'inactive', 'deleted', 'b', 'a', 'b', 'outside']);
  db.close();
});

test('cover fallback can reach accessible members beyond the first batch and supports videos', async () => {
  const ids = Array.from({ length: 91 }, (_, i) => String(i));
  const { db, read } = await fixture(ids, [media('90', { type: 'video' })]);
  const reader = await read('large', new AbortController().signal);
  assert.equal((await reader.next()).id, '90');
  assert.equal(await reader.next(), undefined);
  db.close();
});

test('permission-limited/empty albums and cancellation produce no cover without altering membership', async () => {
  const { db, read } = await fixture([], [media('not-shared')]);
  assert.equal(await (await read('limited', new AbortController().signal)).next(), undefined);
  const controller = new AbortController();
  const pending = await read('limited', controller.signal); controller.abort();
  assert.equal(await pending.next(), undefined);
  db.close();
});

function coverHarness(read) {
  const slots = [];
  let index = 0, effects = [], cleanups = [];
  const router = { pushes: [], push(route) { this.pushes.push(route); } };
  const load = makeLoader({
    react: { useState(initial) { const i = index++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = value; }]; }, useEffect(fn, deps) { const i = index++; if (!slots[i] || deps.some((value, j) => value !== slots[i][j])) { slots[i] = deps; effects.push(() => { cleanups[i]?.(); cleanups[i] = fn(); }); } } },
    'react-native': { View: 'view', Pressable: 'pressable', StyleSheet: { absoluteFill: {} } },
    'expo-router': { router },
    '@/services/album-covers': { albumCoverReader: read },
    './ui': { Text: 'text', Icon: 'icon' },
    './media-image': { MediaImage: 'media-image' },
    './playful': { useLift: () => ({}) },
  });
  const components = load('components/pictopia/album-card.tsx');
  let props = { album: { id: 'whatsapp', title: 'WhatsApp family holiday photographs', count: 3, kind: 'album' } };
  return {
    router, components, VideoCollectionLinks: load('components/pictopia/video-collection-links.tsx').VideoCollectionLinks,
    render(next) { props = next ?? props; index = 0; const tree = components.AlbumCover(props); const todo = effects; effects = []; todo.forEach(fn => fn()); return tree; },
    unmount() { cleanups.forEach(fn => fn?.()); },
  };
}
function findImage(tree) { return tree?.props?.children?.type === 'media-image' ? tree.props.children : undefined; }

test('a failed first image tries another member once; all failures leave a clean navigable card', async () => {
  const { db, read } = await fixture(['a','b'], [media('a'), media('b')]);
  const h = coverHarness(read);
  h.render(); await tick();
  const first = findImage(h.render()); assert.equal(first.props.media.id, 'a');
  assert.ok(first.props.failureContent, 'cover has a compact fallback instead of review error copy');
  first.props.onSettled('failed'); first.props.onSettled('failed'); await tick();
  const second = findImage(h.render()); assert.equal(second.props.media.id, 'b');
  second.props.onSettled('failed'); await tick();
  assert.equal(findImage(h.render()), undefined);
  const album = { id: 'whatsapp', title: 'WhatsApp family holiday photographs', count: 2, kind: 'album' };
  const card = h.components.AlbumCard({ album, percent: 25 });
  card.props.onPress();
  assert.deepEqual(h.router.pushes, [{ pathname: '/collection-review', params: { scope: 'album:whatsapp', title: album.title } }]);
  h.unmount(); db.close();
});

test('a departed album cover cannot replace the next album with a late lookup result', async () => {
  let finish;
  const h = coverHarness(async id => ({ next: () => id === 'old' ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(media('new')) }));
  h.render({ album: { id: 'old', kind: 'album' } }); await tick();
  h.render({ album: { id: 'new', kind: 'folder' } }); await tick();
  assert.equal(findImage(h.render()).props.media.id, 'new');
  finish(media('old')); await tick();
  assert.equal(findImage(h.render()).props.media.id, 'new');
  h.unmount();
});

test('both video rows keep their distinct collection destinations and original ordering contracts', () => {
  const h = coverHarness(async () => ({ next: async () => undefined }));
  const links = h.VideoCollectionLinks({ videos: { total: 14086, explored: 396 } });
  const [all, largest] = links.props.children;
  all.props.onPress(); largest.props.onPress();
  assert.deepEqual(h.router.pushes.map(route => route.params.scope), ['videos', 'videos-large']);
  assert.match(all.props.accessibilityLabel, /oldest first/);
  assert.match(largest.props.accessibilityLabel, /Largest videos first/);
});
