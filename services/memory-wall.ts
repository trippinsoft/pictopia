import { storage } from "./repository";
import type { SavedWallLayout } from "@/lib/pictopia/memory-wall";

/** `memoryWall:v1` keeps the wall's year arrangement stable between visits. Progress itself is
 * never stored here: it always comes from the media records via `storage.memoryWall()`. */
const KEY = "memoryWall:v1";
type Saved = { layout?: SavedWallLayout };
const valid = (v: unknown): v is Saved => !!v && typeof v === "object";
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every((k) => typeof k === "string");
// rows → columns → stacked year keys. Older flat row lists don't match and are simply rebuilt.
const validRows = (rows: unknown): rows is string[][][] => Array.isArray(rows) && rows.every((r) => Array.isArray(r) && r.every(strings));

export const memoryWallStore = {
  async layout(): Promise<SavedWallLayout | undefined> {
    const saved = await storage.getValue<unknown>(KEY);
    return valid(saved) && validRows(saved.layout?.rows) ? { rows: saved.layout.rows } : undefined;
  },
  async saveLayout(rows: string[][][]) {
    const saved = await storage.getValue<unknown>(KEY);
    await storage.setValue(KEY, { ...(valid(saved) ? saved : {}), layout: { rows } });
  },
};
