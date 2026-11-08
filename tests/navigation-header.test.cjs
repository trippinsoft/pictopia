const test = require('node:test');
const assert = require('node:assert/strict');
const { makeLoader } = require('./loader.cjs');
function fixture(history = false) {
  const actions = [];
  const router = { canGoBack: () => history, back: () => actions.push('back'), replace: route => actions.push(route), push: route => actions.push(route) };
  const load = makeLoader({
    './recap': { RecapHost: 'RecapHost' },
    'react-native': { View: 'View', Pressable: 'Pressable', ScrollView: 'ScrollView' },
    'expo-router': { router },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '@/components/ui/text': { Text: 'Text' },
    '@/lib/icons/LucideIcon': { __esModule: true, default: 'Icon' },
    './provider': { usePictopia: () => ({ stats: { pending: 7 } }) },
    '@/theming/ThemeProvider': { useTheme: () => ({ theme: {} }) },
  });
  return { actions, load, ...load('components/pictopia/navigation-header.tsx') };
}
function children(element) { return [element?.props?.children].flat().filter(Boolean); }

test('Back uses history when available and a deterministic destination for direct entry', () => {
  const a = fixture(true); a.NavigationBack({ fallback: '/settings' }).props.onPress();
  assert.deepEqual(a.actions, ['back']);
  const b = fixture(false); b.NavigationBack({ fallback: '/settings' }).props.onPress();
  assert.deepEqual(b.actions, ['/settings']);
  const c = fixture(false); c.NavigationBack({}).props.onPress();
  assert.deepEqual(c.actions, ['/(tabs)/home']);
});

test('a custom review exit is invoked once, without adding navigation or finishing activity', () => {
  const a = fixture(true); let exits = 0;
  const button = a.NavigationBack({ onPress: () => exits++, label: 'Back. Your place is saved' });
  button.props.onPress(); assert.equal(exits, 1); assert.deepEqual(a.actions, []);
  assert.equal(button.props.accessibilityRole, 'button');
  assert.equal(button.props.accessibilityLabel, 'Back. Your place is saved');
});

test('secondary headers put Back before the wrapping title, with optional actions in the same row', () => {
  const a = fixture();
  const action = { type: 'Action', props: {} };
  const header = a.ScreenHeader({ title: 'A long album name that must remain fully readable', subtitle: 'Subtitle', action });
  const [row, subtitle] = children(header);
  const [back, title, trailing] = children(row);
  assert.equal(back.type, a.NavigationBack);
  assert.equal(title.props.accessibilityRole, 'header');
  assert.equal(title.props.numberOfLines, undefined);
  assert.equal(title.props.children, 'A long album name that must remain fully readable');
  assert.equal(trailing.props.children, action);
  assert.equal(subtitle.props.children, 'Subtitle');
});

test('Page keeps navigation outside scrolling content and only shows the queue when requested', () => {
  const a = fixture();
  const Page = a.load('components/pictopia/ui.tsx').Page;
  const page = Page({ title: 'A little help', fallback: '/settings', children: 'Help content' });
  const [headerContainer, scroll] = children(page);
  const header = headerContainer.props.children;
  assert.equal(header.type, a.ScreenHeader);
  assert.equal(header.props.fallback, '/settings');
  assert.equal(header.props.showBack, true);
  assert.equal(header.props.action, undefined, 'Help and legal pages have no unrelated trash action');
  assert.equal(scroll.type, 'ScrollView');
  assert.equal(scroll.props.children.props.children, 'Help content');
  const cleanup = Page({ title: 'Review', showQueue: true, children: null });
  const queue = children(cleanup)[0].props.children.props.action;
  queue.props.onPress(); assert.deepEqual(a.actions, ['/queue']);
  const onboarding = Page({ title: 'Welcome', showBack: false, children: null });
  assert.equal(children(onboarding)[0].props.children.props.showBack, false);
});
