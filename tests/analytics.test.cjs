const test = require("node:test");
const assert = require("node:assert/strict");
const { makeLoader } = require("./loader.cjs");

test("screen analytics rejects personal URLs, parameters and developer routes", () => {
  const { analyticsScreen } = makeLoader()("lib/pictopia/analytics-policy.ts");
  assert.equal(analyticsScreen("/home"), "Home");
  assert.equal(analyticsScreen("/collection-review"), "Collection Review");
  for (const path of ["/", "/preview?media=private-photo", "/albums/private-album", "/adventure-lab", "/device-checks", "__proto__", "toString"])
    assert.equal(analyticsScreen(path), undefined);
});

test("missing key is inactive; configured analytics sanitizes screens and survives SDK failures", async () => {
  const savedKey = process.env.EXPO_PUBLIC_AMPLITUDE_API_KEY;
  const savedZone = process.env.EXPO_PUBLIC_AMPLITUDE_SERVER_ZONE;
  const calls = [];
  let fail = true;
  const client = {
    async initialize(key, zone) {
      calls.push(["init", key, zone]);
      if (fail) throw new Error("storage unavailable");
    },
    track(event, properties) { calls.push([event, properties]); },
    flush() { throw new Error("offline"); },
  };
  const analytics = makeLoader({
    "react-native": { Platform: { OS: "ios" } },
    "@/services/amplitude-client": { amplitudeClient: client },
  })("services/analytics.ts");
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  try {
    delete process.env.EXPO_PUBLIC_AMPLITUDE_API_KEY;
    analytics.trackAnalytics("app_opened");
    analytics.trackScreen("/home");
    await settle();
    assert.deepEqual(calls, []);

    process.env.EXPO_PUBLIC_AMPLITUDE_API_KEY = "test-key";
    process.env.EXPO_PUBLIC_AMPLITUDE_SERVER_ZONE = "EU";
    analytics.trackAnalytics("app_opened");
    await settle();
    assert.deepEqual(calls, [["init", "test-key", "EU"]]);

    fail = false;
    analytics.trackScreen("/home");
    analytics.trackScreen("/explore");
    analytics.trackScreen("/preview?media=secret");
    analytics.trackScreen("/adventure-lab");
    await settle();
    assert.equal(calls.filter(([event]) => event === "init").length, 2, "retry failed initialization once; share successful init");
    const events = calls.filter(([event]) => event !== "init");
    assert.deepEqual(events.map(([event, props]) => [event, props.screen]), [
      ["screen_viewed", "Home"], ["screen_viewed", "Explore"],
    ]);
    for (const [, props] of events) {
      assert.deepEqual(Object.keys(props).sort(), ["environment", "platform", "screen"]);
      assert.equal(props.platform, "ios");
    }
    assert.doesNotThrow(() => analytics.flushAnalytics());
  } finally {
    if (savedKey === undefined) delete process.env.EXPO_PUBLIC_AMPLITUDE_API_KEY;
    else process.env.EXPO_PUBLIC_AMPLITUDE_API_KEY = savedKey;
    if (savedZone === undefined) delete process.env.EXPO_PUBLIC_AMPLITUDE_SERVER_ZONE;
    else process.env.EXPO_PUBLIC_AMPLITUDE_SERVER_ZONE = savedZone;
  }
});
