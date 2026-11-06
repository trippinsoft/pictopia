// Playful Adventure themes: the approved ten pastels, saved per person, never touching artwork,
// text or accent tokens.
const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync, platform, boot } = require("./native-harness.cjs");
const { makeLoader } = require("./loader.cjs");
const load = makeLoader({ "react-native": { Platform: { OS: "ios" }, View: "View" }, nativewind: { vars: (v) => v } });
const { PASTELS, pastel, isPastel } = load("theming/pastels.ts");
const light = load("theming/themes/light.ts").default;

test("exactly the ten approved themes, in order", () => {
  assert.deepEqual(PASTELS.map((p) => p.name), ["Sky", "Periwinkle", "Lavender", "Lilac", "Blush", "Peach", "Butter", "Mint", "Stone", "Cloud"]);
  assert.equal(new Set(PASTELS.map((p) => p.id)).size, 10);
  assert.equal(pastel("nonsense").id, "sky", "an unknown saved value falls back to Sky");
  assert.equal(isPastel("butter"), true);
  assert.equal(isPastel("purple"), false);
});

test("a theme changes only the background and its shadow tint", () => {
  const { withPastel } = load("theming/pastels.ts");
  const sky = withPastel(light, "sky");
  const butter = withPastel(light, "butter");
  const changed = Object.keys(sky.colors).filter((k) => sky.colors[k] !== butter.colors[k]).sort();
  assert.deepEqual(changed, ["background", "border", "input", "tint"]);
  assert.deepEqual(butter.typography, sky.typography);
});

test("the chosen theme is saved and survives a restart; older installs default to Sky", async () => {
  const db = new DatabaseSync(":memory:");
  let app = await boot(db, platform());
  assert.equal((await app.repository.preferences()).theme, "sky");
  await app.storage.setValue("preferences", { ...(await app.repository.preferences()), theme: "mint" });
  app = await boot(db, platform());
  assert.equal((await app.repository.preferences()).theme, "mint");
  await app.storage.setValue("preferences", { appearance: "dark", haptics: false });
  assert.equal((await app.repository.preferences()).theme, "sky", "saved preferences without a theme keep their other values and get Sky");
  assert.equal((await app.repository.preferences()).haptics, false);
});
