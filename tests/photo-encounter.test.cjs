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

test('only a continuously visible, loaded foreground photo qualifies; preloads and rapid passes do not', async () => {
  const time = clock(), saves = [], errors = [];
  const observer = observePhotoEncounter({ ...time, save: async at => saves.push(at), onError: () => errors.push(true) });
  await time.advance(1000);
  assert.equal(saves.length, 0, 'preload without visibility never counts');
  observer.setVisible(true);
  await time.advance(399);
  observer.setVisible(false);
  await time.advance(1000);
  assert.equal(saves.length, 0, 'backgrounding or scrolling away before dwell cancels credit');
  observer.setVisible(true);
  await time.advance(200);
  observer.setVisible(true);
  await time.advance(200);
  assert.deepEqual(saves, [3799], 'duplicate lifecycle events do not restart dwell');
  observer.setVisible(false); observer.setVisible(true);
  await time.advance(1000);
  assert.equal(saves.length, 1, 'one observer writes once even after foregrounding');
  assert.deepEqual(errors, []);
  observer.dispose();
});

test('switching photo or leaving the screen cancels unearned dwell', async () => {
  const time = clock(), saves = [];
  const a = observePhotoEncounter({ ...time, save: async () => saves.push('a'), onError: () => assert.fail('unexpected failure') });
  a.setVisible(true); await time.advance(399); a.dispose();
  const b = observePhotoEncounter({ ...time, save: async () => saves.push('b'), onError: () => assert.fail('unexpected failure') });
  b.setVisible(true); await time.advance(400);
  assert.deepEqual(saves, ['b']);
  b.dispose();
});

test('transient storage failures retry a bounded number of times with the original encounter timestamp', async () => {
  const time = clock(), attempts = [], errors = [];
  const observer = observePhotoEncounter({ ...time, save: async at => { attempts.push(at); if (attempts.length < 3) throw Error('busy'); }, onError: () => errors.push(true) });
  observer.setVisible(true); await time.advance(2400);
  assert.deepEqual(attempts, [1400, 1400, 1400]);
  assert.equal(time.pending, 0);
  assert.deepEqual(errors, []);
  observer.dispose();
});

test('persistent write failure is surfaced once and does not loop indefinitely', async () => {
  const time = clock(), errors = []; let attempts = 0;
  const observer = observePhotoEncounter({ ...time, save: async () => { attempts++; throw Error('disk failure'); }, onError: () => errors.push(true) });
  observer.setVisible(true); await time.advance(10000);
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
  h.hook('a', true, 'session'); await time.advance(399);
  h.app('background'); await time.advance(1000);
  assert.deepEqual(h.writes, []);
  h.app('active'); await time.advance(399); h.focus(false); await time.advance(1000);
  assert.deepEqual(h.writes, []);
  h.focus(true); await time.advance(400);
  assert.equal(h.writes.length, 1); assert.deepEqual(h.writes[0].slice(0, 2), ['a', 'session']);
  h.dispose(); assert.equal(h.listeners, 0); assert.equal(time.pending, 0);
});

test('session rerenders do not restart the actual hook dwell timer; retries use the current callback', async () => {
  const time = clock(), h = hookHarness(time), writes = [];
  h.hook('final', true, undefined, async at => writes.push(['before', at]));
  await time.advance(200);
  h.hook('final', true, undefined, async at => writes.push(['after', at]));
  await time.advance(200);
  assert.deepEqual(writes, [['after', 1400]]);
  h.dispose();
});

test('the actual web hook excludes hidden browser tabs and restarts dwell when visible', async t => {
  const time = clock(), h = hookHarness(time, 'web'), listeners = new Set();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const doc = { visibilityState: 'hidden', addEventListener: (event, listener) => listeners.add(listener), removeEventListener: (event, listener) => listeners.delete(listener) };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: doc });
  t.after(() => { h.dispose(); if (previous) Object.defineProperty(globalThis, 'document', previous); else delete globalThis.document; });
  h.hook('a', true); await time.advance(1000); assert.deepEqual(h.writes, []);
  doc.visibilityState = 'visible'; for (const listener of listeners) listener();
  await time.advance(399); assert.deepEqual(h.writes, []);
  await time.advance(1); assert.equal(h.writes.length, 1);
  h.dispose(); assert.equal(listeners.size, 0);
});
