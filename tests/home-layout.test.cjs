const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { hooks } = require('./hook-harness.cjs');

// Home once measured its sections with onLayout, stored the heights in state and chose
// 4 pt-stepped gaps from them. A one-pixel change in any measurement could switch every
// gap at once, which re-laid out and re-measured the screen: the native layout bounced
// between two arrangements. Home now hands the gaps to the layout engine as flex spacers.
// These tests run Home's real rendered structure through Yoga (the engine React Native
// uses on iOS/Android) at iPhone pixel density.

const SOURCE = fs.readFileSync(path.join(__dirname, '../components/pictopia/home-content.tsx'), 'utf8');
const features = [{ id: 'a', kind: 'day', hint: '', ids: [] }, { id: 'b', kind: 'detour', hint: '', ids: [] }];
const base = { ready: true, hasPhotos: true, pending: 3, features };

function render(props = base) {
  const h = hooks('components/pictopia/home-content.tsx', 'HomeContent', {
    'react-native': { Platform: { OS: 'ios' }, Pressable: 'Pressable', ScrollView: 'ScrollView', View: 'View' },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    './home-tip': { HomeTip: 'HomeTip' }, './streak-info': { StreakInfo: 'StreakInfo' },
    './adventure-art': { AdventureCover: 'AdventureCover' },
    './ui': { Text: 'Text', Icon: 'Icon', Button: 'Button', Loading: 'Loading' },
    './playful': { TabHeader: 'TabHeader', Postcard: 'Postcard', OrBadge: 'OrBadge', WaitingPill: 'WaitingPill', Sticker: 'Sticker', useLift: () => ({}) },
  }, props);
  try { return h.render(props); } finally { h.unmount(); }
}
const kids = node => [node?.props?.children].flat(Infinity).filter(child => child && typeof child === 'object')
  .flatMap(child => (typeof child.type === 'string' || typeof child.type === 'function') ? [child] : kids(child));
function find(node, predicate) {
  if (!node || typeof node !== 'object') return undefined;
  if (predicate(node)) return node;
  for (const child of kids(node)) { const hit = find(child, predicate); if (hit) return hit; }
}
function walk(node, visit) { if (node && typeof node === 'object') { visit(node); kids(node).forEach(child => walk(child, visit)); } }

/** Home's scroll column as rendered: [{ gap: style } | { section: name }]. */
function column(props) {
  const tree = render(props);
  const scroll = find(tree, n => n.type === 'ScrollView');
  const col = kids(scroll)[0];
  assert.equal(col.props.style.flexGrow, 1, 'the column fills the viewport so spacers can share spare height');
  const names = ['header', 'stats', 'heading', 'adventures', 'note', 'pending'];
  let i = 0;
  return { scroll, items: kids(col).map(child => child.props.style?.flexBasis !== undefined ? { gap: child.props.style } : { section: names[i++] }) };
}

let Yoga;
test.before(async () => { Yoga = (await import('yoga-layout')).default; });

/** Lay out the rendered column at 3× (iPhone) pixel rounding. Section heights are inputs. */
function layout(items, viewport, heights) {
  const config = Yoga.Config.create(); config.setPointScaleFactor(3);
  const scroll = Yoga.Node.create(config); scroll.setWidth(390); scroll.setHeight(viewport);
  const content = Yoga.Node.create(config); content.setFlexGrow(1); content.setFlexShrink(0); content.setPadding(Yoga.EDGE_TOP, 8); // pt-2
  const col = Yoga.Node.create(config); col.setFlexGrow(1); col.setFlexShrink(0);
  scroll.insertChild(content, 0); content.insertChild(col, 0);
  const nodes = items.map((item, i) => {
    const n = Yoga.Node.create(config);
    if (item.gap) { n.setFlexBasis(item.gap.flexBasis); n.setMinHeight(item.gap.minHeight); n.setMaxHeight(item.gap.maxHeight); n.setFlexGrow(item.gap.flexGrow); n.setFlexShrink(item.gap.flexShrink); }
    else { n.setHeight(heights[item.section]); n.setFlexShrink(0); }
    col.insertChild(n, i);
    return n;
  });
  scroll.calculateLayout(390, viewport, Yoga.DIRECTION_LTR);
  const result = items.map((item, i) => ({ ...item, top: nodes[i].getComputedTop() + 8, height: nodes[i].getComputedHeight() }));
  scroll.freeRecursive(); config.free();
  return result;
}
const sections = (rows) => Object.fromEntries(rows.filter(r => r.section).map(r => [r.section, r]));
const gaps = (rows) => rows.filter(r => r.gap).map(r => r.height);
// Fractional heights, like real text and rotated-card sections on a 3× screen.
const phone = { header: 76.33, stats: 118.67, heading: 41.33, adventures: 301.67, note: 66, pending: 48 };

test('Home has no layout measurement, layout state or adaptive-spacing state', () => {
  assert.doesNotMatch(SOURCE, /onLayout|useState|LayoutChangeEvent|homeSpacing|useWindowDimensions/);
  walk(render(), node => assert.equal(node.props?.onLayout, undefined, `${node.type} must not measure layout`));
  for (const props of [base, { ...base, pending: 0 }, { ...base, features: undefined }, { ...base, ready: false }, { ...base, hasPhotos: false }]) {
    assert.deepEqual(JSON.stringify(render(props)), JSON.stringify(render(props)), 'the same props always render the same tree');
  }
});

test('section order and gaps match the Home design', () => {
  const { items } = column(base);
  assert.deepEqual(items.map(r => r.section ?? 'gap'), ['header', 'gap', 'stats', 'gap', 'heading', 'gap', 'adventures', 'gap', 'note', 'gap', 'pending', 'gap']);
  assert.deepEqual(column({ ...base, pending: 0 }).items.map(r => r.section ?? 'gap'), ['header', 'gap', 'stats', 'gap', 'heading', 'gap', 'adventures', 'gap', 'note', 'gap']);
});

test('roomy gaps when everything fits, compressed when tight, minimums and scrolling when short', () => {
  const { items } = column(base);
  const roomy = [48, 64, 40, 76, 48, 32], compact = [12, 20, 16, 20, 16, 16];
  assert.deepEqual(gaps(layout(items, 1000, phone)).map(gap => Math.round(gap * 3) / 3), roomy, 'roomy rhythm on tall screens');
  const tight = layout(items, 760, phone), pill = sections(tight).pending;
  assert.ok(pill.top + pill.height <= 760, 'a near-fitting iPhone shows the whole Discarded pill');
  assert.ok(gaps(tight).every((g, i) => g >= compact[i] && g <= roomy[i]));
  assert.ok(gaps(tight).some((g, i) => g < roomy[i]), 'gaps compress');
  const short = layout(items, 560, phone), last = short.at(-1);
  assert.deepEqual(gaps(short), compact, 'compact minimums on short screens / large text');
  assert.ok(last.top + last.height > 560, 'content overflows into normal scrolling instead of being squeezed');
});

test('a tall iPhone with an empty queue spreads spare height between Home sections', () => {
  const { items } = column({ ...base, pending: 0 });
  const tall = layout(items, 840, phone);
  assert.ok(gaps(tall).slice(0, -1).every((gap, i) => gap > [20, 28, 24, 32][i]));
  const note = sections(tall).note;
  assert.ok(840 - (note.top + note.height) <= 40, 'the tip sits close to the bottom of the usable viewport');
});

test('a one-pixel change in any section moves nothing by more than that pixel', () => {
  const { items } = column(base);
  for (const viewport of [568, 667, 736, 760, 812, 844, 852, 874, 896, 932, 956]) {
    for (let content = 0; content <= 160; content += 1 / 3) {
      for (const section of ['header', 'stats', 'heading', 'adventures', 'note']) {
        const heights = { ...phone, adventures: phone.adventures + content };
        const a = layout(items, viewport, heights);
        const b = layout(items, viewport, { ...heights, [section]: heights[section] + 1 / 3 });
        a.forEach((row, i) => {
          const moved = Math.abs(b[i].top - row.top);
          if (row.section === 'header') assert.equal(moved, 0, 'the header never moves');
          // Float32 layout: one 3x pixel is 0.3333 pt, give or take float rounding.
          else assert.ok(moved <= 1 / 3 + 1e-3, `${row.section ?? 'gap'} moved ${moved} pt after a 1 px change in ${section} (viewport ${viewport})`);
        });
      }
    }
  }
});

test('layout is a pure function of content: recomputing, returning to Home and data refreshes give identical positions', () => {
  const { items } = column(base);
  for (const viewport of [667, 760, 852, 932]) {
    const first = layout(items, viewport, phone);
    for (let i = 0; i < 5; i++) assert.deepEqual(layout(column(base).items, viewport, phone), first);
  }
});

test('the old measured spacing is gone for good', () => {
  const spacing = fs.readFileSync(path.join(__dirname, '../lib/pictopia/home-spacing.ts'), 'utf8');
  assert.doesNotMatch(spacing, /Math\.floor|viewport|intrinsic/);
});
