import { SCAN_VERSION } from "@/lib/pictopia/logic";
import * as SQLite from "expo-sqlite";
import { Storage } from "./storage.types";
import { Query, Stats, Month } from "@/lib/pictopia/types";
let db: SQLite.SQLiteDatabase;
function conditions(q: Query) {
  let sql = "active=1";
  const args: (string | number)[] = [];
  const add = (s: string, v?: string | number) => {
    sql += ` AND ${s}`;
    if (v !== undefined) args.push(v);
  };
  if (q.before !== undefined) add("created<?", q.before);
  if (q.blurry) add("json_extract(data,'$.scan.sharpness')<30");
  if (q.month) add("month=?", q.month);
  if (q.day) add("day=?", q.day);
  if (q.type) add("type=?", q.type);
  if (q.decision) add("decision=?", q.decision);
  if (q.unreviewed) add("decision IS NULL");
  if (q.favorite) add("favorite=1");
  if (q.excludeFavorites) add("favorite=0");
  if (q.screenshot) add("screenshot=1");
  if (q.scanMissing) add("scanned=0");
  if (q.hash) add("hash=?", q.hash);
  if (q.ids) {
    if (!q.ids.length) add("0=1");
    else {
      add(`id IN (${q.ids.map(() => "?").join(",")})`);
      args.push(...q.ids);
    }
  }
  return { sql, args };
}
export const storage: Storage = {
  async init() {
    // Stable legacy storage identity preserves saved decisions across the brand rename.
    db = await SQLite.openDatabaseAsync("flickwell.db");
    const version = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
    if ((version?.user_version ?? 0) > 1)
      throw Error("This local database needs a newer version of Pictopia.");
    await db.execAsync(
      `PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS media(id TEXT PRIMARY KEY NOT NULL,data TEXT NOT NULL,created REAL,month TEXT,day TEXT,type TEXT,decision TEXT,favorite INTEGER,screenshot INTEGER,size REAL,active INTEGER,scanned INTEGER,hash TEXT);CREATE TABLE IF NOT EXISTS preferences(key TEXT PRIMARY KEY,value TEXT NOT NULL);CREATE INDEX IF NOT EXISTS media_date ON media(active,created DESC);CREATE INDEX IF NOT EXISTS media_month ON media(active,month);CREATE INDEX IF NOT EXISTS media_decision ON media(active,decision);CREATE INDEX IF NOT EXISTS media_hash ON media(hash);PRAGMA user_version=1;`,
    );
  },
  async get(id) {
    const row = await db.getFirstAsync<{ data: string }>("SELECT data FROM media WHERE id=?", id);
    return row ? JSON.parse(row.data) : undefined;
  },
  async query(q) {
    const { sql, args } = conditions(q);
    const order =
      q.order === "size"
        ? "size DESC,created DESC"
        : q.order === "oldest"
          ? "created ASC,id ASC"
          : "created DESC,id DESC";
    const rows = await db.getAllAsync<{ data: string }>(
      `SELECT data FROM media WHERE ${sql} ORDER BY ${order} LIMIT ? OFFSET ?`,
      ...args,
      q.limit ?? 100,
      q.offset ?? 0,
    );
    return rows.map((r) => JSON.parse(r.data));
  },
  async put(items, values = {}) {
    await db.withExclusiveTransactionAsync(async (tx) => {
      for (const m of items) {
        if (!m.id) throw Error("A media record has no identifier.");
        await tx.runAsync(
          "INSERT OR REPLACE INTO media VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
          m.id,
          JSON.stringify(m),
          m.created,
          m.month,
          m.day,
          m.type,
          m.decision ?? null,
          Number(m.favorite || m.systemFavorite === true),
          Number(m.screenshot),
          m.size ?? null,
          Number(m.active),
          Number(m.scan?.version === `${SCAN_VERSION}:${m.modified}` || !!m.scanError),
          m.scan?.hash ?? null,
        );
      }
      for (const [k, v] of Object.entries(values))
        await tx.runAsync("INSERT OR REPLACE INTO preferences VALUES(?,?)", k, JSON.stringify(v));
    });
  },
  async getValue<T>(key: string) {
    const r = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM preferences WHERE key=?",
      key,
    );
    return r ? (JSON.parse(r.value) as T) : undefined;
  },
  async setValue(key, value) {
    await this.put([], { [key]: value });
  },
  async stats() {
    const r = await db.getFirstAsync<Stats>(
      `SELECT COUNT(*) total, COALESCE(SUM(type='photo'),0) photos, COALESCE(SUM(type='video'),0) videos, COALESCE(SUM(decision IS NOT NULL),0) reviewed, COALESCE(SUM(decision='delete'),0) pending, COALESCE(SUM(size),0) knownBytes,COUNT(size) knownSizes,COALESCE(SUM(CASE WHEN decision='delete' THEN size ELSE 0 END),0) pendingBytes FROM media WHERE active=1`,
    );
    return r!;
  },
  async months() {
    const rows = await db.getAllAsync<Month>(
      "SELECT month AS key,COUNT(*) count,SUM(decision IS NOT NULL) reviewed FROM media WHERE active=1 GROUP BY month ORDER BY month DESC",
    );
    for (const row of rows) {
      const m = await this.query({ month: row.key, limit: 1 });
      row.cover = m[0]?.uri;
    }
    return rows;
  },
};
