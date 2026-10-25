import { Storage } from "./storage.types";
import { Media, Stats, Month } from "@/lib/pictopia/types";
import { matches } from "@/lib/pictopia/logic";
let db: IDBDatabase;
function req<T>(r: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function each(
  visit: (m: Media) => boolean | void,
  order: "newest" | "oldest" | "size" = "newest",
) {
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("media", "readonly"),
      store = tx.objectStore("media");
    const r = store
      .index(order === "size" ? "size" : "created")
      .openCursor(null, order === "oldest" ? "next" : "prev");
    r.onsuccess = () => {
      const c = r.result;
      if (!c || visit(c.value) === false) {
        resolve();
        return;
      }
      c.continue();
    };
    r.onerror = () => reject(r.error);
  });
}
export const storage: Storage = {
  async init() {
    db = await new Promise((resolve, reject) => {
      // Stable legacy storage identity preserves selected files and cleanup progress.
      const r = globalThis.indexedDB.open("flickwell", 1);
      r.onupgradeneeded = () => {
        const m = r.result.createObjectStore("media", { keyPath: "id" });
        m.createIndex("created", "created");
        m.createIndex("size", "size");
        r.result.createObjectStore("preferences");
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  },
  async get(id) {
    return await req(db.transaction("media", "readonly").objectStore("media").get(id));
  },
  async query(q) {
    const result: Media[] = [];
    let skip = q.offset ?? 0;
    await each((m) => {
      if (matches(m, q)) {
        if (skip) skip--;
        else result.push(m);
      }
      return result.length < (q.limit ?? 100);
    }, q.order);
    return result;
  },
  async put(items, values = {}) {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(["media", "preferences"], "readwrite");
      for (const m of items) tx.objectStore("media").put(m);
      for (const [k, v] of Object.entries(values)) tx.objectStore("preferences").put(v, k);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? Error("Saving was interrupted."));
    });
  },
  async getValue<T>(key: string) {
    return (await req(
      db.transaction("preferences", "readonly").objectStore("preferences").get(key),
    )) as T | undefined;
  },
  async setValue(key, value) {
    await this.put([], { [key]: value });
  },
  async stats() {
    const s: Stats = {
      total: 0,
      photos: 0,
      videos: 0,
      reviewed: 0,
      pending: 0,
      knownBytes: 0,
      knownSizes: 0,
      pendingBytes: 0,
    };
    await each((m) => {
      if (!m.active) return;
      s.total++;
      m.type === "photo" ? s.photos++ : s.videos++;
      if (m.decision) s.reviewed++;
      if (m.size !== undefined) {
        s.knownSizes++;
        s.knownBytes += m.size;
      }
      if (m.decision === "delete") {
        s.pending++;
        s.pendingBytes += m.size ?? 0;
      }
    });
    return s;
  },
  async months() {
    const groups = new Map<string, Month>();
    await each((m) => {
      if (!m.active) return;
      const g = groups.get(m.month) ?? { key: m.month, count: 0, reviewed: 0, cover: m.uri };
      g.count++;
      if (m.decision) g.reviewed++;
      groups.set(m.month, g);
    });
    return Array.from(groups.values()).sort((a, b) => b.key.localeCompare(a.key));
  },
};
