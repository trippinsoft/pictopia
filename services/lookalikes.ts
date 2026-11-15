import { groupLookalikes, type LookalikeCandidate, type LookalikeGroup } from "@/lib/pictopia/lookalikes";
import type { Media } from "@/lib/pictopia/types";
import { lookalikePrints } from "./lookalike-prints";
import { serialize, storage } from "./repository";

/** Duplicate Hunt's saved result: the groups from the last scan. Members are read live, so
 * deleted or removed photos simply drop out. */
export interface LookalikeIndex {
  groups: LookalikeGroup[];
  builtAt: number;
  /** Photos printed so far, and photos whose preview couldn't be read on this device. */
  printed: number;
  unreadable: number;
}
export interface ScanProgress { done: number; total: number }
/** One group as shown: its live members (oldest first) and which are discarded. */
export interface GroupView {
  group: LookalikeGroup;
  items: Media[];
  discarded: number;
}
const KEY = "lookalikes:v1";
const BATCH_KEY = "lookalikeBatch:v1";
const REVIEWED_KEY = "lookalikeReviewed:v1";
/** Sets shown at a time. Big libraries can have hundreds; a short batch stays quick and calm. */
export const BATCH_SIZE = 50;
export interface Batch {
  views: GroupView[];
  /** Ids of sets in this batch already reviewed. */
  reviewed: Set<string>;
  /** Unreviewed sets waiting after this batch (-1 when not recounted). */
  waiting: number;
}
const isReviewed = (g: LookalikeGroup, reviewed: Record<string, number>) => (reviewed[g.id] ?? 0) >= g.ids.length;
const reviewedIn = (views: GroupView[], reviewed: Record<string, number>) =>
  new Set(views.filter(v => isReviewed(v.group, reviewed)).map(v => v.group.id));
const PAGE = 400;
const BATCH = 24;
/** A preview that couldn't be read is tried again a day later, not on every visit. */
const RETRY_FAILED_MS = 24 * 60 * 60_000;
/** Groups handed to a screen, so a set opened from the list is always found again. */
const shown = new Map<string, LookalikeGroup>();
let running: Promise<{ index: LookalikeIndex; changed: boolean }> | undefined;
let listener: ((progress: ScanProgress) => void) | undefined;
let latest: ScanProgress | undefined;

const candidate = (m: Media): LookalikeCandidate | undefined => m.look?.print && m.look.v === m.modified && !m.deletedAt
  ? { id: m.id, created: m.created, width: m.width, height: m.height, print: m.look.print, sharpness: m.look.sharpness, favorite: m.favorite || m.systemFavorite, size: m.size ?? m.scan?.size }
  : undefined;
const needsPrint = (m: Media, now: number) => !m.deletedAt && !candidate(m) &&
  !(m.look?.failed && m.look.v === m.modified && now - (m.look.at ?? 0) < RETRY_FAILED_MS);
const sameGroups = (a: LookalikeGroup[], b: LookalikeGroup[]) =>
  a.length === b.length && a.every((g, i) => g.id === b[i].id && g.ids.join() === b[i].ids.join());

export const lookalikeStore = {
  /** False on installed builds made before Duplicate Hunt's preview reader existed. */
  available: lookalikePrints.available,
  saved: () => storage.getValue<LookalikeIndex>(KEY),
  /** Prints every photo without a current print (newest first), then groups the whole
   * library once and saves the result before anything is shown. Resumable: prints are saved
   * as it goes. When nothing new needs printing the saved groups are returned untouched.
   * Only one scan runs at a time. Never decides, downloads or deletes anything. */
  scan(onProgress: (progress: ScanProgress) => void) {
    listener = onProgress;
    if (latest) onProgress(latest);
    running ??= scanOnce(p => { latest = p; listener?.(p); }).finally(() => { running = undefined; latest = undefined; });
    return running;
  },
  /** The screen went away; the scan carries on quietly and is picked up on return. */
  unlisten(onProgress: (progress: ScanProgress) => void) { if (listener === onProgress) listener = undefined; },
  /** Live members of each group; a group needs at least two photos still in the library. */
  async view(groups: LookalikeGroup[]): Promise<GroupView[]> {
    const ids = [...new Set(groups.flatMap(g => g.ids))];
    const byId = new Map<string, Media>();
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      for (const m of await storage.query({ ids: chunk, limit: chunk.length })) byId.set(m.id, m);
    }
    const out: GroupView[] = [];
    for (const group of groups) {
      const items = group.ids.map(id => byId.get(id)).filter((m): m is Media => !!m?.active && !m.deletedAt);
      if (items.length >= 2) { shown.set(group.id, group); out.push({ group, items, discarded: items.filter(m => m.decision === "delete").length }); }
    }
    return out;
  },
  /** The current batch: up to BATCH_SIZE sets, frozen in order while the screen is open.
   * Each time it's rebuilt (opening Duplicate Hunt, or asking for the next sets) reviewed
   * sets leave and the next unreviewed ones fill the gaps, newest first. */
  async batch(index: LookalikeIndex): Promise<Batch> {
    const reviewed = (await storage.getValue<Record<string, number>>(REVIEWED_KEY)) ?? {};
    const previous = (await storage.getValue<{ ids: string[] }>(BATCH_KEY))?.ids ?? [];
    const byId = new Map(index.groups.map(g => [g.id, g]));
    const open = (g: LookalikeGroup) => !isReviewed(g, reviewed);
    const kept = previous.map(id => byId.get(id)).filter((g): g is LookalikeGroup => !!g && open(g));
    const keptIds = new Set(kept.map(g => g.id));
    const candidates = [...kept, ...index.groups.filter(g => !keptIds.has(g.id) && open(g))];
    const views: GroupView[] = [];
    let used = 0;
    // Sets whose photos were deleted meanwhile are skipped, so the batch is full when it can be.
    while (views.length < BATCH_SIZE && used < candidates.length) {
      const chunk = candidates.slice(used, used + BATCH_SIZE);
      used += chunk.length;
      for (const v of await lookalikeStore.view(chunk)) if (views.length < BATCH_SIZE) views.push(v);
    }
    await storage.setValue(BATCH_KEY, { ids: views.map(v => v.group.id) });
    return { views, reviewed: reviewedIn(views, reviewed), waiting: Math.max(0, candidates.length - used) };
  },
  /** Live members for the sets already on screen, in the same order. */
  async refresh(views: GroupView[]): Promise<Batch> {
    const reviewed = (await storage.getValue<Record<string, number>>(REVIEWED_KEY)) ?? {};
    const fresh = new Map((await lookalikeStore.view(views.map(v => v.group))).map(v => [v.group.id, v]));
    const next = views.map(v => fresh.get(v.group.id)).filter((v): v is GroupView => !!v);
    return { views: next, reviewed: reviewedIn(next, reviewed), waiting: -1 };
  },
  /** Leaving a set marks it reviewed; it stays (with a check) until the batch is rebuilt.
   * A set that later gains new photos comes back. */
  async markReviewed(group: LookalikeGroup) {
    const reviewed = (await storage.getValue<Record<string, number>>(REVIEWED_KEY)) ?? {};
    if ((reviewed[group.id] ?? 0) >= group.ids.length) return;
    await storage.setValue(REVIEWED_KEY, { ...reviewed, [group.id]: group.ids.length });
  },
  /** The next set in the batch that hasn't been reviewed yet, after `id`. */
  async nextInBatch(id: string): Promise<string | undefined> {
    const ids = (await storage.getValue<{ ids: string[] }>(BATCH_KEY))?.ids ?? [];
    const reviewed = (await storage.getValue<Record<string, number>>(REVIEWED_KEY)) ?? {};
    const at = ids.indexOf(id);
    const order = [...ids.slice(at + 1), ...ids.slice(0, Math.max(0, at))];
    for (const other of order) {
      const g = shown.get(other);
      if (g && !isReviewed(g, reviewed)) return other;
    }
    return undefined;
  },
  async group(id: string): Promise<GroupView | undefined> {
    const group = shown.get(id) ?? (await storage.getValue<LookalikeIndex>(KEY))?.groups.find(g => g.id === id);
    return group ? (await lookalikeStore.view([group]))[0] : undefined;
  },
};

async function scanOnce(onProgress: (progress: ScanProgress) => void): Promise<{ index: LookalikeIndex; changed: boolean }> {
  const now = Date.now();
  const known = new Map<string, LookalikeCandidate>();
  const missing: Media[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const rows = await storage.query({ type: "photo", order: "newest", offset, limit: PAGE });
    for (const m of rows) {
      const c = candidate(m);
      if (c) known.set(m.id, c);
      else if (needsPrint(m, now)) missing.push(m);
    }
    if (rows.length < PAGE) break;
  }
  const saved = await storage.getValue<LookalikeIndex>(KEY);
  // Nothing new since the last grouping: keep the saved sets exactly as they are.
  if (saved && !missing.length && saved.printed === known.size) return { index: saved, changed: false };
  let unreadable = 0;
  if (missing.length) onProgress({ done: 0, total: missing.length });
  for (let start = 0; start < missing.length; start += BATCH) {
    const batch = missing.slice(start, start + BATCH);
    const prints = await lookalikePrints.prints(batch.map(m => m.id)).catch(() => ({} as Awaited<ReturnType<typeof lookalikePrints.prints>>));
    await serialize(async () => {
      const updated: Media[] = [];
      for (const m of batch) {
        const latest = await storage.get(m.id);
        if (!latest || latest.modified !== m.modified) continue;
        const p = prints[m.id];
        const next: Media = { ...latest, look: p ? { v: m.modified, print: p.print, sharpness: p.sharpness } : { v: m.modified, failed: true, at: now } };
        updated.push(next);
        const c = candidate(next);
        if (c) known.set(m.id, c); else unreadable++;
      }
      await storage.put(updated);
    });
    onProgress({ done: Math.min(missing.length, start + batch.length), total: missing.length });
    await new Promise(r => setTimeout(r, 0));
  }
  const groups = groupLookalikes([...known.values()]);
  const index: LookalikeIndex = { groups, builtAt: Date.now(), printed: known.size, unreadable: unreadable + (saved && !missing.length ? saved.unreadable : 0) };
  await storage.setValue(KEY, index);
  return { index, changed: !saved || !sameGroups(saved.groups, groups) };
}
