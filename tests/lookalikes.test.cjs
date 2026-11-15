const test = require("node:test");
const assert = require("node:assert/strict");
const { makeLoader } = require("./loader.cjs");
const L = makeLoader()("lib/pictopia/lookalikes.ts");

// A deterministic textured 32×32 picture; `seed` changes the scene, `noise` nudges pixels.
function picture(seed, noise = 0) {
  const gray = [];
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      const base = 128 + 60 * Math.sin((x + seed * 3) / (2 + (seed % 5))) * Math.cos((y * (seed % 3 + 1)) / 3);
      const jitter = noise ? noise * Math.sin(x * 12.9898 + y * 78.233 + seed) : 0;
      gray.push(base + jitter);
    }
  return gray;
}
const minute = 60_000;
const item = (id, created, gray, extra = {}) => ({ id, created, width: 4032, height: 3024, ...L.lookalikePrint(gray), ...extra });

test("prints are 256 bits and stable", () => {
  const p = L.lookalikePrint(picture(1));
  assert.equal(p.print.length, 64);
  assert.match(p.print, /^[0-9a-f]+$/);
  assert.equal(L.lookalikePrint(picture(1)).print, p.print);
  assert.equal(L.printDistance(p.print, p.print), 0);
  assert.ok(L.printDistance(p.print, L.lookalikePrint(picture(7)).print) > L.SIMILAR_DISTANCE, "different scenes are far apart");
});

test("flat pictures are never matched", () => {
  const flat = Array(1024).fill(10);
  assert.equal(L.informative(L.lookalikePrint(flat).print), false);
  const groups = L.groupLookalikes([item("a", 0, flat), item("b", minute, flat)]);
  assert.deepEqual(groups, []);
});

test("similar shots group only when taken close together; copies group at any time", () => {
  const groups = L.groupLookalikes([
    item("a1", 0, picture(2)),
    item("a2", 30_000, picture(2, 6)),
    item("far", 400 * 24 * 60 * minute, picture(2, 6)),
    item("other", 60_000, picture(9)),
    item("copy1", 5 * minute, picture(4)),
    item("copy2", 900 * 24 * 60 * minute, picture(4)),
  ]);
  const sets = groups.map(g => [...g.ids].sort().join(","));
  assert.ok(sets.includes("copy1,copy2"), "an exact copy months later still groups");
  assert.equal(groups.find(g => g.ids.includes("copy1")).kind, "copies");
  const a = groups.find(g => g.ids.includes("a1"));
  assert.ok(a && a.ids.includes("a2"));
  assert.ok(!groups.some(g => g.ids.includes("other")), "a different scene stays out");
});

test("a different shape never groups, groups are newest first and carry a suggested keeper", () => {
  const groups = L.groupLookalikes([
    item("w", 0, picture(3)),
    item("t", 10_000, picture(3), { width: 3024, height: 4032 }),
    item("n1", 100 * minute * 60, picture(5)),
    item("n2", 100 * minute * 60 + 5000, picture(5), { favorite: true }),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].best, "n2", "a favorite is the suggestion");
  assert.deepEqual(groups[0].ids, ["n1", "n2"], "oldest first inside a set");
});

test("long bursts split into sets no bigger than the limit", () => {
  const burst = Array.from({ length: L.GROUP_LIMIT * 2 + 1 }, (_, i) => item(`b${i}`, i * 1000, picture(6)));
  const groups = L.groupLookalikes(burst);
  assert.equal(groups.reduce((n, g) => n + g.ids.length, 0), burst.length);
  assert.ok(groups.every(g => g.ids.length >= 2 && g.ids.length <= L.GROUP_LIMIT + 1));
});
