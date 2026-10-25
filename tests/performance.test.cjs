const test = require("node:test"),
  assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const { makeLoader } = require("./loader.cjs");
test("SQLite metadata queries remain bounded at 100, 1000, 10000, and 50000 records", async () => {
  const db = new DatabaseSync(":memory:");
  const a = {
    execAsync: async (s) => db.exec(s),
    getFirstAsync: async (s, ...v) => db.prepare(s).get(...v),
    getAllAsync: async (s, ...v) => db.prepare(s).all(...v),
    runAsync: async (s, ...v) => db.prepare(s).run(...v),
    withExclusiveTransactionAsync: async (work) => {
      db.exec("BEGIN");
      try {
        await work(a);
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
  const { storage } = makeLoader({ "expo-sqlite": { openDatabaseAsync: async () => a } })(
    "services/storage.native.ts",
  );
  await storage.init();
  let inserted = 0;
  for (const count of [100, 1000, 10000, 50000]) {
    for (; inserted < count; ) {
      const chunk = [];
      for (let n = 0; n < 200 && inserted < count; n++, inserted++)
        chunk.push({
          id: `m-${inserted}`,
          uri: "local",
          name: "media",
          type: inserted % 10 === 0 ? "video" : "photo",
          created: inserted,
          modified: 0,
          width: 100,
          height: 100,
          duration: 0,
          month: "2025-01",
          day: "01-01",
          favorite: false,
          screenshot: false,
          active: true,
          size: 1024,
        });
      await storage.put(chunk);
    }
    const start = performance.now();
    const page = await storage.query({ limit: 200 });
    const stats = await storage.stats();
    assert.equal(stats.total, count);
    assert.equal(page.length, Math.min(count, 200));
    assert.equal(page[0].created, count - 1);
    console.log(
      `SQLite metadata benchmark: ${count} rows, query + aggregate ${(performance.now() - start).toFixed(1)} ms (host engine, not a device benchmark)`,
    );
  }
  db.close();
});
