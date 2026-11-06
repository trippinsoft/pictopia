import { storage } from "./storage";
import { recordActivity, type Activity, type ActivityEvent } from "@/lib/pictopia/daily";
import {
  Media,
  Session,
  Decision,
  Collection,
  Preferences,
  defaultPreferences,
  Query,
  Group,
  SessionMinutes,
  DeletionAttempt,
  PendingDeletion,
} from "@/lib/pictopia/types";
import {
  identity,
  applyDecision,
  undoDecision,
  shuffle,
  dateKeys,
  bestScore,
  similar,
  SCAN_VERSION,
} from "@/lib/pictopia/logic";
import { sessionTally } from "@/lib/pictopia/sessions";
import { qualifiedEncounterTime } from "@/lib/pictopia/photo-encounter";
export { storage };
let tail = Promise.resolve();
export function serialize<T>(work: () => Promise<T>) {
  const next = tail.then(work, work);
  tail = next.then(
    () => {},
    () => {},
  );
  return next;
}
export const DELETION_ATTEMPT = "deletionAttempt",
  DELETION_PENDING = "deletionPending",
  CONFIRMED_CLEANUP = "confirmedCleanup";
/**
 * Call inside serialize(). Items in an in-flight OS deletion cannot change decision. When
 * `release` is set, items awaiting deletion verification stop being tracked because the user
 * no longer wants them deleted; the returned values must be saved with the media change.
 */
export async function deletionGuard(ids: string[], release: boolean) {
  const attempt = await storage.getValue<DeletionAttempt | null>(DELETION_ATTEMPT);
  if (attempt?.ids?.some((id) => ids.includes(id)))
    throw Error("This item is part of a deletion that is still being checked. Try again shortly.");
  if (!release) return {};
  const pending = (await storage.getValue<PendingDeletion[]>(DELETION_PENDING)) ?? [];
  const next = pending.filter((p) => !ids.includes(p.id));
  return next.length === pending.length ? {} : { [DELETION_PENDING]: next };
}
/** Called within the repository serializer, including adventure transactions. */
export async function firstSeenUpdates(ids: string[], at = Date.now()) {
  const updates: Media[] = [];
  for (const id of new Set(ids)) {
    const m = await storage.get(id);
    // Videos keep their own first-seen record too; photo progress queries count photos only.
    if (m && (!m.firstSeenAt || at < m.firstSeenAt)) updates.push({ ...m, firstSeenAt: at });
  }
  return updates;
}
export const DAILY_ACTIVITY = "dailyActivity:v1";

/** Activity values for a meaningful encounter or mark, to merge into the same atomic
 * `storage.put` as the first-seen update. Must run inside the repository serializer, and
 * before the first-seen update is written, so "first time" is judged correctly. */
export async function activityValues(ids: string[], at: number, marked = false) {
  if (!ids.length) return {};
  const events: ActivityEvent[] = [];
  for (const id of new Set(ids)) {
    const m = await storage.get(id);
    if (m) events.push({ type: "view", id, video: m.type === "video", firstTime: !m.firstSeenAt, marked });
  }
  return { [DAILY_ACTIVITY]: recordActivity(await storage.getValue<Activity>(DAILY_ACTIVITY), events, at) };
}
export async function deletionActivityValues(count: number, at = Date.now()) {
  if (!count) return {};
  return { [DAILY_ACTIVITY]: recordActivity(await storage.getValue<Activity>(DAILY_ACTIVITY), [{ type: "deleted", count }], at) };
}

export const repository = {
  async touchSession(id: string) {
    return serialize(async () => {
      const s = await storage.getValue<Session>("session");
      if (!s || s.id !== id || s.complete) return;
      const next = { ...s, activeAt: Date.now() };
      await storage.put([], { session: next, [`session:${id}`]: next });
    });
  },
  /** displayedAt is emitted only after the foreground visibility dwell has completed.
   * Such an event remains valid if another save advances the session before it commits. */
  async encounter(id: string, sessionId?: string, displayedAt?: number) {
    return serialize(async () => {
      const current = sessionId ? await storage.getValue<Session>("session") : undefined;
      const s = sessionId && current?.id !== sessionId ? await storage.getValue<Session>(`session:${sessionId}`) : current;
      const qualified = qualifiedEncounterTime(displayedAt, s?.started);
      if (displayedAt !== undefined && !qualified) return;
      if (sessionId && (!s || s.id !== sessionId || !s.ids.includes(id) || (!qualified && (current?.id !== sessionId || s.complete || s.ids[s.position] !== id)))) return;
      const at = displayedAt ?? Date.now();
      const next = s ? { ...s, activeAt: Math.max(s.activeAt ?? s.started ?? 0, at) } : undefined;
      const daily = await activityValues([id], at);
      await storage.put(await firstSeenUpdates([id], at), { ...daily, ...(next ? { ...(current?.id === next.id ? { session: next } : {}), [`session:${next.id}`]: next } : {}) });
    });
  },
  async migrateProgress() {
    return serialize(async () => {
      if (await storage.getValue<boolean>("libraryProgress:migrated")) return;
      await storage.migrateSeen();
      const index = await storage.getValue<import("@/lib/pictopia/adventures").AdventureIndex>("adventures:v1");
      for (const id of new Set([...(index?.started ?? []), ...(index?.slots ?? []), ...(index?.parked ?? [])])) {
        const s = await storage.getValue<import("@/lib/pictopia/explore").ExploreSession>(`adventure:${id}:explore`);
        const ids = (s?.ids ?? []).filter(id => s?.records?.[id]?.encountered);
        await storage.put(await firstSeenUpdates(ids));
      }
      // Decisions in classic history remain evidence even after Undo cleared the current decision.
      for (const id of (await storage.getValue<string[]>("sessionHistory")) ?? []) {
        const s = await storage.getValue<Session>(`session:${id}`);
        await storage.put(await firstSeenUpdates(s?.history?.map(h => h.id) ?? []));
      }
      await storage.setValue("libraryProgress:migrated", true);
    });
  },
  async update(id: string, fn: (m: Media) => Media) {
    return serialize(async () => {
      const latest = await storage.get(id);
      if (latest) await storage.put([fn(latest)]);
    });
  },
  async ingest(items: Media[], epoch: number) {
    return serialize(async () => {
      const merged: Media[] = [];
      const seen: Record<string, unknown> = {};
      let invalidated = false;
      for (const m of items) {
        const old = await storage.get(m.id);
        const same = old && identity(old) === identity(m);
        if (old && (!same || old.modified !== m.modified)) invalidated = true;
        merged.push(
          same
            ? {
                ...m,
                firstSeenAt: old.firstSeenAt,
                favorite: old.favorite,
                decision: old.decision,
                size: m.size ?? (old.modified === m.modified ? old.size : undefined),
                systemFavorite: m.systemFavorite ?? old.systemFavorite,
                // A transient metadata failure must not unclassify a known screenshot.
                screenshot: m.screenshot || old.screenshot,
                scan: old.modified === m.modified ? old.scan : undefined,
                scanError: old.modified === m.modified ? old.scanError : undefined,
              }
            // Editing dimensions or correcting a capture date does not make a library ID
            // unexplored again. Decision/analysis invalidation retains its existing rules.
            : { ...m, firstSeenAt: old?.firstSeenAt },
        );
        seen[`seen:${m.id}`] = epoch;
      }
      if (invalidated) seen.groups = [];
      await storage.put(merged, seen);
    });
  },
  async reconcile(epoch: number) {
    let offset = 0;
    for (;;) {
      const page = await storage.query({ limit: 200, offset });
      if (!page.length) break;
      const missing: Media[] = [];
      for (const m of page)
        if ((await storage.getValue<number>(`seen:${m.id}`)) !== epoch)
          missing.push({ ...m, active: false });
      await serialize(async () => {
        const updated: Media[] = [];
        for (const m of missing) {
          const latest = await storage.get(m.id);
          if (latest) updated.push({ ...latest, active: false });
        }
        await storage.put(updated, updated.length ? { groups: [] } : {});
      });
      offset += page.length - missing.length;
    }
  },
  async preferences() {
    return { ...defaultPreferences, ...(await storage.getValue<Preferences>("preferences")) };
  },
  async start(
    collection: Collection,
    prefs: Preferences,
    pro = false,
    minutes: SessionMinutes = 5,
  ) {
    return serialize(async () => {
      const active = await storage.getValue<Session>("session");
      if (active && !active.complete && active.collection === collection) return active;
      const history = (await storage.getValue<string[]>("sessionHistory")) ?? [];
      if (active?.id && !history.includes(active.id)) history.push(active.id);
      const archive = active ? { [`session:${active.id}`]: active } : {};
      const resumeFrom = (await storage.getValue<number>("sessionResumeFrom")) ?? 0;
      for (const id of history.slice(resumeFrom).reverse()) {
        const saved = id === active?.id ? active : await storage.getValue<Session>(`session:${id}`);
        if (saved?.collection === collection && !saved.complete) {
          const resumed = { ...saved, activeAt: Date.now() };
          await storage.put([], { ...archive, session: resumed, [`session:${id}`]: resumed });
          return resumed;
        }
      }
      if (![2, 5, 10].includes(minutes)) throw Error("Choose a 2, 5, or 10-minute session.");
      const smart = ["quick", "memory", "best"].includes(collection);
      const target = minutes * 6;
      let sessionGroups: Group[] = [];
      let query: Query = {
        limit: 200,
        unreviewed: smart || !prefs.showReviewed,
        excludeFavorites: !prefs.includeFavorites,
      };
      if (collection.startsWith("month:")) query.month = collection.slice(6);
      if (collection === "today") {
        query.day = dateKeys(Date.now()).day;
        query.before = new Date(new Date().getFullYear(), 0, 1).getTime();
      }
      if (collection === "memory") {
        query.order = "oldest";
        query.limit = target;
      }
      if (collection === "blurry") query.blurry = true;
      if (collection === "screenshots") query.screenshot = true;
      if (collection === "videos" || collection === "large") query.type = "video";
      if (collection === "large") query.order = "size";
      if (collection === "favorites") {
        query.favorite = true;
        query.excludeFavorites = false;
      }
      if (collection.startsWith("group:")) {
        const groups = (await storage.getValue<Group[]>("groups")) ?? [];
        query.ids = groups.find((g) => g.id === collection.slice(6))?.ids ?? [];
        query.unreviewed = false;
        query.excludeFavorites = false;
      }
      let items = await storage.query(query);
      if (collection === "today")
        items = items.filter((m) => new Date(m.created).getFullYear() < new Date().getFullYear());
      if (collection === "quick" || collection === "best") {
        const shots = await storage.query({ ...query, screenshot: true, limit: target });
        const cached = pro ? ((await storage.getValue<Group[]>("groups")) ?? []) : [];
        // Only use still-accessible groups with analysis matching current originals.
        for (const g of cached) {
          if (sessionGroups.reduce((n, group) => n + group.ids.length, 0) >= target * 2) break;
          const rows = await storage.query({ ids: g.ids.slice(0, 200), limit: 200 });
          if (
            rows.length !== g.ids.length ||
            rows.some((m) => m.scan?.version !== `${SCAN_VERSION}:${m.modified}`)
          )
            continue;
          if (
            rows.filter(
              (m) => !m.decision && (!query.excludeFavorites || (!m.favorite && !m.systemFavorite)),
            ).length < 1
          )
            continue;
          sessionGroups.push(g);
        }
        const groups = sessionGroups;
        const ids = groups.flatMap((g) => g.ids.filter((id) => id !== g.best)).slice(0, 60);
        const suggestions = ids.length ? await storage.query({ ...query, ids, limit: target }) : [];
        const old = await storage.query({ ...query, order: "oldest", limit: target });
        const large = pro ? await storage.query({ ...query, order: "size", limit: target }) : [];
        items = Array.from(
          new Map([...shots, ...suggestions, ...old, ...large].map((m) => [m.id, m])).values(),
        ).slice(0, target);
        if (collection === "best") {
          const groupedIds = groups.flatMap((g) => [
            g.best,
            ...g.ids.filter((id) => id !== g.best),
          ]);
          const rows = await storage.query({ ...query, ids: groupedIds, limit: target * 2 });
          const byId = new Map(rows.map((m) => [m.id, m]));
          items = Array.from(new Set(groupedIds))
            .flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []))
            .slice(0, target);
        }
      }
      if (collection === "random") {
        const count = (await storage.stats()).total;
        const offset = Math.floor(Math.random() * Math.max(1, count - 200));
        items = await storage.query({ ...query, offset });
        if (!items.length) items = await storage.query(query);
        items = shuffle(items, Date.now());
      }
      const session: Session = {
        id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        collection,
        ids: items.map((m) => m.id),
        position: 0,
        reviewed: 0,
        kept: 0,
        marked: 0,
        started: Date.now(),
        ...(smart ? { minutes, elapsedMs: 0, groups: sessionGroups } : {}),
        history: [],
        complete: items.length === 0,
      };
      await storage.put([], {
        ...archive,
        session,
        [`session:${session.id}`]: session,
        sessionHistory: [...history, session.id],
      });
      return session;
    });
  },
  async addTime(id: string, milliseconds: number) {
    return serialize(async () => {
      const s = await storage.getValue<Session>("session");
      if (!s || s.id !== id || s.complete || (!s.minutes && s.collection !== "quick")) return s;
      const elapsedMs = Math.min(
        (s.minutes ?? 5) * 60000,
        (s.elapsedMs ?? 0) + Math.max(0, Math.min(5000, milliseconds)),
      );
      if (elapsedMs === s.elapsedMs) return s;
      const next = { ...s, minutes: s.minutes ?? 5, elapsedMs };
      await storage.put([], { session: next, [`session:${s.id}`]: next });
      return next;
    });
  },
  async finish(id: string) {
    return serialize(async () => {
      const s = await storage.getValue<Session>("session");
      if (!s || s.id !== id) return s;
      const next = { ...s, complete: true, finishedEarly: s.position < s.ids.length };
      await storage.put([], { session: next, [`session:${s.id}`]: next });
      return next;
    });
  },
  async decide(decision: Decision, expectedId?: string) {
    return serialize(async () => {
      const s = await storage.getValue<Session>("session");
      if (!s) throw Error("Start a review first.");
      // A decision is bound to the item the user saw, never to whatever is current now.
      if (expectedId !== undefined && s.ids[s.position] !== expectedId)
        throw Error("This photo is no longer the current item.");
      const m = await storage.get(s.ids[s.position]);
      if (!m?.active) throw Error("This item is no longer accessible. Skip it to continue.");
      const next = applyDecision({ ...s, activeAt: Date.now() }, { ...m, ...(m.type === "photo" ? { firstSeenAt: m.firstSeenAt ?? Date.now() } : {}) }, decision);
      const values = await deletionGuard([m.id], decision !== "delete");
      await storage.put([next.media], {
        ...values,
        session: next.session,
        [`session:${s.id}`]: next.session,
      });
      return next.session;
    });
  },
  async undo() {
    return serialize(async () => {
      const s = await storage.getValue<Session>("session");
      const last = s?.history.at(-1);
      if (!s || !last) return s;
      const m = await storage.get(last.id);
      if (!m?.active) throw Error("This item is no longer available to undo.");
      const next = undoDecision(s, m);
      const values = await deletionGuard([m.id], next.media.decision !== "delete");
      await storage.put([next.media], {
        ...values,
        session: next.session,
        [`session:${s.id}`]: next.session,
      });
      return next.session;
    });
  },
  async skip(expectedId?: string) {
    return serialize(async () => {
      const s = await storage.getValue<Session>("session");
      if (!s || s.complete) return s;
      if (expectedId !== undefined && s.ids[s.position] !== expectedId)
        throw Error("This photo is no longer the current item.");
      const next = { ...s, position: s.position + 1, complete: s.position + 1 >= s.ids.length };
      await storage.put([], { session: next, [`session:${next.id}`]: next });
      return next;
    });
  },
  async restore(ids: string[]) {
    return serialize(async () => {
      const values = await deletionGuard(ids, true);
      const items: Media[] = [];
      for (const id of ids) {
        const m = await storage.get(id);
        if (m) items.push({ ...m, decision: undefined });
      }
      await storage.put(items, values);
    });
  },
  /** Sets or clears one item's decision outside the swipe flow; session history is unchanged. */
  async setDecision(id: string, decision: Decision | undefined) {
    return serialize(async () => {
      const m = await storage.get(id);
      if (!m?.active) throw Error("This item is no longer available.");
      const values = await deletionGuard([id], decision !== "delete");
      await storage.put([{ ...m, decision }], values);
    });
  },
  async tally(session: Session) {
    const ids = Array.from(new Set(session.history.map((h) => h.id)));
    return sessionTally(session, await Promise.all(ids.map((id) => storage.get(id))));
  },
  async favorite(id: string) {
    return serialize(async () => {
      const m = await storage.get(id);
      if (m) await storage.put([{ ...m, favorite: !m.favorite }]);
    });
  },
  async retryScanErrors() {
    let offset = 0;
    for (;;) {
      const rows = await storage.query({ offset, limit: 200 });
      if (!rows.length) break;
      for (const m of rows)
        if (m.scanError) await this.update(m.id, (latest) => ({ ...latest, scanError: undefined }));
      offset += rows.length;
    }
  },
  async reset(clearScan = false) {
    let offset = 0;
    for (;;) {
      const rows = await storage.query({ offset, limit: 200 });
      if (!rows.length) break;
      await serialize(() =>
        storage.put(
          rows.map((m) =>
            clearScan
              ? { ...m, scan: undefined, scanError: undefined }
              : { ...m, decision: undefined },
          ),
        ),
      );
      offset += rows.length;
    }
    if (clearScan) {
      await storage.setValue("groups", []);
      await storage.setValue("scan", { status: "idle", processed: 0, total: 0, skipped: 0 });
    } else await serialize(async () => storage.put([], { session: null, sessionResumeFrom: ((await storage.getValue<string[]>("sessionHistory")) ?? []).length }));
  },
  async groups(signal?: AbortSignal) {
    const groups: Group[] = [];
    const hashGroups = new Map<string, { ids: string[]; best: string; score: number }>();
    let offset = 0,
      previous: Media[] = [];
    for (;;) {
      if (signal?.aborted) return (await storage.getValue<Group[]>("groups")) ?? [];
      const page = await storage.query({ offset, limit: 200, order: "oldest" });
      if (!page.length) break;
      for (const m of page) {
        if (m.scan?.version !== `${SCAN_VERSION}:${m.modified}`) continue;
        if (m.scan?.hash) {
          const existing = hashGroups.get(m.scan.hash) ?? {
            ids: [],
            best: m.id,
            score: bestScore(m),
          };
          existing.ids.push(m.id);
          if (bestScore(m) > existing.score) {
            existing.best = m.id;
            existing.score = bestScore(m);
          }
          hashGroups.set(m.scan.hash, existing);
        }
        if (m.type === "photo" && m.scan?.perceptual) {
          previous = previous.filter((p) => m.created - p.created <= 120000);
          const match = previous.find((p) => similar(p, m) && p.scan?.hash !== m.scan?.hash);
          if (match) {
            let g = groups.find((g) => g.kind === "similar" && g.ids.includes(match.id));
            if (!g) {
              g = { id: `similar-${match.id}`, kind: "similar", ids: [match.id], best: match.id };
              groups.push(g);
            }
            g.ids.push(m.id);
            const best = await storage.get(g.best);
            if (!best || bestScore(m) > bestScore(best)) g.best = m.id;
          }
          previous.push(m);
          if (previous.length > 50) previous.shift();
        }
      }
      offset += page.length;
      await new Promise((r) => setTimeout(r, 0));
    }
    for (const [hash, items] of hashGroups)
      if (items.ids.length > 1)
        groups.push({ id: `exact-${hash}`, kind: "exact", ids: items.ids, best: items.best });
    await storage.setValue("groups", groups);
    return groups;
  },
};
