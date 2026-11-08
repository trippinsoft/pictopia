const test = require('node:test');
const assert = require('node:assert/strict');
const { makeLoader } = require('./loader.cjs');
const { observePhotoEncounter } = makeLoader()('lib/pictopia/photo-encounter.ts');
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
function clock() {
  let now = 1000, next = 0;
  const jobs = new Map();
  return {
    now: () => now,
    schedule: (work, delay) => { const id = ++next; jobs.set(id, { work, at: now + delay }); return id; },
    cancel: id => jobs.delete(id),
    async advance(ms) {
      const end = now + ms;
      for (;;) {
        const entry = [...jobs].sort((a, b) => a[1].at - b[1].at).find(([, job]) => job.at <= end);
        if (!entry) break;
        jobs.delete(entry[0]); now = entry[1].at; entry[1].work(); await flush();
      }
      now = end; await flush();
    },
    get pending() { return jobs.size; },
  };
}

test('loaded foreground photos count immediately, including rapid passes; preloads never count', async () => {
  const time = clock(), saves = [], errors = [];
  const observer = observePhotoEncounter({ ...time, save: async at => saves.push(at), onError: () => errors.push(true) });
  await time.advance(1000);
  assert.deepEqual(saves, [], 'preload without visibility never counts');
  observer.setVisible(true);
  assert.deepEqual(saves, [2000], 'no timer, minimum duration or extra event loop is required');
  observer.setVisible(false);
  await flush();
  observer.setVisible(true); observer.setVisible(true);
  await time.advance(1000);
  assert.equal(saves.length, 1, 'revisiting does not count twice');
  assert.deepEqual(errors, []); observer.dispose();
});

test('rapid photo switching and exit preserve each loaded encounter without timers', async () => {
  const time = clock(), saves = [];
  for (const id of ['a', 'b', 'c']) {
    const observer = observePhotoEncounter({ ...time, save: async () => saves.push(id), onError: () => assert.fail('unexpected failure') });
    observer.setVisible(true); observer.dispose();
  }
  await flush();
  assert.deepEqual(saves, ['a', 'b', 'c']); assert.equal(time.pending, 0);
});

test('transient storage failures retry a bounded number of times with the original encounter timestamp', async () => {
  const time = clock(), attempts = [], errors = [];
  const observer = observePhotoEncounter({ ...time, save: async at => { attempts.push(at); if (attempts.length < 3) throw Error('busy'); }, onError: () => errors.push(true) });
  observer.setVisible(true); await flush(); await time.advance(2400);
  assert.deepEqual(attempts, [1000, 1000, 1000]);
  assert.equal(time.pending, 0);
  assert.deepEqual(errors, []);
  observer.dispose();
});

test('persistent write failure is surfaced once and does not loop indefinitely', async () => {
  const time = clock(), errors = []; let attempts = 0;
  const observer = observePhotoEncounter({ ...time, save: async () => { attempts++; throw Error('disk failure'); }, onError: () => errors.push(true) });
  observer.setVisible(true); await flush(); await time.advance(10000);
  assert.equal(attempts, 3); assert.deepEqual(errors, [true]); assert.equal(time.pending, 0);
  observer.dispose(); assert.deepEqual(errors, [true]);
});

test('leaving after a qualified write failed reports the unsaved progress and cancels retry', async () => {
  const time = clock(), errors = []; let attempts = 0;
  const observer = observePhotoEncounter({ ...time, save: async () => { attempts++; throw Error('disk failure'); }, onError: () => errors.push(true) });
  observer.setVisible(true); await time.advance(400); observer.dispose(); await time.advance(5000);
  assert.equal(attempts, 1); assert.deepEqual(errors, [true]); assert.equal(time.pending, 0);
});

test('a qualified save can complete after blur; a late rejection is reported without starting offscreen retries', async () => {
  const time = clock(), errors = []; let reject;
  const observer = observePhotoEncounter({ ...time, save: () => new Promise((resolve, fail) => { reject = fail; }), onError: () => errors.push(true) });
  observer.setVisible(true); await time.advance(400); observer.dispose(); reject(Error('disk failure')); await flush();
  assert.deepEqual(errors, [true]); assert.equal(time.pending, 0);
});

function hookHarness(time, os = 'ios') {
  const appListeners = new Set(), writes = [];
  let memo, deps, ref, effect, cleanup, focused = true;
  const appState = { currentState: 'active', addEventListener: (event, listener) => { appListeners.add(listener); return { remove: () => appListeners.delete(listener) }; } };
  const hook = makeLoader({
    react: {
      useRef: initial => ref ??= { current: initial },
      useCallback: (callback, next) => {
        if (!deps || next.some((value, i) => value !== deps[i])) { deps = next; memo = callback; }
        return memo;
      },
    },
    'expo-router': { useFocusEffect: callback => { if (callback !== effect) { cleanup?.(); effect = callback; cleanup = focused ? effect() : undefined; } } },
    'react-native': { AppState: appState, Platform: { OS: os } },
    '@/services/repository': { repository: { encounter: async (...args) => writes.push(args) } },
    '@/lib/pictopia/photo-encounter': { observePhotoEncounter: options => observePhotoEncounter({ ...options, ...time }) },
  })('components/pictopia/use-photo-encounter.ts').usePhotoEncounter;
  return {
    hook, writes,
    app(state) { appState.currentState = state; for (const listener of appListeners) listener(state); },
    focus(value) { focused = value; cleanup?.(); cleanup = focused ? effect?.() : undefined; },
    dispose() { cleanup?.(); },
    get listeners() { return appListeners.size; },
  };
}

test('the actual hook excludes unloaded cards, background time and blurred screens', async () => {
  const time = clock(), h = hookHarness(time);
  h.hook('a', false, 'session'); await time.advance(1000);
  assert.deepEqual(h.writes, []);
  h.app('background'); h.hook('a', true, 'session');
  await time.advance(1000); assert.deepEqual(h.writes, []);
  h.app('active'); assert.equal(h.writes.length, 1, 'counts immediately when loaded and foregrounded');
  h.focus(false); h.hook('b', true, 'session');
  await time.advance(1000); assert.equal(h.writes.length, 1, 'blurred cards never count');
  h.focus(true); assert.equal(h.writes.length, 2);
  assert.deepEqual(h.writes.map(write => write.slice(0, 2)), [['a', 'session'], ['b', 'session']]);
  h.dispose(); assert.equal(h.listeners, 0); assert.equal(time.pending, 0);
});

test('session rerenders cannot duplicate an immediate encounter; retries use the current callback', async () => {
  const time = clock(), h = hookHarness(time), writes = [];
  h.hook('final', true, undefined, async at => { writes.push(['before', at]); throw Error('busy'); });
  await flush();
  h.hook('final', true, undefined, async at => writes.push(['after', at]));
  await time.advance(600);
  assert.deepEqual(writes, [['before', 1000], ['after', 1000]]);
  h.dispose();
});

test('the actual web hook excludes hidden browser tabs and counts immediately when visible', async t => {
  const time = clock(), h = hookHarness(time, 'web'), listeners = new Set();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const doc = { visibilityState: 'hidden', addEventListener: (event, listener) => listeners.add(listener), removeEventListener: (event, listener) => listeners.delete(listener) };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: doc });
  t.after(() => { h.dispose(); if (previous) Object.defineProperty(globalThis, 'document', previous); else delete globalThis.document; });
  h.hook('a', true); await time.advance(1000); assert.deepEqual(h.writes, []);
  doc.visibilityState = 'visible'; for (const listener of listeners) listener();
  assert.equal(h.writes.length, 1, 'visible loaded photo counts without waiting');
  h.dispose(); assert.equal(listeners.size, 0);
});
