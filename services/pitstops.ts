import { memoryPairs, type MemoryPairs } from "@/lib/pictopia/memory-match";
import { photographQuery } from "@/lib/pictopia/photo-eligibility";
import { Platform } from "react-native";
import { storage } from "./repository";
import { deletionBlocked, visibleIds } from "./explore";
import { shuffle } from "@/lib/pictopia/logic";
import { MEMORY_PAIRS, PIT_STOP_ROUNDS, playable, type PitStop } from "@/lib/pictopia/pitstops";
import type { Media } from "@/lib/pictopia/types";

/** Games never change a photo, decision or deletion queue; only the pair preference is saved. */
export const pitStopStore = {
  async memoryPairs(): Promise<MemoryPairs> { return memoryPairs(await storage.getValue<unknown>("memoryMatch:pairs")); },
  saveMemoryPairs: (pairs: MemoryPairs) => storage.setValue("memoryMatch:pairs", pairs),
  /** What the library can support. Browser files only have modified dates, so date games
   * are offered only with real capture dates (the native app). */
  async library() {
    const months = (await storage.months(true)).filter((m) => (m.photos ?? m.count) > 0);
    return {
      photos: months.reduce((sum, m) => sum + (m.photos ?? m.count), 0),
      years: new Set(months.map((m) => m.key.slice(0, 4))).size,
      captureDates: Platform.OS !== "web",
    };
  },
  /** A varied sample of visible still photos: a few from many months across every year. */
  async sample(game: PitStop, seed: number, pairs: MemoryPairs = MEMORY_PAIRS): Promise<Media[]> {
    const months = (await storage.months(true)).filter((m) => (m.photos ?? m.count) > 0);
    const byYear = new Map<string, string[]>();
    for (const m of shuffle(months, seed))
      byYear.set(m.key.slice(0, 4), [...(byYear.get(m.key.slice(0, 4)) ?? []), m.key]);
    const keys: string[] = [];
    for (let i = 0; keys.length < 24; i++) {
      const before = keys.length;
      for (const list of byYear.values()) if (list[i] && keys.length < 24) keys.push(list[i]);
      if (keys.length === before) break;
    }
    const needed = game === "memoryMatch" ? pairs : PIT_STOP_ROUNDS * 2;
    const per = Math.max(game === "memoryMatch" ? 3 : 6, Math.ceil(needed / Math.max(1, keys.length)));
    const rows = await Promise.all(keys.map((month) => storage.query({ ...photographQuery, month, limit: 40 })));
    const blocked = await deletionBlocked();
    const pool = rows.flatMap((list) => shuffle(playable(list, blocked), seed).slice(0, per));
    const visible = new Set(await visibleIds(pool.map((m) => m.id)));
    return pool.filter((m) => visible.has(m.id));
  },
  get: (ids: string[]) => storage.query({ ids, limit: ids.length }),
};
