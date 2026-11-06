const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { makeLoader } = require('./loader.cjs');

// Execute the actual gesture callbacks. UIKit arbitration still requires device QA.
function harness(overrides = {}) {
  const pans = [];
  function builder(kind) {
    const config = {};
    const gesture = new Proxy({ config }, {
      get(target, name) {
        if (name === 'config') return config;
        return (...args) => { config[name] = args.length === 1 ? args[0] : args; return gesture; };
      },
    });
    if (kind === 'Pan') pans.push(gesture);
    return gesture;
  }
  const Gesture = Object.fromEntries(['Pinch', 'Pan', 'Tap', 'Simultaneous', 'Race', 'Exclusive'].map(name => [name, () => builder(name)]));
  const load = makeLoader();
  const callbacks = [];
  const mocks = {
    react: { useMemo: fn => fn() },
    'react/jsx-runtime': { jsx: () => null },
    'react-native-gesture-handler': { Gesture },
    'react-native-reanimated': {
      useSharedValue: value => ({ value }),
      // Model a busy JS thread so we can check UI ownership before JS claims the page.
      runOnJS: fn => (...args) => callbacks.push(() => fn(...args)),
      withTiming: value => value,
    },
  };
  const code = ts.transpileModule(fs.readFileSync('components/pictopia/explore-gesture.native.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', code)(name => mocks[name] ?? load(name.replace('@/', '') + '.ts'), exports);
  const value = v => ({ value: v });
  const events = [];
  const samples = [];
  const props = {
    x: value(0), y: value(0), locked: value(false), enabled: true, tapEnabled: true,
    zoomed: false, zoom: {}, nativeScroll: {}, motion: { offset: value(2401), horizontal: value(false) },
    onStart: offset => events.push(['start', offset]),
    onCommit: (direction, velocity) => events.push(['commit', direction, velocity]),
    onCancel: () => events.push(['cancel']),
    onTrace: batch => samples.push(batch),
    ...overrides,
  };
  exports.ExploreGesture(props);
  return { props, events, samples, pan: pans[1].config, flush: () => { while (callbacks.length) callbacks.shift()(); } };
}

test('native horizontal activation owns scrolling and captures the offset before JS runs', () => {
  const h = harness();
  assert.equal(h.pan.simultaneousWithExternalGesture, h.props.nativeScroll);
  assert.equal(h.pan.blocksExternalGesture, undefined);
  assert.deepEqual(h.pan.activeOffsetX, [-12, 12]);
  assert.deepEqual(h.pan.failOffsetY, [-12, 12]);
  h.pan.onStart();
  assert.equal(h.props.motion.horizontal.value, true);
  h.props.motion.offset.value = 2500;
  h.flush();
  assert.deepEqual(h.events, [['start', 2401]]);
});

test('vertical failures never schedule resets; cancellation releases horizontal ownership', () => {
  const h = harness();
  h.pan.onFinalize({}, false);
  h.flush();
  assert.deepEqual(h.events, []);
  h.pan.onStart();
  h.pan.onEnd({}, false);
  h.pan.onFinalize({}, false);
  h.flush();
  assert.equal(h.props.motion.horizontal.value, false);
  assert.deepEqual(h.events, [['start', 2401], ['cancel']]);
});

test('a committed flick cannot be reset by finalization and a fresh screen starts unlocked', () => {
  const h = harness();
  h.pan.onStart();
  h.pan.onEnd({ translationX: 24, velocityX: 1000 }, true);
  h.pan.onFinalize({}, false);
  h.flush();
  assert.deepEqual(h.events, [['start', 2401], ['commit', 'right', 1000]]);
  assert.equal(h.props.locked.value, true);
  assert.equal(h.props.motion.horizontal.value, false);
  assert.equal(harness().props.motion.horizontal.value, false);
});

test('short fast flicks and deliberate drags commit once, while small movements cancel', () => {
  for (const [x, velocity, expected] of [[20, 900, 'right'], [-20, -900, 'left'], [80, 20, 'right'], [-80, -20, 'left'], [15, 1200, null], [30, 100, null], [20, -900, null]]) {
    const h = harness();
    h.pan.onStart();
    h.pan.onUpdate({ translationX: x, translationY: 3 });
    h.pan.onEnd({ translationX: x, velocityX: velocity }, true);
    h.pan.onFinalize({}, true);
    h.flush();
    assert.equal(h.props.motion.horizontal.value, false);
    assert.deepEqual(h.events, [['start', 2401], expected ? ['commit', expected, velocity] : ['cancel']]);
    assert.equal(h.props.locked.value, !!expected);
  }
});

test('pager gates native scrolling using UI ownership, without replacing native paging', () => {
  const pager = fs.readFileSync('components/pictopia/explore-pager.native.tsx', 'utf8');
  assert.match(pager, /scrollEnabled: scrollEnabled && !motion.horizontal.value/);
  assert.match(pager, /motion.offset.value = event.contentOffset.y/);
  assert.match(pager, /animatedProps=\{animatedProps\}/);
});

test('trace separates a cancelled first attempt from a successful second attempt without logging each move to JS', () => {
  const h = harness();
  const event = { handlerTag: 7, state: 2, oldState: 0, translationX: 0, translationY: 0, velocityX: 0 };
  h.pan.onBegin(event);
  h.pan.onStart({ ...event, state: 4, oldState: 2 });
  for (let x = 1; x <= 80; x++) h.pan.onUpdate({ ...event, translationX: x, velocityX: 900 });
  assert.equal(h.samples.length, 0, 'no per-frame JS trace callback');
  h.pan.onEnd({ ...event, state: 3, oldState: 4, translationX: 80, velocityX: 900 }, false);
  h.pan.onFinalize({ ...event, state: 3, oldState: 4, translationX: 80, velocityX: 900 }, false);
  h.flush();
  assert.deepEqual(h.samples[0].map(sample => sample.stage), ['begin', 'start', 'move', 'end', 'finalize']);
  assert.equal(h.samples[0].at(-1).state, 3, 'CANCELLED, not a threshold rejection');
  assert.equal(h.samples[0].at(-1).success, false);
  assert.equal(h.samples[0].at(-2).direction, 'right', 'a valid displacement can still be cancelled');
  h.pan.onBegin(event);
  h.pan.onStart({ ...event, state: 4, oldState: 2 });
  h.pan.onUpdate({ ...event, translationX: 80, velocityX: 900 });
  h.pan.onEnd({ ...event, state: 5, oldState: 4, translationX: 80, velocityX: 900 }, true);
  h.pan.onFinalize({ ...event, state: 5, oldState: 4, translationX: 80, velocityX: 900 }, true);
  h.flush();
  assert.equal(h.samples[1].at(-1).state, 5);
  assert.equal(h.samples[1].at(-1).success, true);
  assert.deepEqual(h.events.at(-1), ['commit', 'right', 900]);
});

test('trace distinguishes a completed but subthreshold swipe from recognizer cancellation', () => {
  const h = harness();
  h.pan.onBegin({ handlerTag: 8, state: 2 });
  h.pan.onStart({ handlerTag: 8, state: 4 });
  h.pan.onUpdate({ translationX: 30, translationY: 0 });
  h.pan.onEnd({ state: 5, oldState: 4, translationX: 30, velocityX: 100 }, true);
  h.pan.onFinalize({ state: 5, oldState: 4, translationX: 30, velocityX: 100 }, true);
  h.flush();
  const end = h.samples[0].find(sample => sample.stage === 'end');
  assert.equal(end.success, true);
  assert.equal(end.direction, null);
  assert.equal(end.x, 30);
  assert.equal(end.vx, 100);
  assert.deepEqual(h.events.at(-1), ['cancel']);
});
