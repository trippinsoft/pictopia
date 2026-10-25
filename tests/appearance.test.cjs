const test = require("node:test");
const assert = require("node:assert/strict");
const { makeLoader } = require("./loader.cjs");
function browserHarness(cache = new Map()) {
  const originals = {};
  for (const key of ["document", "matchMedia", "MutationObserver", "localStorage"])
    originals[key] = Object.getOwnPropertyDescriptor(globalThis, key);
  const observers = new Set(),
    listeners = new Set(),
    attrs = new Map();
  const root = {
    style: {},
    classList: { toggle() {} },
    getAttribute: (key) => attrs.get(key) ?? null,
    setAttribute(key, value) {
      attrs.set(key, value);
      for (const fn of observers) fn([{ attributeName: key }]);
    },
    removeAttribute(key) {
      attrs.delete(key);
      for (const fn of observers) fn([{ attributeName: key }]);
    },
  };
  const system = {
    matches: false,
    addEventListener: (_, fn) => listeners.add(fn),
    removeEventListener: (_, fn) => listeners.delete(fn),
  };
  globalThis.document = { documentElement: root };
  globalThis.matchMedia = () => system;
  globalThis.localStorage = {
    getItem: (key) => cache.get(key) ?? null,
    setItem: (key, v) => cache.set(key, v),
    removeItem: (key) => cache.delete(key),
  };
  globalThis.MutationObserver = class {
    constructor(fn) {
      this.fn = fn;
    }
    observe() {
      observers.add(this.fn);
    }
    disconnect() {
      observers.delete(this.fn);
    }
  };
  const Appearance = {};
  const load = () =>
    makeLoader({ "react-native": { Appearance, Platform: { OS: "web" } } })(
      "appearance-polyfill.ts",
    );
  return {
    Appearance,
    root,
    system,
    cache,
    load,
    change(dark) {
      system.matches = dark;
      for (const fn of listeners) fn({ matches: dark });
    },
    restore() {
      for (const [key, d] of Object.entries(originals))
        if (d) Object.defineProperty(globalThis, key, d);
        else delete globalThis[key];
    },
  };
}
test("System appearance releases overrides, follows changes and keeps explicit modes stable", () => {
  const h = browserHarness();
  try {
    h.load();
    const changes = [];
    const sub = h.Appearance.addChangeListener((e) => changes.push(e.colorScheme));
    assert.equal(h.Appearance.getColorScheme(), "light");
    h.change(true);
    assert.equal(h.Appearance.getColorScheme(), "dark");
    assert.equal(changes.at(-1), "dark");
    h.Appearance.setColorScheme("light");
    h.change(true);
    assert.equal(h.Appearance.getColorScheme(), "light");
    h.Appearance.setColorScheme("unspecified");
    assert.equal(h.Appearance.getColorScheme(), "dark");
    assert.equal(h.root.getAttribute("data-theme"), null);
    assert.equal(h.cache.has("pictopia.appearance"), false);
    h.change(false);
    assert.equal(h.Appearance.getColorScheme(), "light");
    const count = changes.length;
    sub.remove();
    h.change(true);
    assert.equal(changes.length, count);
  } finally {
    h.restore();
  }
});
test("Persisted appearance bootstraps before database loading; restricted storage is harmless", () => {
  const h = browserHarness(new Map([["pictopia.appearance", "dark"]]));
  try {
    h.load();
    assert.equal(h.Appearance.getColorScheme(), "dark");
    assert.equal(h.root.style.colorScheme, "dark");
    globalThis.localStorage.setItem = () => {
      throw Error("Restricted");
    };
    assert.doesNotThrow(() => h.Appearance.setColorScheme("light"));
    assert.equal(h.Appearance.getColorScheme(), "light");
    h.root.setAttribute("data-theme", "unspecified");
    assert.equal(h.Appearance.getColorScheme(), "light");
  } finally {
    h.restore();
  }
});
function rgb(hsl) {
  const [h, s, l] = hsl.match(/[\d.]+/g).map(Number);
  const saturation = s / 100,
    light = l / 100,
    a = saturation * Math.min(light, 1 - light);
  return [0, 8, 4].map((n) => {
    const k = (n + h / 30) % 12;
    return light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  });
}
function luminance(color) {
  return rgb(color)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    .reduce((n, v, i) => n + v * [0.2126, 0.7152, 0.0722][i], 0);
}
function contrast(a, b) {
  const l = [luminance(a), luminance(b)].sort((a, b) => b - a);
  return (l[0] + 0.05) / (l[1] + 0.05);
}
test("Text, muted copy and main/destructive buttons have readable contrast in both themes", () => {
  const load = makeLoader();
  for (const mode of ["light", "dark"]) {
    const { colors } = load("theming/themes/" + mode + ".ts").default;
    for (const [fg, bg] of [
      ["foreground", "background"],
      ["foreground", "card"],
      ["mutedForeground", "background"],
      ["mutedForeground", "card"],
      ["primaryForeground", "primary"],
      ["destructiveForeground", "destructive"],
      ["secondaryForeground", "secondary"],
    ]) {
      const ratio = contrast(colors[fg], colors[bg]);
      assert.ok(ratio >= 4.5, mode + " " + fg + "/" + bg + " contrast " + ratio);
    }
    assert.ok(luminance(colors.overlay) < 0.01, "Dialogs dim the backdrop in " + mode);
  }
});
