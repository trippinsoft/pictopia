import { memoryPairs, type MemoryPairs } from "@/lib/pictopia/memory-match";
import { photographQuery } from "@/lib/pictopia/photo-eligibility";
import { Platform } from "react-native";
import { storage } from "./repository";
import { deletionBlocked, visibleIds } from "./explore";
import { presentPhotos } from "./photo-picks";
import { cameraPhoto } from "@/lib/pictopia/photo-picks";
import { shuffle } from "@/lib/pictopia/logic";
import { MEMORY_PAIRS, playable, type PitStop } from "@/lib/pictopia/pitstops";
import type { Media } from "@/lib/pictopia/types";

/** Visible photos a game samples: Memory Match plays up to 6 and keeps spares for failures and paperwork;
 * Which Came First picks its 20 best photos from a wide date spread. */
const ENOUGH_PHOTOS = 40;
const SAMPLE_MEMORY = 32, SAMPLE_DATED = 80;

/** Games never change a photo, decision or deletion queue; only the pair preference is saved. */
export const pitStopStore = {
  async memoryPairs(): Promise<MemoryPairs> { return memoryPairs(await storage.getValue<unknown>("memoryMatch:pairs")); },
  saveMemoryPairs: (pairs: MemoryPairs) => storage.setValue("memoryMatch:pairs", pairs),
  /** What the library can support (counts stop at "plenty", so `photos` is a lower bound). Browser files only have modified dates, so date games
   * are offered only with real capture dates (the native app). */
  async library() {
    const blocked = await deletionBlocked();
    let photos = 0; const years = new Set<string>();
    for (let offset = 0; ; offset += 200) {
      const page = await storage.query({ ...photographQuery, offset, limit: 200 });
      for (const item of playable(page, blocked)) { photos++; years.add(item.month.slice(0, 4)); }
      // Games only need a handful of photos from two years: stop counting once that's certain
      // instead of reading the whole library every time a Pit Stop opens.
      if (page.length < 200 || (photos >= ENOUGH_PHOTOS && years.size >= 2)) break;
    }
    return { photos, years: years.size, captureDates: Platform.OS !== "web" };
  },
  /** A varied sample of visible still photos: a few from many months across every year. */
  async sample(game: PitStop, seed: number, _pairs: MemoryPairs = MEMORY_PAIRS): Promise<Media[]> {
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
    const rows = await Promise.all(keys.flatMap(month => [
      storage.query({ ...photographQuery, month, order: "oldest", limit: 20 }),
      storage.query({ ...photographQuery, month, order: "newest", limit: 20 }),
    ]));
    const blocked = await deletionBlocked();
    const pool = shuffle([...new Map(rows.flatMap(list => playable(list, blocked)).map(m => [m.id, m])).values()], seed);
    // Confirm only as many photos as the game can use, with one quick library query per chunk
    // where the build supports it (the per-photo check took ~10 s for Which Came First).
    const want = game === "memoryMatch" ? SAMPLE_MEMORY : SAMPLE_DATED, result: Media[] = [];
    const candidates = pool.filter(cameraPhoto);
    for (let start = 0; start < candidates.length && result.length < want; ) {
      const chunk = candidates.slice(start, start + Math.max(12, Math.ceil((want - result.length) * 1.25)));
      start += chunk.length;
      const ids = chunk.map((m) => m.id), quick = await presentPhotos(ids);
      const visible = quick ? new Set(ids.filter(id => quick.present.has(id) && !quick.screenshots.has(id))) : new Set(await visibleIds(ids));
      result.push(...chunk.filter((m) => visible.has(m.id)));
    }
    return result.slice(0, want);
  },
  get: (ids: string[]) => storage.query({ ids, limit: ids.length }),
};
