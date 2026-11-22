import { storage, serialize } from "./repository";
import { deletionBlocked, exploreStoreFor, visibleIds } from "./explore";
import { adventureSize, meaningfulReview } from "@/lib/pictopia/adventures";
import { isSweepScreenshot } from "@/lib/pictopia/photo-eligibility";
import { createExplore, migrateExplore, reduceExplore } from "@/lib/pictopia/explore";
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
export type CollectionGroup = { offset: number; count: number; total: number };
interface Batch {
  sessionKey: string;
  mode: "unseen" | "all";
  cursor?: { created: number; id: string };
  hasMore?: boolean;
  replayStart?: number;
  browse?: true;
  group?: CollectionGroup;
}
export interface CollectionReview { scope: PhotoCollection; batches: Batch[]; position: number; continuePosition?: number; openedAt: number; sizeOrderVersion?: number; /** Albums: the name shown when opened. */ title?: string }
const INDEX = "photoCollections:v1";
const metaKey = (scope: PhotoCollection) => `photoCollection:${scope}`;
export const currentBatch = (state: CollectionReview) => state.batches[state.position];
const sameBrowsePass = (batch: Batch, other?: Batch) =>
  !!batch.browse && !!other?.browse && other.replayStart === batch.replayStart;
export function hasPreviousCollectionGroup(state: CollectionReview) {
  return sameBrowsePass(currentBatch(state), state.batches[state.position - 1]);
}
export function isPhotoCollection(value: string): value is PhotoCollection {
  return value === "recents" || value === "recent" || value === "screenshots" || value === "favorites" || value === "videos" || value === "videos-large" || value === "unknown" || /^album:.+/.test(value) || /^month:\d{4}-(0[1-9]|1[0-2])$/.test(value) || /^year:\d{4}$/.test(value);
}
const isSortedCollection = (scope: PhotoCollection) =>
  scope === "recent" || scope === "videos" || scope === "videos-large";
export const canReviewAgain = (scope: PhotoCollection) => isSortedCollection(scope) || scope === "screenshots";

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
async function countBrowseItems(scope: PhotoCollection, blocked: Set<string>) {
  const query = collectionQuery(scope);
  const { total } = await storage.count(query);
  if (!blocked.size) return total;
  return total - (await storage.count({ ...query, ids: [...blocked] })).total;
}

/** Read older batches only once to give existing saved positions an absolute offset. */
async function withCollectionGroups(state: CollectionReview): Promise<CollectionReview> {
  const batch = currentBatch(state);
  if (!batch.browse || batch.group) return state;
  const start = batch.replayStart ?? state.position;
  const batches = state.batches.slice();
  let offset = 0;
  let total = await countBrowseItems(state.scope, await deletionBlocked());
  for (let position = start; position <= state.position; position++) {
    const item = batches[position];
    const count = item.group?.count ??
      (await storage.getValue<ReturnType<typeof createExplore>>(item.sessionKey))?.ids.length ?? 0;
    total = Math.max(total, offset + count + (item.hasMore ? 1 : 0));
    batches[position] = { ...item, group: { offset, count, total } };
    offset += count;
  }
  if (batch.hasMore === false) total = offset;
  return { ...state, batches: batches.map(item => withBrowseTotal(batch, item, total)) };
}
function withBrowseTotal(batch: Batch, item: Batch, total: number) {
  return sameBrowsePass(batch, item) && item.group && item.group.total !== total
    ? { ...item, group: { ...item.group, total } }
    : item;
}
async function build(
  scope: PhotoCollection, saved?: CollectionReview, mode: Batch["mode"] = "unseen",
  cursor?: Batch["cursor"], replayStart?: number, browse?: { resumeId?: string; emptyPosition?: number },
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
    const candidates = page.filter(included);
    // The sorted shelves can open from the synced index, like Recents. The viewer
    // resolves permission and availability as each item loads.
    const visible = browse ? undefined : new Set(await visibleIds(candidates.map(m => m.id)));
    for (const item of candidates) {
      if (visible && !visible.has(item.id)) continue;
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
  if (!rows.length && saved && browse && !startingSequence) {
    return endBrowseGroup({ ...saved, position: browse.emptyPosition ?? saved.position });
  }
  if (!rows.length && saved && !startingSequence && !switchingToUnseen && (!repeatable(scope) || !!cursor)) {
    return remember({ ...saved, openedAt: Date.now() });
  }
  let group: CollectionGroup | undefined;
  if (browse) {
    if (saved && !startingSequence) saved = await withCollectionGroups(saved);
    const previous = saved && !startingSequence ? currentBatch(saved).group : undefined;
    const offset = previous ? previous.offset + previous.count : 0;
    const total = previous?.total ?? await countBrowseItems(scope, blocked);
    group = { offset, count: rows.length, total: hasMore ? Math.max(total, offset + rows.length + 1) : offset + rows.length };
  }
  return saveBatch(scope, rows, saved, mode, after, lookAhead ? hasMore : undefined, replayStart, browse, group);
}

function saveBatch(
  scope: PhotoCollection, rows: Media[], saved: CollectionReview | undefined,
  mode: Batch["mode"], cursor?: Batch["cursor"], hasMore?: boolean, replayStart?: number, browse?: { resumeId?: string }, group?: CollectionGroup,
) {
  const sessionKey = `collection:${scope}:${Date.now()}-${Math.random().toString(36).slice(2)}:explore`;
  const ids = rows.map(m => m.id);
  const session = { ...createExplore(ids), review: true, instructionsDismissed: true, ...(rows.length ? {} : { finished: true }) };
  if (browse?.resumeId && ids.includes(browse.resumeId)) session.activeId = browse.resumeId;
  const batch: Batch = { sessionKey, mode, cursor, ...(browse ? { browse: true, group } : {}), ...(hasMore !== undefined ? { hasMore } : {}), ...(replayStart !== undefined ? { replayStart } : {}) };
  const position = saved?.batches.length ?? 0;
  const earlier = saved?.batches ?? [];
  const batches = [...(group ? earlier.map(item => withBrowseTotal(batch, item, group.total)) : earlier), batch];
  const state: CollectionReview = { ...saved, scope, batches, position, openedAt: Date.now(), ...(scope === "videos-large" ? { sizeOrderVersion: 1 } : {}) };
  if (browse || (canReviewAgain(scope) && mode === "unseen")) state.continuePosition = position;
  return remember(state, session);
}
async function endBrowseGroup(saved: CollectionReview) {
  const state = await withCollectionGroups(saved);
  const batch = currentBatch(state);
  const group = batch.group && { ...batch.group, total: batch.group.offset + batch.group.count };
  const batches = state.batches.map((item, i) => i === state.position
    ? { ...item, hasMore: false, group }
    : group ? withBrowseTotal(batch, item, group.total) : item);
  return remember({ ...state, batches, openedAt: Date.now() });
}

async function availableBrowseGroup(batch: Batch) {
  const previous = await storage.getValue<Parameters<typeof migrateExplore>[0]>(batch.sessionKey);
  if (!previous?.ids.length) return undefined;
  const rows = await storage.query({ ids: previous.ids, limit: previous.ids.length });
  const count = rows.filter(m => !m.deletedAt).length;
  return count ? { previous, count } : undefined;
}

async function openBrowseGroup(saved: CollectionReview, position: number) {
  const state = { ...saved, position, continuePosition: position, openedAt: Date.now() };
  const available = await availableBrowseGroup(currentBatch(state));
  if (!available) return undefined;
  const { previous } = available;
  const session = migrateExplore(previous);
  const reopened = reduceExplore(session, { type: "revisit" });
  return remember(await withCollectionGroups(state), reopened !== session ? reopened : undefined);
}
async function nextBrowseGroup(saved: CollectionReview) {
  const batch = currentBatch(saved);
  let position = saved.position;
  while (sameBrowsePass(batch, saved.batches[position + 1])) {
    position++;
    const next = await openBrowseGroup(saved, position);
    if (next) return next;
  }
  return build(saved.scope, { ...saved, position }, "all", saved.batches[position].cursor, batch.replayStart, { emptyPosition: saved.position });
}

export const collectionStore = {
  async previousGroupCount(state: CollectionReview) {
    const batch = currentBatch(state);
    for (let earlier = state.position - 1; sameBrowsePass(batch, state.batches[earlier]); earlier--) {
      const available = await availableBrowseGroup(state.batches[earlier]);
      if (available) return available.count;
    }
    return 0;
  },
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
      if (isSortedCollection(scope)) {
        const batch = saved && currentBatch(saved);
        const previous = batch && await storage.getValue<Parameters<typeof migrateExplore>[0]>(batch.sessionKey);
        const session = previous && migrateExplore(previous);
        if (saved && batch?.browse && session?.ids.length && (!session.finished || batch.hasMore)) {
          if (!session.finished) {
            const rows = await storage.query({ ids: session.ids, limit: session.ids.length });
            if (rows.some(m => !m.deletedAt)) return remember({ ...await withCollectionGroups(saved), openedAt: Date.now() });
          }
          if (batch.hasMore) {
            const next = await nextBrowseGroup(saved);
            if (currentBatch(next).sessionKey !== batch.sessionKey) return next;
          }
        }
        // The old unseen-only snapshots stay on disk. Carry over the previous
        // position if the item still belongs to the opening batch.
        const resumeId = !batch?.browse && !session?.finished ? session?.activeId ?? undefined : undefined;
        return build(scope, saved, "all", undefined, saved?.batches.length ?? 0, { resumeId });
      }
      if (scope === "recents") {
        // Use the synced library index. The viewer checks access when it opens each asset.
        // A full Photos lookup here would hold up every visit, including an unchanged batch.
        const [latest, blocked, previous] = await Promise.all([
          recentRows(),
          deletionBlocked(),
          saved ? storage.getValue<Parameters<typeof migrateExplore>[0]>(currentBatch(saved).sessionKey) : undefined,
        ]);
        const rows = latest.filter(m => m.decision !== "delete" && !blocked.has(m.id));
        if (saved && previous && rows.length === previous.ids.length && rows.every((m, i) => m.id === previous.ids[i])) {
          const session = migrateExplore(previous);
          const resumed = reduceExplore(session, { type: "revisit" });
          return remember({ ...saved, openedAt: Date.now() }, resumed !== session ? resumed : undefined);
        }
        return saveBatch(scope, rows, saved, "all");
      }
      if (saved && currentBatch(saved).replayStart === undefined) {
        const session = await exploreStoreFor(currentBatch(saved).sessionKey).load();
        if (session && !session.finished) {
          const rows = await storage.query({ ids: session.ids, type: collectionQuery(scope).type, limit: COLLECTION_BATCH });
          const ids = rows.filter(m => !m.deletedAt).map(m => m.id);
          const active = session.activeId;
          if ((active && ids.includes(active) && (await visibleIds([active])).length) ||
              (await visibleIds(ids.filter(id => id !== active))).length) {
            return remember({ ...saved, openedAt: Date.now() });
          }
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
      if (batch.browse && !all) return nextBrowseGroup(saved);
      const following = saved.batches[saved.position + 1];
      if (!all && following && (!canReviewAgain(scope) || (batch.replayStart !== undefined && following.replayStart === batch.replayStart))) {
        return remember({ ...saved, position: saved.position + 1, openedAt: Date.now() });
      }
      return build(scope, saved, all ? "all" : batch.mode, all ? undefined : batch.mode === "all" ? batch.cursor : undefined, batch.replayStart);
    });
  },
  async previous(scope: PhotoCollection, fromKey?: string) {
    return serialize(async () => {
      const stored = await storage.getValue<CollectionReview>(metaKey(scope));
      if (!stored) return undefined;
      const position = fromKey ? stored.batches.findIndex(batch => batch.sessionKey === fromKey) : stored.position;
      if (position < 0) return undefined;
      const saved = { ...stored, position };
      const batch = currentBatch(saved);
      if (batch.browse) {
        for (let earlier = position - 1; sameBrowsePass(batch, saved.batches[earlier]); earlier--) {
          const previous = await openBrowseGroup(saved, earlier);
          if (previous) return previous;
        }
        return undefined;
      }
      return remember({ ...saved, position: Math.max(0, position - 1), openedAt: Date.now() });
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
      if ((state.batches[position].browse || state.batches[position].replayStart === undefined) && session && session.ids.length && meaningfulReview(session)) return { ...state, position, openedAt: Math.max(state.openedAt, (await storage.getValue<number>(`activity:${key}`)) ?? 0) };
    }
    return undefined;
  },
  async savedScopes() { return (await storage.getValue<PhotoCollection[]>(INDEX)) ?? []; },
};
