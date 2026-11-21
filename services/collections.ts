import { storage, serialize } from "./repository";
import { deletionBlocked, exploreStoreFor, visibleIds } from "./explore";
import { adventureSize, meaningfulReview } from "@/lib/pictopia/adventures";
import { isSweepScreenshot } from "@/lib/pictopia/photo-eligibility";
import { createExplore } from "@/lib/pictopia/explore";
import type { Media, Query } from "@/lib/pictopia/types";
import { albumService } from "./albums";
import { mediaService } from "./media";
import { knownMediaSize } from "@/lib/pictopia/storage-size";

/** `recents` is the newest `RECENTS_LIMIT` items of any kind (photos, videos, screenshots),
 * always shown in full; `recent` is the older name for All Photos (photos only, newest first).
 * `album:<id>` is an iOS album or an Android folder; `videos-large` is videos, largest first;
 * `favorites` is the photos the user has marked as favourites in Photos (iOS) or MediaStore. */
export type PhotoCollection = "recents" | "recent" | "screenshots" | "favorites" | "videos" | "videos-large" | "unknown" | `month:${string}` | `year:${string}` | `album:${string}`;
export const COLLECTION_BATCH = 120;
export const RECENTS_LIMIT = 100;
interface Batch {
  sessionKey: string;
  mode: "unseen" | "all";
  cursor?: { created: number; id: string };
  hasMore?: boolean;
  replayStart?: number;
}
export interface CollectionReview { scope: PhotoCollection; batches: Batch[]; position: number; continuePosition?: number; openedAt: number; sizeOrderVersion?: number; /** Albums: the name shown when opened. */ title?: string }
const INDEX = "photoCollections:v1";
const metaKey = (scope: PhotoCollection) => `photoCollection:${scope}`;
export const currentBatch = (state: CollectionReview) => state.batches[state.position];
export function isPhotoCollection(value: string): value is PhotoCollection {
  return value === "recents" || value === "recent" || value === "screenshots" || value === "favorites" || value === "videos" || value === "videos-large" || value === "unknown" || /^album:.+/.test(value) || /^month:\d{4}-(0[1-9]|1[0-2])$/.test(value) || /^year:\d{4}$/.test(value);
}
export const canReviewAgain = (scope: PhotoCollection) =>
  scope === "recent" || scope === "videos" || scope === "videos-large" || scope === "screenshots";

export function collectionTitle(scope: PhotoCollection, title?: string) {
  if (scope === "recents") return "Recents";
  if (scope === "recent") return "All Photos";
  if (scope === "screenshots") return "Screenshot Sweep";
  if (scope === "favorites") return "Favorites";
  if (scope === "videos") return "Videos";
  if (scope === "videos-large") return "Largest videos";
  if (scope.startsWith("album:")) return title || "Album";
  if (scope === "unknown") return "Date unknown";
  if (scope.startsWith("year:")) return scope.slice(5);
  const [year, month] = scope.slice(6).split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}
export function collectionQuery(scope: PhotoCollection): Query {
  if (scope === "videos") return { type: "video", order: "oldest" };
  if (scope === "videos-large") return { type: "video", order: "size" };
  // Album members come from the platform's album, not a stored column.
  if (scope.startsWith("album:") || scope === "recents") return { ids: [] };
  if (scope === "favorites") return { type: "photo", order: "newest", favorite: true };
  return { type: "photo", order: scope === "recent" ? "newest" : "oldest", ...(scope === "screenshots" ? { screenshot: true } : scope === "unknown" ? { month: "unknown" } : scope.startsWith("month:") ? { month: scope.slice(6) } : scope.startsWith("year:") ? { year: scope.slice(5) } : {}) };
}
async function remember(state: CollectionReview, session?: ReturnType<typeof createExplore>) {
  const index = (await storage.getValue<PhotoCollection[]>(INDEX)) ?? [];
  await storage.put([], { [metaKey(state.scope)]: state, [INDEX]: [...new Set([state.scope, ...index])], ...(session ? { [currentBatch(state).sessionKey]: session } : {}) });
  return state;
}
const repeatable = (scope: PhotoCollection) => scope === "recents" || scope === "favorites";

const albumId = (scope: PhotoCollection) => scope.startsWith("album:") ? scope.slice(6) : undefined;
/** Collections whose order isn't by date, so date keysets can't page them: albums (the
 * album's order) and videos by size. They are read as one ordered list instead. */
async function listRows(scope: PhotoCollection) {
  const album = albumId(scope);
  if (album) return albumRows(album);
  if (scope === "recents") return recentRows();
  if (scope !== "videos-large") return undefined;
  const rows: Media[] = [];
  for (let offset = 0; ; offset += 500) {
    // Enumerate by date: a size index can omit assets whose size is still unknown.
    const page = await storage.query({ type: "video", order: "newest", limit: 500, offset });
    rows.push(...page.filter(m => !m.deletedAt));
    if (page.length < 500) break;
  }
  // Read metadata only, with bounded concurrency; never download/export a video for size.
  // Callers build inside the repository serializer, preserving concurrent media decisions.
  for (let offset = 0; offset < rows.length; offset += 8) {
    const updates: Media[] = [];
    await Promise.all(rows.slice(offset, offset + 8).map(async (m) => {
      if (knownMediaSize(m) !== undefined) return;
      const size = await mediaService.size(m).catch(() => undefined);
      if (size === undefined || !Number.isFinite(size) || size <= 0) return;
      const latest = await storage.get(m.id);
      if (!latest || latest.modified !== m.modified || latest.deletedAt || !latest.active) return;
      m.size = size;
      updates.push({ ...latest, size });
    }));
    if (updates.length) await storage.put(updates);
  }
  // Unknown sizes follow measured sizes; date is only a tie-breaker.
  return rows.sort((a, b) => (knownMediaSize(b) ?? -1) - (knownMediaSize(a) ?? -1) || b.created - a.created || b.id.localeCompare(a.id));
}
/** The newest items of every kind, as they are in the library right now. */
async function recentRows() {
  const page = await storage.query({ order: "newest", limit: RECENTS_LIMIT + 50 });
  return page.filter(m => !m.deletedAt).slice(0, RECENTS_LIMIT);
}
/** An album's members that Pictopia knows, in the album's own order (newest first). Read
 * live, so photos added or removed outside Pictopia are always reflected. */
async function albumRows(id: string) {
  const ids = await albumService.members(id);
  const known = new Map<string, Media>();
  for (let i = 0; i < ids.length; i += 400) {
    const chunk = ids.slice(i, i + 400);
    for (const m of await storage.query({ ids: chunk, limit: chunk.length })) known.set(m.id, m);
  }
  return ids.flatMap(member => { const m = known.get(member); return m && !m.deletedAt ? [m] : []; });
}
async function build(
  scope: PhotoCollection, saved?: CollectionReview, mode: Batch["mode"] = "unseen",
  cursor?: Batch["cursor"], replayStart?: number,
) {
  const blocked = await deletionBlocked();
  const limit = scope === "screenshots" && replayStart !== undefined ? adventureSize("screenshots") : COLLECTION_BATCH;
  const lookAhead = mode === "all" && scope !== "recents";
  const rows: Media[] = [];
  const included = (m: Media) => !m.deletedAt && !blocked.has(m.id) && (scope !== "screenshots" || isSweepScreenshot(m)) &&
    (m.decision !== "delete" || replayStart !== undefined) && (mode === "all" || !m.firstSeenAt);
  let hasMore = false;
  let after = cursor;
  const add = async (page: Media[]) => {
    const visible = new Set(await visibleIds(page.filter(included).map(m => m.id)));
    for (const item of page) {
      if (!visible.has(item.id)) continue;
      if (rows.length === limit) { hasMore = true; break; }
      rows.push(item);
      after = { created: item.created, id: item.id };
    }
  };
  const members = await listRows(scope);
  if (members) {
    const pageBySize = scope === "videos-large" && replayStart !== undefined;
    const start = cursor && !pageBySize ? members.findIndex(m => m.id === cursor.id) + 1 : 0;
    // Re-rank the unvisited IDs if a video's size changes or the previous anchor disappears.
    const alreadyShown = new Set<string>();
    if (pageBySize && saved && cursor && replayStart !== undefined) {
      for (const batch of saved.batches.slice(replayStart, saved.position + 1)) {
        const session = await storage.getValue<ReturnType<typeof createExplore>>(batch.sessionKey);
        session?.ids.forEach(id => alreadyShown.add(id));
      }
    }
    const candidates = members.slice(start).filter(m => !alreadyShown.has(m.id) && included(m));
    for (let i = 0; i < candidates.length && !hasMore && (lookAhead || rows.length < limit); i += limit)
      await add(candidates.slice(i, i + limit));
  } else {
    // Keep the saved cursor at the last included item, even when looking ahead.
    let scan = cursor;
    while (!hasMore && (lookAhead || rows.length < limit)) {
      const page = await storage.query({ ...collectionQuery(scope), unseen: mode === "unseen", cursor: scan, limit });
      await add(page);
      const last = page.at(-1);
      if (!last || page.length < limit) break;
      scan = { created: last.created, id: last.id };
    }
  }
  const startingSequence = replayStart === saved?.batches.length && replayStart !== undefined;
  const switchingToUnseen = mode === "unseen" && saved && currentBatch(saved).replayStart !== undefined;
  if (!rows.length && saved && !startingSequence && !switchingToUnseen && (!repeatable(scope) || !!cursor)) {
    return remember({ ...saved, openedAt: Date.now() });
  }
  const sessionKey = `collection:${scope}:${Date.now()}-${Math.random().toString(36).slice(2)}:explore`;
  const session = { ...createExplore(rows.map(m => m.id)), review: true, instructionsDismissed: true, ...(rows.length ? {} : { finished: true }) };
  const batch: Batch = { sessionKey, mode, cursor: after, ...(lookAhead ? { hasMore } : {}), ...(replayStart !== undefined ? { replayStart } : {}) };
  const position = saved?.batches.length ?? 0;
  const state: CollectionReview = { ...saved, scope, batches: [...(saved?.batches ?? []), batch], position, openedAt: Date.now(), ...(scope === "videos-large" ? { sizeOrderVersion: 1 } : {}) };
  if (canReviewAgain(scope) && mode === "unseen") state.continuePosition = position;
  return remember(state, session);
}
export const collectionStore = {
  async summary(scope: PhotoCollection) {
    if (scope === "videos" || scope === "videos-large") return storage.videoProgress();
    if (scope === "screenshots") {
      const blocked = await deletionBlocked();
      let total = 0, explored = 0;
      for (let offset = 0; ; offset += 500) {
        const page = await storage.query({ ...collectionQuery(scope), limit: 500, offset });
        for (const m of page) {
          if (m.deletedAt || blocked.has(m.id) || !isSweepScreenshot(m)) continue;
          total++;
          if (m.firstSeenAt) explored++;
        }
        if (page.length < 500) break;
      }
      return { total, explored, remaining: total - explored };
    }
    const list = albumId(scope) || scope === "recents" ? await listRows(scope) : undefined;
    if (list) {
      const rows = list;
      const explored = rows.filter(m => !!m.firstSeenAt).length;
      return { total: rows.length, explored, remaining: rows.length - explored };
    }
    const months = await storage.calendarProgress();
    const rows = months.filter(m => scope === "unknown" ? m.key === "unknown" : scope.startsWith("month:") ? m.key === scope.slice(6) : scope.startsWith("year:") ? m.key.startsWith(`${scope.slice(5)}-`) : true);
    return rows.reduce((sum, row) => ({ total: sum.total + row.total, explored: sum.explored + row.explored, remaining: sum.remaining + row.remaining }), { total: 0, explored: 0, remaining: 0 });
  },
  /** `title` names an album the first time it is opened. */
  async open(scope: PhotoCollection, title?: string) {
    return serialize(async () => {
      const stored = await storage.getValue<CollectionReview>(metaKey(scope));
      const saved = stored ? {
        ...stored,
        position: stored.continuePosition ?? stored.position,
        ...(title ? { title } : {}),
      } : undefined;
      // Preserve old snapshots/Undo, but open a fresh correctly ranked batch once.
      if (saved && scope === "videos-large" && saved.sizeOrderVersion !== 1) return build(scope, saved);
      if (saved && currentBatch(saved).replayStart === undefined) {
        const session = await exploreStoreFor(currentBatch(saved).sessionKey).load();
        if (scope === "recents") {
          const latest = (await recentRows()).filter(m => m.decision !== "delete");
          const visible = await visibleIds(latest.map(m => m.id));
          if (session && visible.length === session.ids.length && visible.every((id, i) => session.ids[i] === id)) {
            return remember({ ...saved, openedAt: Date.now() });
          }
        } else if (session && !session.finished) {
          const rows = await storage.query({ ids: session.ids, type: collectionQuery(scope).type, limit: COLLECTION_BATCH });
          if ((await visibleIds(rows.filter(m => !m.deletedAt).map(m => m.id))).length) return remember({ ...saved, openedAt: Date.now() });
          // Losing access never earns exploration or cleanup. Keep the snapshot/history,
          // but let this collection open the photos it can now access instead.
          await storage.setValue(currentBatch(saved).sessionKey, { ...session, finished: true, activeId: null });
        }
        if (!repeatable(scope) && (await this.summary(scope)).remaining === 0) return remember({ ...saved, openedAt: Date.now() });
      }
      const opened = await build(scope, saved, repeatable(scope) ? "all" : "unseen");
      return title && !saved ? remember({ ...opened, title }) : opened;
    });
  },
  async next(scope: PhotoCollection, all = false, fromKey?: string) {
    return serialize(async () => {
      const stored = await storage.getValue<CollectionReview>(metaKey(scope));
      const from = fromKey ? stored?.batches.findIndex(batch => batch.sessionKey === fromKey) : undefined;
      const saved = stored && from !== undefined && from >= 0 ? { ...stored, position: from } : stored;
      if (all && canReviewAgain(scope)) {
        const continuePosition = saved?.continuePosition ?? (saved && currentBatch(saved).replayStart === undefined ? saved.position : undefined);
        return build(scope, saved && continuePosition !== undefined && continuePosition >= 0 ? { ...saved, continuePosition } : saved,
          "all", undefined, saved?.batches.length ?? 0);
      }
      if (!saved) return build(scope, undefined, all ? "all" : "unseen");
      const batch = currentBatch(saved);
      const following = saved.batches[saved.position + 1];
      if (!all && following && (!canReviewAgain(scope) || (batch.replayStart !== undefined && following.replayStart === batch.replayStart))) {
        return remember({ ...saved, position: saved.position + 1, openedAt: Date.now() });
      }
      return build(scope, saved, all ? "all" : batch.mode, all ? undefined : batch.mode === "all" ? batch.cursor : undefined, batch.replayStart);
    });
  },
  async previous(scope: PhotoCollection) {
    return serialize(async () => {
      const saved = await storage.getValue<CollectionReview>(metaKey(scope));
      return saved ? remember({ ...saved, position: Math.max(0, saved.position - 1), openedAt: Date.now() }) : undefined;
    });
  },
  async latest() {
    const scopes = (await storage.getValue<PhotoCollection[]>(INDEX)) ?? [];
    // The index is ordered by opening time. Home needs metadata only, not every saved photo.
    for (const scope of scopes) {
      const state = await storage.getValue<CollectionReview>(metaKey(scope));
      if (!state) continue;
      const position = state.continuePosition ?? state.position;
      const key = state.batches[position].sessionKey;
      const session = await storage.getValue<import("@/lib/pictopia/explore").ExploreSession>(key);
      if (state.batches[position].replayStart === undefined && session && session.ids.length && meaningfulReview(session)) return { ...state, position, openedAt: Math.max(state.openedAt, (await storage.getValue<number>(`activity:${key}`)) ?? 0) };
    }
    return undefined;
  },
  async savedScopes() { return (await storage.getValue<PhotoCollection[]>(INDEX)) ?? []; },
};
