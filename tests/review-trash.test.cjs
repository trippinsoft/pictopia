const test = require('node:test');
const assert = require('node:assert/strict');
const { makeLoader } = require('./loader.cjs');
const { ReviewTrash } = makeLoader({
  react: { forwardRef: fn => fn, useEffect: () => {}, useImperativeHandle: () => {}, useRef: value => ({ current: value }), useState: () => [undefined, () => {}] },
  'react-native': { View: 'View', Pressable: 'Pressable' },
  'react-native-reanimated': { __esModule: true, default: { View: 'AnimatedView' }, useSharedValue: value => ({ value }), useReducedMotion: () => true, useAnimatedStyle: fn => fn() },
  './ui': { Text: 'Text', Icon: 'Icon' },
})('components/pictopia/review-trash.tsx');
function visibleText(node) {
  if (!node || typeof node !== 'object') return typeof node === 'string' ? node : '';
  return [node.props?.children].flat().map(visibleText).join(' ');
}
for (const [bytes, unknownSizes, expected] of [[2500000, 0, '2.5 MB'], [1500000000, 0, '1.5 GB'], [2500000, 1, '≥ 2.5 MB'], [0, 2, 'Size unknown'], [0, 0, '0.0 MB']]) {
  test(`trash visibly displays ${expected}, independently of transient additions`, () => {
    let opened = false;
    const tree = ReviewTrash({ count: 2, bytes, unknownSizes, onMeasure() {}, onPress() { opened = true; } }, null);
    assert.equal(visibleText(tree).includes(expected), bytes > 0, 'size must be rendered, not only included in the accessibility label');
    tree.props.onPress(); assert.equal(opened, true);
  });
}
