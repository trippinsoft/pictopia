import { storage, serialize } from "./repository";
import { deletionBlocked, exploreStoreFor, visibleIds } from "./explore";
import { meaningfulReview } from "@/lib/pictopia/adventures";
import { createExplore } from "@/lib/pictopia/explore";
import type { Media, Query } from "@/lib/pictopia/types";
import { albumService } from "./albums";

/** `album:<id>` is an iOS album or an Android folder; `videos-large` is videos, largest first. */
export type PhotoCollection = "recent" | "screenshots" | "videos" | "videos-large" | "unknown" | `month:${string}` | `year:${string}` | `album:${string}`;
export const COLLECTION_BATCH = 120;
interface Batch { sessionKey: string; mode: "unseen" | "all"; cursor?: { created: number; id: string }; }
export interface CollectionReview { scope: PhotoCollection; batches: Batch[]; position: number; openedAt: number; /** Albums: the name shown when opened. */ title?: string }
const INDEX = "photoCollections:v1";
const metaKey = (scope: PhotoCollection) => `photoCollection:${scope}`;
export const currentBatch = (state: CollectionReview) => state.batches[state.position];
export function isPhotoCollection(value: string): value is PhotoCollection {
  return value === "recent" || value === "screenshots" || value === "videos" || value === "videos-large" || value === "unknown" || /^album:.+/.test(value) || /^month:\d{4}-(0[1-9]|1[0-2])$/.test(value) || /^year:\d{4}$/.test(value);
}
export function collectionTitle(scope: PhotoCollection, title?: string) {
  if (scope === "recent") return "Recent Photos";
  if (scope === "screenshots") return "Screenshots";
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
  if (scope.startsWith("album:")) return { ids: [] };
  return { type: "photo", order: scope === "recent" ? "newest" : "oldest", ...(scope === "screenshots" ? { screenshot: true } : scope === "unknown" ? { month: "unknown" } : scope.startsWith("month:") ? { month: scope.slice(6) } : scope.startsWith("year:") ? { year: scope.slice(5) } : {}) };
}
async function remember(state: CollectionReview) {
  const index = (await storage.getValue<PhotoCollection[]>(INDEX)) ?? [];
  await storage.put([], { [metaKey(state.scope)]: state, [INDEX]: [...new Set([state.scope, ...index])] });
  return state;
}
const albumId = (scope: PhotoCollection) => scope.startsWith("album:") ? scope.slice(6) : undefined;
/** Collections whose order isn't by date, so date keysets can't page them: albums (the
 * album's order) and videos by size. They are read as one ordered list instead. */
async function listRows(scope: PhotoCollection) {
  const album = albumId(scope);
  if (album) return albumRows(album);
  if (scope !== "videos-large") return undefined;
  const rows: Media[] = [];
  for (let offset = 0; ; offset += 500) {
    const page = await storage.query({ type: "video", order: "size", limit: 500, offset });
    rows.push(...page.filter(m => !m.deletedAt));
    if (page.length < 500) return rows;
  }
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
async function build(scope: PhotoCollection, saved?: CollectionReview, mode: "unseen" | "all" = "unseen", cursor?: Batch["cursor"]) {
  const blocked = await deletionBlocked();
  const rows = [];
  let after = cursor;
  const members = await listRows(scope);
  if (members) {
    const start = after ? members.findIndex(m => m.id === after?.id) + 1 : 0;
    const candidates = members.slice(Math.max(0, start)).filter(m => m.decision !== "delete" && !blocked.has(m.id) && (mode === "all" || !m.firstSeenAt));
    for (let i = 0; i < candidates.length && rows.length < COLLECTION_BATCH; i += COLLECTION_BATCH) {
      const page = candidates.slice(i, i + COLLECTION_BATCH);
      const visible = new Set(await visibleIds(page.map(m => m.id)));
      for (const item of page) {
        after = { created: item.created, id: item.id };
        if (visible.has(item.id)) rows.push(item);
        if (rows.length === COLLECTION_BATCH) break;
      }
    }
  } else
  // Keyset pagination remains stable when earlier photos are deleted, imported, or explored.
  for (;;) {
    const page = await storage.query({ ...collectionQuery(scope), unseen: mode === "unseen", cursor: after, limit: COLLECTION_BATCH });
    if (!page.length) break;
    const visible = new Set(await visibleIds(page.filter(m => !m.deletedAt && m.decision !== "delete" && !blocked.has(m.id)).map(m => m.id)));
    for (const item of page) {
      after = { created: item.created, id: item.id };
      if (visible.has(item.id)) rows.push(item);
      if (rows.length === COLLECTION_BATCH) break;
    }
    if (rows.length === COLLECTION_BATCH || page.length < COLLECTION_BATCH) break;
  }
  if (!rows.length && saved) return remember({ ...saved, openedAt: Date.now() });
  const sessionKey = `collection:${scope}:${Date.now()}-${Math.random().toString(36).slice(2)}:explore`;
  const session = { ...createExplore(rows.map(m => m.id)), review: true, instructionsDismissed: true, ...(rows.length ? {} : { finished: true }) };
  const batch: Batch = { sessionKey, mode, cursor: after };
  const state: CollectionReview = { scope, batches: [...(saved?.batches ?? []), batch], position: saved?.batches.length ?? 0, openedAt: Date.now(), ...(saved?.title ? { title: saved.title } : {}) };
  await storage.put([], { [sessionKey]: session });
  return remember(state);
}
export const collectionStore = {
  async summary(scope: PhotoCollection) {
    if (scope === "videos" || scope === "videos-large") return storage.videoProgress();
    const list = albumId(scope) ? await listRows(scope) : undefined;
    if (list) {
      const rows = list;
      const explored = rows.filter(m => !!m.firstSeenAt).length;
      return { total: rows.length, explored, remaining: rows.length - explored };
    }
    const months = await storage.calendarProgress(scope === "screenshots");
    const rows = months.filter(m => scope === "unknown" ? m.key === "unknown" : scope.startsWith("month:") ? m.key === scope.slice(6) : scope.startsWith("year:") ? m.key.startsWith(`${scope.slice(5)}-`) : true);
    return rows.reduce((sum, row) => ({ total: sum.total + row.total, explored: sum.explored + row.explored, remaining: sum.remaining + row.remaining }), { total: 0, explored: 0, remaining: 0 });
  },
  /** `title` names an album the first time it is opened. */
  async open(scope: PhotoCollection, title?: string) {
    return serialize(async () => {
      const stored = await storage.getValue<CollectionReview>(metaKey(scope));
      const saved = stored && title && stored.title !== title ? { ...stored, title } : stored;
      if (!saved && title) return build(scope, undefined).then(state => remember({ ...state, title }));
      if (saved) {
        const session = await exploreStoreFor(currentBatch(saved).sessionKey).load();
        if (session && !session.finished) {
          const rows = await storage.query({ ids: session.ids, type: collectionQuery(scope).type, limit: COLLECTION_BATCH });
          if (rows.some(m => !m.deletedAt)) return remember({ ...saved, openedAt: Date.now() });
          // Losing access never earns exploration or cleanup. Keep the snapshot/history,
          // but let this collection open the photos it can now access instead.
          await storage.setValue(currentBatch(saved).sessionKey, { ...session, finished: true, activeId: null });
        }
        if ((await this.summary(scope)).remaining === 0) return remember({ ...saved, openedAt: Date.now() });
      }
      return build(scope, saved);
    });
  },
  async next(scope: PhotoCollection, all = false) {
    return serialize(async () => {
      const saved = await storage.getValue<CollectionReview>(metaKey(scope));
      if (!saved) return build(scope, undefined, all ? "all" : "unseen");
      if (!all && saved.batches[saved.position + 1]) return remember({ ...saved, position: saved.position + 1, openedAt: Date.now() });
      const batch = currentBatch(saved);
      return build(scope, saved, all ? "all" : batch.mode, all ? undefined : batch.mode === "all" ? batch.cursor : undefined);
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
      const key = currentBatch(state).sessionKey;
      const session = await storage.getValue<import("@/lib/pictopia/explore").ExploreSession>(key);
      if (session && session.ids.length && meaningfulReview(session)) return { ...state, openedAt: Math.max(state.openedAt, (await storage.getValue<number>(`activity:${key}`)) ?? 0) };
    }
    return undefined;
  },
  async savedScopes() { return (await storage.getValue<PhotoCollection[]>(INDEX)) ?? []; },
};
