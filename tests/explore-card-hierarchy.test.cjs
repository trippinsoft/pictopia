const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { makeLoader } = require('./loader.cjs');

// Render the real card across an active-state change with persistent hook values.
// This checks the native-parent contract, not UIKit's delivery of touch cancellation.
function cardHarness() {
  const slots = [];
  let cursor = 0;
  const slot = init => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = init();
    return slots[index];
  };
  const jsx = (type, props) => ({ type, props });
  const load = makeLoader();
  const mocks = {
    react: {
      memo: fn => fn, forwardRef: fn => fn,
      useRef: value => slot(() => ({ current: value })),
      useState: value => [slot(() => value === 'loading' ? 'loaded' : value), () => {}],
      useCallback: fn => fn, useMemo: fn => fn(),
      useEffect: () => {}, useLayoutEffect: () => {}, useImperativeHandle: () => {},
    },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': { View: 'View', StyleSheet: { create: value => value }, useWindowDimensions: () => ({ width: 390 }) },
    'react-native-reanimated': {
      __esModule: true, default: { View: 'AnimatedView' },
      useSharedValue: value => slot(() => ({ value })), useAnimatedStyle: fn => fn(),
      Easing: { out: value => value, bezier: () => null }, ReduceMotion: { System: 'system' },
    },
    './explore-gesture': { ExploreGesture: 'ExploreGesture' },
    './media-image': { MediaImage: 'MediaImage' },
    './video-page': { VideoPage: 'VideoPage' },
    './ui': { Icon: 'Icon', Text: 'Text' },
  };
  const source = fs.readFileSync('components/pictopia/explore-card.tsx', 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', code)(name => mocks[name] ?? load(name.replace('@/', '') + '.ts'), exports);
  const actions = [];
  const props = {
    id: 'photo-under-finger', media: { id: 'photo-under-finger', width: 100, height: 100 },
    pageHeight: 700, nativeScroll: {}, motion: {},
    onAccessibleNext: () => actions.push('next'), onAccessiblePrevious: () => actions.push('previous'),
    onAccessibleUndo: () => actions.push('undo'),
  };
  return {
    actions,
    render(active) { cursor = 0; return exports.ExploreCard({ ...props, active }, null); },
  };
}

test('claiming a scrolled-to photo keeps the gesture ancestor materialized throughout the drag', () => {
  const h = cardHarness();
  const before = h.render(false);
  const gestureBefore = before.props.children[0];
  gestureBefore.props.x.value = 80;
  const after = h.render(true);
  const gestureAfter = after.props.children[0];
  assert.equal(before.type, after.type);
  assert.equal(before.props.collapsable, false, 'inactive photos already have a native parent');
  assert.equal(after.props.collapsable, false, 'claiming the photo must not insert a new native ancestor');
  assert.equal(gestureBefore.props.x, gestureAfter.props.x);
  assert.equal(gestureAfter.props.x.value, 80, 'active-state publication does not reset the drag');
});

test('stable native ancestry preserves active-photo accessibility and navigation actions', () => {
  const h = cardHarness();
  assert.equal(h.render(false).props.accessible, false);
  const active = h.render(true);
  assert.equal(active.props.accessible, true);
  assert.equal(active.props.accessibilityRole, 'image');
  assert.deepEqual(active.props.accessibilityActions.map(action => action.name), ['increment', 'decrement', 'mark', 'undo']);
  for (const name of ['increment', 'decrement', 'undo']) active.props.onAccessibilityAction({ nativeEvent: { actionName: name } });
  assert.deepEqual(h.actions, ['next', 'previous', 'undo']);
});
