const test = require('node:test');
const assert = require('node:assert/strict');
const { hooks } = require('./hook-harness.cjs');

const children = node => [node?.props?.children].flat(Infinity).filter(child => child && typeof child === 'object');
function find(node, predicate) {
  return node && (predicate(node) ? node : children(node).map(child => find(child, predicate)).find(Boolean));
}

async function utilities(os, videoCount, { fontScale = 1, resumed = false } = {}) {
  const routes = [];
  const h = hooks('app/(tabs)/explore.tsx', 'default', {
    'expo-router': { router: { push: route => routes.push(route) } },
    'react-native': { Platform: { OS: os }, View: 'View', Pressable: 'Pressable', ScrollView: 'ScrollView', StyleSheet: {}, useWindowDimensions: () => ({ fontScale }) },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '@/components/pictopia/ui': { Button: 'Button', Icon: 'Icon', Loading: 'Loading', Text: 'Text' },
    '@/components/pictopia/provider': { usePictopia: () => ({ ready: true, stats: { total: 13957 }, revision: 1, pro: true }) },
    '@/components/pictopia/playful': { SectionTitle: 'SectionTitle', TabHeader: 'TabHeader', useLift: () => ({}) },
    '@/components/pictopia/album-card': {}, '@/components/pictopia/media-image': {}, '@/components/pictopia/illustration': {},
    '@/components/pictopia/use-local-day': { useLocalDay: () => '2026-11-21' },
    '@/services/adventures': { adventureStore: { choices: async () => ({ screenshots: true }), unfinished: async () => resumed ? [{
      adventure: { kind: 'screenshots' },
      session: { review: true, ids: ['a', 'b'], activeId: 'b', records: { a: { encountered: true } } },
    }] : [] } },
    '@/services/repository': { storage: { count: async () => ({ total: 13957 }), query: async () => [], videoProgress: async () => ({ total: videoCount }) } },
    '@/services/albums': { albumService: { supported: false } },
    '@/services/collections': { RECENTS_LIMIT: 100, collectionStore: { summary: async () => ({ total: 4588 }) } },
    '@/services/lookalikes': { lookalikeStore: { saved: async () => undefined } },
  });
  try {
    h.render();
    await new Promise(resolve => setImmediate(resolve));
    const tree = h.render();
    const grid = find(tree, node => node.props.className === 'gap-3' && children(node).length === 2);
    return { rows: children(grid).map(row => children(row).map(tile => tile.type(tile.props))), routes };
  } finally { h.unmount(); }
}

test('Explore keeps both Utilities rows and their destinations on iOS and Android', async () => {
  for (const os of ['ios', 'android']) {
    const { rows, routes } = await utilities(os, 1135);
    assert.deepEqual(rows.map(row => row.map(card => card.props.accessibilityLabel.split(',')[0])),
      [['Screenshot Sweep', 'Largest videos'], ['Duplicate Hunt', 'All videos']]);
    rows[1].forEach(card => card.props.onPress());
    assert.deepEqual(routes, ['/duplicate-hunt', { pathname: '/collection-review', params: { scope: 'videos' } }]);
    const empty = await utilities(os, 0);
    assert.equal(empty.rows[1][0].type, 'Pressable');
    assert.equal(empty.rows[1][1].type, 'View');
    assert.match(empty.rows[1][1].props.accessibilityLabel, /No videos yet/);
  }
});

test('Utilities keep the same dimensions as counts wrap and the Continue badge appears', async () => {
  const { default: Yoga } = await import('yoga-layout');
  for (const fontScale of [1, 1.7]) {
    const dimensions = [];
    for (const videoCount of [0, 1135]) {
      const { rows } = await utilities('ios', videoCount, { fontScale, resumed: videoCount > 0 });
      const config = Yoga.Config.create();
      config.setPointScaleFactor(3);
      const column = Yoga.Node.create(config);
      column.setGap(Yoga.GUTTER_ROW, 12);
      const nodes = rows.map((cards, i) => {
        const row = Yoga.Node.create(config);
        row.setFlexDirection(Yoga.FLEX_DIRECTION_ROW);
        row.setGap(Yoga.GUTTER_COLUMN, 12);
        column.insertChild(row, i);
        return cards.map((card, j) => {
          const tile = Yoga.Node.create(config);
          const [, style] = card.props.style;
          tile.setFlexGrow(style.flexGrow);
          tile.setFlexBasis(style.flexBasis);
          tile.setMinWidth(style.minWidth);
          row.insertChild(tile, j);
          const [art, copy] = children(children(card)[0]);
          const picture = Yoga.Node.create(config);
          picture.setWidthPercent(parseFloat(art.props.style.width));
          picture.setAspectRatio(art.props.style.aspectRatio);
          picture.setFlexShrink(art.props.style.flexShrink);
          tile.insertChild(picture, 0);
          const text = Yoga.Node.create(config);
          text.setHeight(copy.props.style.height);
          text.setPadding(Yoga.EDGE_VERTICAL, 8);
          text.setPadding(Yoga.EDGE_HORIZONTAL, 12);
          text.setGap(Yoga.GUTTER_ROW, 4);
          const [title, caption] = children(copy);
          assert.equal(children(copy).length, 2);
          assert.equal(text.getHeight().value, 22 + Math.ceil(80 * fontScale));
          assert.equal(title.props.numberOfLines, 2);
          assert.equal(caption.props.numberOfLines, 2);
          assert.equal(caption.props.ellipsizeMode, "tail");
          if (i === 0 && j === 0 && videoCount > 0) {
            assert.match(card.props.accessibilityLabel, /Continue/);
            assert.ok(find(art, node => node.type === "Text" && String(node.props.children).startsWith("Continue")));
          }
          const heights = [46 * fontScale, (videoCount ? 34 : 17) * fontScale];
          const lines = heights.map((height, k) => {
            const line = Yoga.Node.create(config);
            line.setHeight(height);
            text.insertChild(line, k);
            return line;
          });
          tile.insertChild(text, 1);
          return { row, tile, text, lines };
        });
      });
      try {
        column.calculateLayout(284, undefined, Yoga.DIRECTION_LTR);
        const first = nodes[0][0].row, second = nodes[1][0].row;
        assert.ok(second.getComputedTop() >= first.getComputedHeight() + 11.66);
        const tiles = nodes.flat().map(({ tile, text, lines }) => {
          const last = lines.at(-1);
          assert.ok(last.getComputedTop() + last.getComputedHeight() <= text.getComputedHeight() - 7.66);
          assert.ok(text.getComputedTop() + text.getComputedHeight() <= tile.getComputedHeight() + 0.34);
          return [tile.getComputedWidth(), tile.getComputedHeight()];
        });
        for (const tile of tiles) assert.ok(tile.every((value, i) => Math.abs(value - tiles[0][i]) < 0.34));
        dimensions.push(tiles);
      } finally { column.freeRecursive(); config.free(); }
    }
    assert.deepEqual(dimensions[0], dimensions[1]);
  }
});
