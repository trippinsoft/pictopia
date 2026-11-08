import { Image } from "expo-image";
import { pitStopStore } from "./pitstops";
import { reviewMedia } from "./review-media";
import { photoDisplay } from "./photo-display";
import type { Media } from "@/lib/pictopia/types";
import type { MemoryPairs } from "@/lib/pictopia/memory-match";

export interface PitStopPhotos { photos: Media[]; uris: Record<string, string>; dispose(): void }
/** Read-only preparation: try alternate authorized photos before starting a game. No
 * encounter, allowance, decision, favorite or Adventure writes belong in this path. */
export async function preparePitStop(game: "memoryMatch" | "whichFirst", seed: number, signal: AbortSignal, pairs: MemoryPairs = 4): Promise<PitStopPhotos> {
  const owned = new Set<string>(), photos: Media[] = [], uris: Record<string, string> = {};
  const dispose = () => { for (const uri of owned) reviewMedia.releaseThumbnail(uri); owned.clear(); };
  const check = () => { if (signal.aborted) throw Error("Photo loading cancelled."); };
  try {
    check();
    const sample = await pitStopStore.sample(game, seed, pairs);
    const candidates = [...new Map(sample.map(photo => [photo.id, photo])).values()];
    if (game === "whichFirst") candidates.sort((a, b) => a.created - b.created);
    const varied = game === "whichFirst" ? candidates.flatMap((_, i) => i < Math.ceil(candidates.length / 2) ? [candidates[i], candidates[candidates.length - 1 - i]].filter((m, j) => j === 0 || m.id !== candidates[i].id) : []) : candidates;
    const needed = game === "memoryMatch" ? pairs : 20;
    for (const photo of varied.slice(0, game === "memoryMatch" ? 48 : 80)) {
      check();
      if (game === "whichFirst" && (!Number.isFinite(photo.created) || photo.created === 0 || photo.created > Date.now())) continue;
      try {
        let uri: string;
        try { uri = await reviewMedia.thumbnail(photo); owned.add(uri); }
        catch { check(); uri = await photoDisplay(photo, true, signal); }
        check();
        if (!(await Image.prefetch(uri, "memory-disk"))) continue;
        check(); photos.push(photo); uris[photo.id] = uri;
        if (photos.length >= needed) break;
      } catch { check(); /* Try another eligible photo instead of freezing the game. */ }
    }
    check(); return { photos, uris, dispose };
  } catch (error) { dispose(); throw error; }
}
