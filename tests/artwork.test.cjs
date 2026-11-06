const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { makeLoader } = require('./loader.cjs');

function artwork(theme) {
  const svg = { __esModule: true, default: 'Svg' };
  for (const name of ['Circle','Defs','Ellipse','G','Line','Path','Pattern','Polygon','Rect']) svg[name] = name;
  return makeLoader({
    react: { memo: component => component },
    'react-native': { View: 'View' },
    'react-native-svg': svg,
    '@/theming/ThemeProvider': { useTheme: () => ({ theme: { name: theme } }) },
  });
}

test('all adventure/catalog covers, completion headers and games use existing designed SVG scenes', () => {
  for (const theme of ['light','dark']) {
    const load = artwork(theme);
    const { AdventureCover, AdventureHeader, ART_THEMES } = load('components/pictopia/adventure-art.tsx');
    const { Illustration } = load('components/pictopia/illustration.tsx');
    for (const kind of ['year','month','day','screenshots','detour','capsule','corners','pitstop','random', undefined]) {
      const cover = AdventureCover({ kind, ids: ['real-photo-id'] });
      assert.equal(cover.type, Illustration);
      assert.equal(Illustration(cover.props).type, 'Svg');
      const header = AdventureHeader({ kind, ids: ['real-photo-id'] });
      assert.equal(header.props.children.type, Illustration);
      assert.equal(Illustration(header.props.children.props).type, 'Svg');
    }
    for (const entry of load('lib/pictopia/catalog.ts').CATALOG) {
      assert.equal(Illustration({ name: ART_THEMES[entry.art] }).type, 'Svg', entry.name);
    }
    for (const name of ['guessYear','whereWasThis','whichFirst','memoryMatch']) {
      assert.equal(Illustration({ name, square: true }).type, 'Svg');
    }
  }
});

test('decorative artwork never reintroduces scene bitmaps or samples personal photos', () => {
  for (const file of ['adventure-art.tsx','playful.tsx','pit-stop-menu.tsx']) {
    const source = fs.readFileSync(`components/pictopia/${file}`, 'utf8');
    assert.doesNotMatch(source, /assets\/images\/(adventures|pit-stops)\//, file);
  }
  for (const file of ['adventure-art.tsx','pit-stop-menu.tsx']) {
    const source = fs.readFileSync(`components/pictopia/${file}`, 'utf8');
    assert.doesNotMatch(source, /mediaService|storage\.get|pitStopStore\.sample|PersonalPhotos/, file);
  }
});
