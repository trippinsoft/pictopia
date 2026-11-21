// On a phone, animated styles run on the UI thread: any helper they call must be a worklet, or
// the app crashes as soon as the animation starts (the web preview never notices). This caught
// the 1.0.66 launch crash in the onboarding opening.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const FILES = [
  "components/pictopia/onboarding/problem.tsx",
  "components/pictopia/onboarding/plus-showcase.tsx",
  "components/pictopia/onboarding/celebrate.tsx",
  "components/pictopia/onboarding/demos.tsx",
  "components/pictopia/home-tour.tsx",
  "components/pictopia/spotlight.tsx",
  "components/pictopia/review-hint.tsx",
];

/** The body of every `useAnimatedStyle(() => …)` / `useDerivedValue(() => …)` call. */
function workletBodies(src) {
  const bodies = [];
  const re = /use(?:AnimatedStyle|DerivedValue)\(\s*\(\)\s*=>/g;
  let m;
  while ((m = re.exec(src))) {
    let i = re.lastIndex, depth = 0, start = i;
    for (; i < src.length; i++) {
      const ch = src[i];
      if (ch === "(" || ch === "{" || ch === "[") depth++;
      else if (ch === ")" || ch === "}" || ch === "]") { if (depth === 0) break; depth--; }
    }
    bodies.push(src.slice(start, i));
  }
  return bodies;
}

test("every module-level helper called from an animated style is a worklet", () => {
  for (const file of FILES) {
    const src = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
    const helpers = new Map();
    for (const m of src.matchAll(/^(?:export )?(?:const (\w+) = \([^)]*\)(?:: [^=]+)? =>|function (\w+)\()/gm)) {
      const name = m[1] ?? m[2];
      const rest = src.slice(m.index, m.index + 200);
      helpers.set(name, /["']worklet["']/.test(rest));
    }
    for (const body of workletBodies(src)) {
      for (const [name, isWorklet] of helpers) {
        if (new RegExp(`(^|[^.\\w])${name}\\(`).test(body)) assert.ok(isWorklet, `${file}: ${name}() is called from an animated style but isn't a worklet`);
      }
    }
  }
});
