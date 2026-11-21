const test = require("node:test");
const assert = require("node:assert/strict");
const { makeLoader } = require("./loader.cjs");

const load = makeLoader();
const { matchMosaicPhotos } = load("lib/pictopia/mosaic-match.ts");
const { mosaicScenes, mosaicColumns, mosaicRows } = load("lib/pictopia/mosaic-scenes.ts");
const size = mosaicColumns * mosaicRows;
const pause = async () => {};

test("four equally sized, distinct target rasters and a real color-based winner", async () => {
  assert.equal(mosaicScenes.length, 4);
  for (const scene of mosaicScenes) {
    assert.equal(scene.targets.length, size);
    assert.ok(new Set(scene.targets.map(rgb => rgb.join(","))).size > 20);
  }
  assert.equal(new Set(mosaicScenes.map(scene => JSON.stringify(scene.targets))).size, 4);

  for (const [index, scene] of mosaicScenes.entries()) {
    const matching = scene.targets.map((rgb, i) => ({ id: String(i), rgb }));
    const result = await matchMosaicPhotos(matching, pause);
    assert.equal(result.best, index);
    assert.ok(result.scenes[index].score > 99.999);
    assert.equal(result.scenes[index].unique, size);
    assert.ok(result.scenes.every(match => match.score > 0 && match.score <= 100));
  }
});

test("nearby repeats are discouraged and scarce libraries still fill every tile", async () => {
  const photos = Array.from({ length: 35 }, (_, i) => ({ id: String(i), rgb: [112, 112, 112] }));
  const { scenes } = await matchMosaicPhotos(photos, pause);
  for (const { unique, tiles, score } of scenes) {
    assert.equal(unique, photos.length);
    assert.equal(tiles.length, size);
    assert.ok(score < 90);
    for (let i = 0; i < size; i++) {
      if (i % mosaicColumns) assert.notEqual(tiles[i], tiles[i - 1]);
      if (i >= mosaicColumns) assert.notEqual(tiles[i], tiles[i - mosaicColumns]);
    }
  }
  const single = await matchMosaicPhotos([photos[0]], pause);
  assert.ok(single.scenes.every(scene => scene.unique === 1 && scene.tiles.every(i => i === 0)));
  await assert.rejects(matchMosaicPhotos([], pause), /No local thumbnails/);
});

test("all sample sizes produce complete, valid photo placements", async t => {
  // Numerical palette fixture only. These measurements exercise the matcher in Node
  // and exclude PhotoKit, decoding, rendering, native memory, and visual quality.
  let seed = 0x12345678;
  function channel() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed >>> 24;
  }
  const photos = Array.from({ length: 15_000 }, (_, i) => ({
    id: String(i), rgb: [channel(), channel(), channel()],
  }));
  for (const count of [500, 1000, 5000, 10000, 15000]) {
    const start = performance.now();
    const { scenes, best } = await matchMosaicPhotos(photos.slice(0, count), pause);
    t.diagnostic(`${count.toLocaleString()} candidate RGB profiles: ${Math.round(performance.now() - start)} ms`);
    assert.equal(scenes[best].score, Math.max(...scenes.map(scene => scene.score)));
    for (const scene of scenes) {
      assert.equal(scene.tiles.length, size);
      assert.equal(scene.unique, new Set(scene.tiles).size);
      assert.ok(scene.tiles.every(i => Number.isInteger(i) && i >= 0 && i < count));
    }
  }
});

test("scene matching can stop between checkpoints", async () => {
  const seen = [];
  await assert.rejects(matchMosaicPhotos([{ id: "only", rgb: [210, 206, 200] }], async index => {
    seen.push(index);
    if (index === 1) throw Error("Canceled");
  }), /Canceled/);
  assert.deepEqual(seen, [0, 1]);
});
