const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { createHash } = require("node:crypto");
// Hashes taken directly from the app-version 1.0.21 snapshot 30952df.
// Media safety, allowance and persistence adapters are intentionally outside these blocks.
const originals = [
  {
    "file": "components/pictopia/explore-gesture.native.tsx",
    "start": null,
    "end": null,
    "sha256": "8cf9b2d3698000b43b39fb5bf5be522fa70e43d23821d374182a9fdb2c249009"
  },
  {
    "file": "components/pictopia/explore-pager.native.tsx",
    "start": null,
    "end": null,
    "sha256": "dda4c8913aba3faf0f1860d2ac91253ebd077560abe8259320c2ce0585b02b2e"
  },
  {
    "file": "lib/pictopia/flight-math.ts",
    "start": null,
    "end": null,
    "sha256": "39a0ca1e7e9a68c8ffc0d0558653c32f8216c146890e0d8675e2636364f0b487"
  },
  {
    "file": "components/pictopia/explore-card.tsx",
    "start": "    const cancel =",
    "end": "    // Moving to another photo",
    "sha256": "a499c079697c9db8eefa1cc05d77f6d1c27a5e5c464483e592904681923670f8"
  },
  {
    "file": "components/pictopia/discard-flight.tsx",
    "start": "  const begin = useCallback",
    "end": "  return (\n    <Animated.View",
    "sha256": "57ed261b3990ebab9a6e3e894b85f7c1902fd917012efb44292c9c3a2281d72c"
  },
  {
    "file": "lib/pictopia/explore-feed-controller.ts",
    "start": "  private async discardInReview",
    "end": "  private isLastLive",
    "sha256": "e21c0987a044de30c851ca28d950c732c8fadbc4bdd9ac371610b505b3970c54"
  }
];
for (const entry of originals) test(`1.0.21 source parity: ${entry.file}`, () => {
  const source = fs.readFileSync(entry.file, "utf8");
  const block = entry.start === null ? source : source.slice(source.indexOf(entry.start), source.indexOf(entry.end, source.indexOf(entry.start)));
  assert.equal(createHash("sha256").update(block).digest("hex"), entry.sha256);
});
