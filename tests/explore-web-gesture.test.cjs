const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { makeLoader } = require('./loader.cjs');
const { WebPageDrag } = makeLoader()('lib/pictopia/web-page-drag.ts');

// Execute the real browser card callbacks with the pager's capture-phase arbitration.
function harness() {
  const events = [];
  const value = v => ({ value: v });
  const props = {
    enabled: true, tapEnabled: true, zoomed: false, zoom: {},
    x: value(0), y: value(0), locked: value(false),
    onStart: () => events.push('start'),
    onCommit: direction => events.push(direction),
    onCancel: () => events.push('cancel'),
    onTap: () => events.push('tap'),
  };
  const load = makeLoader();
  const mocks = {
    react: { useRef: current => ({ current }), useEffect: () => {} },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }) },
    'react-native-reanimated': { withTiming: value => value },
  };
  const code = ts.transpileModule(fs.readFileSync('components/pictopia/explore-gesture.web.tsx','utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', code)(name => mocks[name] ?? load(name.replace('@/', '') + '.ts'), exports);
  const handlers = exports.ExploreGesture(props).props;
  const surface = { scrollTop: 0, clientHeight: 600, scrollHeight: 1800, style: { scrollSnapType: 'y mandatory' }, scrollTo() {} };
  const drag = new WebPageDrag(() => {});
  const node = { setPointerCapture() {} };
  const event = (x, y, time) => ({ pointerId: 1, clientX: x, clientY: y, timeStamp: time, button: 0, currentTarget: node, preventDefault() {} });
  return { props, events, handlers, drag, surface, event };
}
for (const sign of [-1, 1]) {
  test(`mostly sideways ${sign < 0 ? 'left' : 'right'} swipe with vertical drift commits instead of springing back`, () => {
    const h = harness();
    h.drag.start({ id: 1, x: 0, y: 0, time: 0 }, h.surface, true);
    h.handlers.onPointerDown(h.event(0, 0, 0));
    // Coalesced browser move crosses X and Y thresholds in the same event.
    assert.equal(h.drag.move({ id: 1, x: sign * 80, y: 20, time: 80 }), false);
    h.handlers.onPointerMove(h.event(sign * 80, 20, 80));
    assert.equal(h.props.x.value, sign * 80);
    assert.equal(h.drag.end({ id: 1, x: sign * 100, y: 25, time: 100 }, false), false);
    h.handlers.onPointerUp(h.event(sign * 100, 25, 100));
    h.handlers.onLostPointerCapture();
    assert.deepEqual(h.events, ['start', sign < 0 ? 'left' : 'right']);
    assert.equal(h.props.locked.value, true);
  });
}
test('vertical intent remains paging; a short horizontal drag cancels without a discard', () => {
  const h = harness();
  h.handlers.onPointerDown(h.event(0,0,0));
  h.handlers.onPointerMove(h.event(15,80,100));
  h.handlers.onPointerUp(h.event(20,100,200));
  assert.deepEqual(h.events, []);
  h.handlers.onPointerDown(h.event(0,0,300));
  h.handlers.onPointerMove(h.event(20,0,500));
  h.handlers.onPointerUp(h.event(20,0,700));
  assert.deepEqual(h.events, ['start','cancel']);
});
