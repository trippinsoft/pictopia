const test = require('node:test');
const assert = require('node:assert/strict');
const { makeLoader } = require('./loader.cjs');
const { HOME_GAPS, homeGap } = makeLoader()('lib/pictopia/home-spacing.ts');

test('each Home gap starts at its compact minimum and grows at most to its roomy size', () => {
  for (const key of Object.keys(HOME_GAPS.roomy)) {
    const style = homeGap(key), roomy = HOME_GAPS.roomy[key], compact = HOME_GAPS.compact[key];
    assert.equal(style.flexBasis, compact); assert.equal(style.minHeight, compact); assert.equal(style.maxHeight, roomy);
    assert.equal(style.flexGrow, roomy - compact, 'gaps share spare height in proportion to their range');
    assert.equal(style.flexShrink, 0, 'gaps never collapse below the minimum');
    assert.ok(compact > 0 && compact < roomy && roomy % 4 === 0 && compact % 4 === 0);
  }
});

test('gap styles are stable objects', () => {
  for (const key of Object.keys(HOME_GAPS.roomy)) assert.equal(homeGap(key), homeGap(key));
});
