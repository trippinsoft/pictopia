import { albumService } from "./albums";
import { storage } from "./repository";
import type { Media } from "@/lib/pictopia/types";

/** Decorative covers only: read live membership, then try known accessible members in
 * its original order. Small batches avoid loading an entire album's media into memory.
 * A renderer can ask for the next candidate after a decode/resolve failure. */
export async function albumCoverReader(id: string, signal: AbortSignal) {
  const ids = [...new Set(await albumService.members(id, signal))];
  let offset = 0;
  let candidates: Media[] = [];
  return {
    async next(): Promise<Media | undefined> {
      while (!signal.aborted) {
        const candidate = candidates.shift();
        if (candidate) return candidate;
        if (offset >= ids.length) return undefined;
        const batch = ids.slice(offset, offset + 40);
        offset += batch.length;
        const rows = await storage.query({ ids: batch, limit: batch.length });
        const byId = new Map(rows.filter(m => m.active && !m.deletedAt && !!m.uri).map(m => [m.id, m]));
        candidates = batch.flatMap(id => { const m = byId.get(id); return m ? [m] : []; });
      }
      return undefined;
    },
  };
}
