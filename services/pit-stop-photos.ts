import { Image } from "expo-image";
import { pitStopStore } from "./pitstops";
import { reviewMedia } from "./review-media";
import { photoDisplay } from "./photo-display";
import { assessPhotos } from "./photo-picks";
import { rankForGame } from "@/lib/pictopia/photo-picks";
import type { Media } from "@/lib/pictopia/types";
import type { MemoryPairs } from "@/lib/pictopia/memory-match";

/** Photos prepared at once, and how long one iCloud fallback may hold up the shuffle. */
const PARALLEL = 6, FALLBACK_MS = 3000;
/** The on-device photo check may hold the shuffle this long before games start without it. */
const ASSESS_MS = 2500;
function within<T>(work: Promise<T>, ms: number, fallback: T) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([work, new Promise<T>(resolve => { timer = setTimeout(() => resolve(fallback), ms); })]).finally(() => clearTimeout(timer));
}

/** The local thumbnail, or the display image when it isn't on the device; undefined when the
 * picture can't be decoded. A slow cloud download is abandoned so another photo is used. */
async function load(photo: Media, owned: Set<string>, signal: AbortSignal) {
  let uri: string;
  try { uri = await reviewMedia.thumbnail(photo); owned.add(uri); }
  catch {
    if (signal.aborted) throw Error("Photo loading cancelled.");
    const limit = new AbortController(), stop = () => limit.abort();
    const timer = setTimeout(stop, FALLBACK_MS); signal.addEventListener("abort", stop);
    try { uri = await photoDisplay(photo, true, limit.signal); }
    finally { clearTimeout(timer); signal.removeEventListener("abort", stop); }
  }
  if (signal.aborted) throw Error("Photo loading cancelled.");
  return await Image.prefetch(uri, "memory-disk") ? uri : undefined;
}

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
    const dated = varied.slice(0, game === "memoryMatch" ? 48 : 80)
      .filter(photo => game !== "whichFirst" || (Number.isFinite(photo.created) && photo.created !== 0 && photo.created <= Date.now()));
    // People, pets and places first in both games; documents, receipts and screenshots only if nothing else.
    // Which Came First's list runs from the extremes inward, so its first 48 keep a wide date
    // spread; the rounds pair the chosen photos by date afterwards.
    const picks = await within(assessPhotos(dated.slice(0, 48).map(photo => photo.id)), ASSESS_MS, {});
    check();
    const pool = rankForGame(dated, picks, true);
    // Load a few photos at once rather than one after another; keep candidate order so the
    // chosen set stays varied. Every request in a batch settles before cancellation is checked,
    // so thumbnails that arrive late are still owned and released.
    for (let start = 0; start < pool.length && photos.length < needed; ) {
      check();
      const batch = pool.slice(start, start + Math.max(PARALLEL, needed - photos.length + 2));
      start += batch.length;
      const loaded = await Promise.allSettled(batch.map(photo => load(photo, owned, signal)));
      check();
      loaded.forEach((result, i) => {
        if (result.status !== "fulfilled" || !result.value || photos.length >= needed) return;
        photos.push(batch[i]); uris[batch[i].id] = result.value;
      });
    }
    check(); return { photos, uris, dispose };
  } catch (error) { dispose(); throw error; }
}
