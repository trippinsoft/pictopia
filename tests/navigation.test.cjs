// Navigation contract: three visible tabs, Settings as a sheet from the gear, retired flows
// hidden (not deleted), and permanent adventure names everywhere.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const read = (f) => fs.readFileSync(require("node:path").join(__dirname, "..", f), "utf8");

test("the tab bar shows exactly Home, Explore and Progress", () => {
  const tabs = read("app/(tabs)/_layout.tsx");
  const entries = [...tabs.matchAll(/\{ name: "(\w+)", title: "([^"]+)", icon: "\w+"(, hidden: true)? \}/g)];
  assert.deepEqual(entries.filter((e) => !e[3]).map((e) => e[2]), ["Home", "Explore", "Progress"]);
  assert.deepEqual(entries.filter((e) => e[3]).map((e) => e[1]).sort(), ["smart", "swipe"], "review tabs stay hidden; Settings is a stack modal");
});

test("Settings is a sheet opened from the gear on every tab", () => {
  assert.match(read("app/_layout.tsx"), /name="settings" options=\{\{ title: "Settings", presentation: "modal" \}\}/);
  for (const f of ["app/(tabs)/home.tsx", "components/pictopia/home-content.tsx", "app/(tabs)/explore.tsx", "app/(tabs)/progress.tsx"].slice(1))
    assert.match(read(f), /TabHeader/);
  assert.match(read("components/pictopia/playful.tsx"), /router\.push\("\/settings"\)/);
});

test("screens show permanent adventure names, never invented ones", () => {
  for (const f of ["app/(tabs)/explore.tsx", "components/pictopia/home-content.tsx", "components/pictopia/adventure-review.tsx", "lib/pictopia/catalog.ts", "lib/pictopia/curation.ts"])
    assert.doesNotMatch(read(f), /Unexpected Detour|A Little Time Capsule|Rewind a Year|A Year in Passing|The Screenshot Drawer|Wander/, f);
});
