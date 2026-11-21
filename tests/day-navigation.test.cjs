const test = require('node:test');
const assert = require('node:assert/strict');
const { hooks, textOf } = require('./hook-harness.cjs');
const { makeLoader } = require('./loader.cjs');
const { localDate, addDays } = makeLoader()('lib/pictopia/daily.ts');
const today = localDate(Date.now());
const dates = Array.from({ length: 8 }, (_, i) => ({ date: addDays(today, -i), count: i === 2 ? 0 : 3 }));
const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture({ pro = true, choose } = {}) {
  const calls = [], pushes = [];
  const app = { ready: true, pro };
  const h = hooks('app/on-this-day.tsx', 'default', {
    'react-native': { View: 'View', Platform: { OS: 'web' } },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    'expo-router': { Stack: { Screen: 'Screen' }, router: { push: value => pushes.push(value) } },
    'expo-status-bar': { StatusBar: 'StatusBar' },
    '@/components/pictopia/provider': { usePictopia: () => app },
    '@/components/pictopia/adventure-review': { AdventureReview: 'AdventureReview', ProgressLine: 'ProgressLine' },
    '@/components/pictopia/review-trash': { ReviewTrash: 'ReviewTrash' },
    '@/components/pictopia/adventure-theme': { AdventureTheme: 'AdventureTheme' },
    '@/components/pictopia/navigation-header': { NavigationBack: 'NavigationBack' },
    '@/components/pictopia/day-selector': { DaySelector: 'DaySelector' },
    '@/components/pictopia/ui': { Button: 'Button', Loading: 'Loading', Text: 'Text' },
    '@/services/adventures': { adventureStore: {
      history: async () => dates,
      choose: async (choice, seed, entitled) => { calls.push(['choose', choice.date, entitled]); return choose ? choose(choice) : { id: choice.date }; },
      open: async (id, entitled) => calls.push(['open', id, entitled]),
    } },
  });
  return { h, calls, pushes, app };
}
function find(node, type) {
  if (!node || typeof node !== 'object') return;
  if (node.type === type) return node;
  for (const child of [node.props?.children].flat(Infinity)) { const found = find(child, type); if (found) return found; }
}
test('On This Day opens today automatically, then switches saved reviewers in place after flushing', async () => {
  const f = fixture();
  try {
    f.h.render(); await tick();
    let review = f.h.render();
    assert.equal(review.type, 'AdventureReview');
    assert.equal(review.props.id, today);
    assert.deepEqual(f.calls, [['choose', today, true], ['open', today, true]]);
    let flushed = 0;
    let selector = find(review.props.dateNavigation({ disabled: false, flush: () => flushed++ }), 'DaySelector');
    assert.equal(selector.props.dates.length, 7);
    assert.equal(selector.props.dates[6].date, addDays(today, -6));
    selector.props.onSelect(dates[1].date); await tick();
    review = f.h.render();
    assert.equal(flushed, 1);
    assert.equal(review.props.id, dates[1].date);
    assert.deepEqual(f.pushes, [], 'date changes do not push another screen');
    selector = find(review.props.dateNavigation({ disabled: true, flush() {} }), 'DaySelector');
    assert.equal(selector.props.disabled, true, 'flight/save disables date switches');
    selector = find(review.props.dateNavigation({ disabled: false, flush: () => flushed++ }), 'DaySelector');
    selector.props.onSelect(dates[1].date);
    assert.equal(flushed, 1, 'selected date is a no-op');
    selector.props.onSelect(today); await tick();
    assert.equal(f.h.render().props.id, today, 'returning uses the original saved session ID');
  } finally { f.h.unmount(); }
});
test('Free opens today directly and retains the existing past-date paywall', async () => {
  const f = fixture({ pro: false });
  try {
    f.h.render(); await tick();
    const review = f.h.render();
    const selector = find(review.props.dateNavigation({ disabled: false, flush() {} }), 'DaySelector');
    selector.props.onSelect(dates[1].date); await tick();
  assert.deepEqual(f.pushes, [{ pathname: '/paywall', params: { entry: 'Adventure' } }]);
    assert.equal(f.calls.length, 2, 'locked dates never open or create a review');
    assert.equal(f.h.render().props.id, today);
  } finally { f.h.unmount(); }
});
test('empty days keep date navigation available; failures offer a retry', async () => {
  let failing = false;
  const f = fixture({ choose: () => { if (failing) throw Error('disk'); return undefined; } });
  try {
    f.h.render(); await tick();
    let tree = f.h.render();
    assert.match(textOf(tree), /No memories on this date/);
    assert.match(textOf(tree), /0 of 0/);
    assert.ok(find(tree, 'ReviewTrash'));
    assert.ok(find(tree, 'ProgressLine'));
    let selector = find(tree, 'DaySelector');
    assert.equal(selector.props.disabled, false);
    failing = true; selector.props.onSelect(dates[1].date); await tick();
    tree = f.h.render();
    assert.match(textOf(tree), /These memories couldn’t open/);
    failing = false; find(tree, 'Button').props.onPress(); await tick();
    assert.match(textOf(f.h.render()), /No memories on this date/);
  } finally { f.h.unmount(); }
});
test('calendar tabs announce selection, empty dates and disabled transitions', () => {
  const { DaySelector } = makeLoader({ 'react-native': { View: 'View', ScrollView: 'ScrollView', Pressable: 'Pressable' }, './ui': { Icon: 'Icon', Text: 'Text' } })('components/pictopia/day-selector.tsx');
  const tree = DaySelector({ dates: dates.slice(0, 7), selected: today, pro: true, disabled: true, onSelect() {} });
  const tabs = find(tree, 'ScrollView').props.children;
  assert.equal(tabs.length, 7);
  assert.equal(tabs[6].props.accessibilityState.selected, true);
  assert.match(tabs[6].props.accessibilityLabel, /^Today, /);
  assert.equal(tabs[0].key, dates[6].date);
  assert.match(tabs[4].props.accessibilityLabel, /no photos or videos/);
  assert.equal(textOf(find(tabs[4], 'Text')), new Date(`${dates[2].date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
  assert.match(find(tree, 'ScrollView').props.contentContainerClassName, /justify-center/);
  for (const tab of tabs) assert.equal(find(tab, 'Text').props.numberOfLines, 1);
  assert.ok(tabs.every(tab => tab.props.disabled));
  assert.ok(tabs.every(tab => !find(tab, 'Icon') && !tab.props.accessibilityLabel.includes('Pictopia+')));
  const selected = [];
  const free = DaySelector({ dates: dates.slice(0, 7), selected: today, pro: false, onSelect: date => selected.push(date) });
  const freeTabs = find(free, 'ScrollView').props.children;
  for (const tab of freeTabs.slice(0, -1)) {
    assert.equal(find(tab, 'Icon').props.name, 'LockKeyhole');
    assert.match(tab.props.accessibilityLabel, /requires Pictopia\+/);
  }
  assert.equal(find(freeTabs[6], 'Icon'), undefined);
  freeTabs[4].props.onPress();
  assert.deepEqual(selected, [dates[2].date], 'locked dates remain tappable, even when empty');
});
