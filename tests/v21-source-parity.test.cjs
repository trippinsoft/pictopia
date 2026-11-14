const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { createHash } = require("node:crypto");
// Hashes taken from the app-version 1.0.21 snapshot 30952df; the flight path, the card's
// release handoff and the flying photograph were deliberately re-tuned afterwards so a discard
// flows into the trash without a pause (the card rides the same curve until the copy takes over).
// A review discard then scrolls the pager on to the next photo instead of sliding a card into
// the emptied slot, so the next photo always visibly scrolls in; the native pager glides that
// scroll on the UI thread at a shared, readable pace (`lib/pictopia/glide.ts`).
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
    "sha256": "bd4b71cda2ea306a63638b1a9293b19c9dcb9e13af886c15cd4ae08f191c3260"
  },
  {
    "file": "lib/pictopia/flight-math.ts",
    "start": null,
    "end": null,
    "sha256": "e8bb936fc28d144d2beda8dcd5d2061a4db9b16900ebf5117b23789ede455558"
  },
  {
    "file": "components/pictopia/explore-card.tsx",
    "start": "    const cancel =",
    "end": "    // Moving to another photo",
    "sha256": "c32e1e5a4db428a47a42e89c2bfe0cd84935263c9f130efac80ef4c4f476c18d"
  },
  {
    "file": "components/pictopia/discard-flight.tsx",
    "start": "function FlyingPhoto(",
    "end": "  return (\n    <Animated.View",
    "sha256": "55d90dd6860a93290f922daf4100bc1766a0b80d4e347aebc1ac5264162c47f9"
  },
  {
    "file": "lib/pictopia/explore-feed-controller.ts",
    "start": "  private async discardInReview",
    "end": "  private isLastLive",
    "sha256": "15313d7ccc529890d40a80d70bc218685435e0253df82505b2cb494232d6bebb"
  }
];
for (const entry of originals) test(`1.0.21 source parity: ${entry.file}`, () => {
  const source = fs.readFileSync(entry.file, "utf8");
  const block = entry.start === null ? source : source.slice(source.indexOf(entry.start), source.indexOf(entry.end, source.indexOf(entry.start)));
  assert.equal(createHash("sha256").update(block).digest("hex"), entry.sha256);
});
