// Simulated native runtime: the real SQLite storage adapter on node:sqlite plus a photo library
// with full / limited / no access. Booting twice on one database models an app restart.
const { DatabaseSync } = require("node:sqlite");
const { makeLoader } = require("./loader.cjs");
const CREATED = new Date("2025-06-12T12:00:00Z").getTime();
function media(id, extra = {}) {
  return {
    id,
    uri: "ph://" + id,
    name: id + ".jpg",
    type: "photo",
    created: CREATED,
    modified: CREATED,
    width: 1000,
    height: 1000,
    duration: 0,
    month: "2025-06",
    day: "06-12",
    favorite: false,
    screenshot: false,
    active: true,
    ...extra,
  };
}
function sqliteAdapter(db, fault) {
  const adapter = {
    execAsync: async (s) => db.exec(s),
    getFirstAsync: async (s, ...args) => db.prepare(s).get(...args),
    getAllAsync: async (s, ...args) => db.prepare(s).all(...args),
    runAsync: async (s, ...args) => {
      // Simulated power loss / write failure while saving a particular key.
      if (fault.key && s.includes("preferences") && args[0] === fault.key)
        throw Error("Simulated write failure");
      return db.prepare(s).run(...args);
    },
    withExclusiveTransactionAsync: async (work) => {
      db.exec("BEGIN IMMEDIATE");
      try {
        await work(adapter);
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
  return adapter;
}
function platform(opts = {}) {
  const ids = opts.library ?? ["a", "b", "c"];
  const p = {
    os: opts.os ?? "ios",
    access: opts.access ?? "all",
    library: new Set(ids),
    selected: new Set(opts.selected ?? ids),
    lookupErrors: new Set(),
    requests: [],
    onDelete: null,
    onLookup: null,
    records: new Map((opts.records ?? []).map((m) => [m.id, m])),
  };
  p.visible = (id) =>
    p.library.has(id) && (p.access === "all" || (p.access === "limited" && p.selected.has(id)));
  // iOS semantics: identifiers the app cannot see are silently left out of the request.
  p.deleteVisible = (ids) => {
    for (const id of ids) if (p.visible(id)) p.library.delete(id);
  };
  p.ml = {
    getPermissionsAsync: async () => ({
      granted: p.access !== "none",
      accessPrivileges: p.access,
      canAskAgain: true,
    }),
    getAssetInfoAsync: async (id) => {
      if (p.onLookup) await p.onLookup(id);
      if (p.access === "none") throw Error("Media Library permission is required");
      if (p.lookupErrors.has(id)) throw Error("Lookup failed");
      if (!p.visible(id)) return null;
      const m = p.records.get(id) ?? media(id);
      return { id, creationTime: m.created, width: m.width, height: m.height, mediaType: "photo" };
    },
    deleteAssetsAsync: async (ids) => {
      p.requests.push([...ids]);
      if (p.onDelete) return p.onDelete(ids);
      p.deleteVisible(ids);
      return true;
    },
  };
  p.mocks = {
    "expo-media-library": p.ml,
    "expo-modules-core": { requireOptionalNativeModule: () => null },
    "expo-file-system": { File: class {} },
    "react-native": { Platform: { OS: p.os }, Linking: {} },
  };
  return p;
}
async function boot(db, p, fault = {}) {
  const adapter = sqliteAdapter(db, fault);
  const storageModule = makeLoader({ "expo-sqlite": { openDatabaseAsync: async () => adapter } })(
    "services/storage.native.ts",
  );
  const load = makeLoader({ ...p.mocks, "./storage": storageModule });
  const repo = load("services/repository.ts");
  const app = {
    ...repo,
    ...load("services/deletion.ts"),
    mediaService: load("services/media.native.ts").mediaService,
  };
  await app.storage.init();
  return app;
}
const never = () => new Promise(() => {});
const tick = () => new Promise((r) => setTimeout(r, 5));
module.exports = { DatabaseSync, media, platform, boot, never, tick, CREATED };
