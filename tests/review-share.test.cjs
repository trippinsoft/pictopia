const test = require('node:test');
const assert = require('node:assert/strict');
const { hooks, textOf } = require('./hook-harness.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
function buttons(node) {
  if (!node || typeof node !== 'object') return [];
  return [...(node.type === 'Pressable' ? [node] : []), ...[node.props?.children].flat(Infinity).flatMap(buttons)];
}
function setup() {
  const pending = [], calls = { cancelled: 0, used: 0 };
  const h = hooks('components/pictopia/review-actions.tsx', 'ReviewActions', {
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'react-native': { Platform: { OS: 'ios' }, Pressable: 'Pressable', View: 'View', AppState: { addEventListener: () => ({ remove() {} }) } },
    './ui': { Text: 'Text', Icon: 'Icon' },
    '@/theming/ThemeProvider': { useTheme: () => ({ theme: { colors: { destructive: 'red' } } }) },
    '@/services/review-media': { reviewMedia: {
      favorite: async () => ({ supported: true, value: false }),
      share: () => new Promise((resolve, reject) => pending.push({ resolve, reject })),
      cancelShare: () => { calls.cancelled++; },
    } },
  }, { media: { id: 'a', modified: 1 }, disabled: false, queued: false, legacy: false, highlighted: false, onRestore() {}, onUsed() { calls.used++; } });
  h.render();
  return { h, pending, calls, share: tree => buttons(tree).find(b => b.props.accessibilityLabel?.toLowerCase().includes('shar')) };
}
test('sharing blocks rapid repeat taps and shows progress until the native sheet settles', async () => {
  const { h, pending, calls, share } = setup();
  const button = share(h.render());
  button.props.onPress(); button.props.onPress();
  assert.equal(pending.length, 1);
  let tree = h.render();
  assert.match(textOf(tree), /Preparing original for sharing/);
  assert.equal(share(tree).props.disabled, true);
  assert.equal(share(tree).props.accessibilityState.busy, true);
  pending[0].resolve(); await tick(); tree = h.render();
  assert.equal(share(tree).props.disabled, false);
  assert.doesNotMatch(textOf(tree), /Preparing original/);
  assert.equal(calls.used, 1);
  share(tree).props.onPress(); assert.equal(pending.length, 2);
  pending[1].resolve(); await tick(); h.unmount();
});
test('a native sharing failure clears busy state and permits another attempt', async () => {
  const { h, pending, share } = setup();
  share(h.render()).props.onPress();
  pending[0].reject(Error('The share sheet couldn’t open. Please try again.'));
  await tick(); const tree = h.render();
  assert.match(textOf(tree), /share sheet couldn’t open/);
  assert.equal(share(tree).props.disabled, false);
  share(tree).props.onPress(); assert.equal(pending.length, 2);
  pending[1].resolve(); await tick(); h.unmount();
});
test('leaving review cancels sharing and ignores late completion', async () => {
  const { h, pending, calls, share } = setup();
  share(h.render()).props.onPress(); h.unmount();
  assert.equal(calls.cancelled, 1);
  pending[0].resolve(); await tick();
  assert.equal(calls.used, 0);
});
