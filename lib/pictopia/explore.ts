import type { Media } from "./types";

export const EXPLORE_LIMIT = 200;
export const EXPLORE_UNDO_LIMIT = 200;
export type ExploreDirection = "up" | "left" | "right";
export type DiscardDirection = "left" | "right";
export interface ExploreRecord {
  encountered: boolean;
  unavailable: boolean;
  discarded: boolean;
  changedAt: number;
  /** This mark is linked to the explicit deletion queue, not a legacy set-aside. */
  queued?: boolean;
}
/** An outstanding provisional discard and the side the photo left by. */
export interface ExploreDiscard {
  id: string;
  direction: DiscardDirection;
  previous?: ExploreRecord;
  previousDecision?: "keep";
}
export interface ExploreSession {
  version: 2;
  /** Browse the snapshot minus photos marked for deletion; finish only explicitly. */
  review?: boolean;
  /** A review the user explicitly ended with Done. Running out of photographs never
   * finishes a review: everything can still be restored from the trash. */
  finished?: boolean;
  /** The fixed snapshot in original order. The feed is derived from it, never stored. */
  ids: string[];
  /** Photo being shown, by stable ID; null is the completion page after the last photo. */
  activeId: string | null;
  revision: number;
  startedAt: number;
  instructionsDismissed: boolean;
  records: Record<string, ExploreRecord>;
  /** Outstanding discards, oldest first. Undo takes the latest. */
  history: ExploreDiscard[];
}
/** Sessions saved before discarded photos left the feed. */
interface ExploreSessionV1 {
  version: 1;
  ids: string[];
  position: number;
  revision: number;
  startedAt: number;
  instructionsDismissed: boolean;
  records: Record<string, ExploreRecord>;
  history: { id: string; position: number; previous?: ExploreRecord }[];
}
export type ExploreAction =
  /** Paging from `id` (the saved active photo) to `toId`, which must still be in the feed. */
  | {
      type: "page";
      id: string | null;
      revision: number;
      toId: string | null;
      availableIds: string[];
    }
  | { type: "discard"; id: string; revision: number; direction: DiscardDirection }
  /** Restores the latest outstanding discard; `id`, when given, must be that discard. */
  | { type: "undo"; id?: string }
  | { type: "back" }
  | { type: "seen"; id: string }
  | { type: "finish" }
  | { type: "restore"; id: string }
  | { type: "restoreAll" }
  | { type: "restart" }
  | { type: "dismissInstructions" };

/** Snapshot only references; never media copies or production decisions. */
export function selectExploreIds(items: Media[]) {
  return [
    ...new Map(
      items
        .filter((m) => m.active && !m.deletedAt && m.type === "photo" && m.decision !== "delete")
        .map((m) => [m.id, m]),
    ).values(),
  ]
    .sort((a, b) => b.created - a.created || b.id.localeCompare(a.id))
    .slice(0, EXPLORE_LIMIT)
    .map((m) => m.id);
}
export function createExplore(ids: string[], now = Date.now()): ExploreSession {
  const unique = [...new Set(ids)].slice(0, EXPLORE_LIMIT);
  return {
    version: 2,
    ids: unique,
    activeId: unique[0] ?? null,
    revision: 0,
    startedAt: now,
    instructionsDismissed: false,
    records: {},
    history: [],
  };
}
/** The vertical feed: the original order without the photos that are currently set aside.
 * A review leaves out exactly what is marked for deletion, so the trash is the one place a
 * marked photograph lives; legacy adventure-only marks are not deletions and stay in place. */
export function exploreFeed(s: Pick<ExploreSession, "ids" | "records" | "review">) {
  return s.ids.filter((id) =>
    s.review ? !s.records[id]?.queued : !s.records[id]?.discarded,
  );
}
/** After `id` leaves: the next remaining photo, else completion. Swiping away the last
 * photo ends the exploration; it never falls back to an earlier one. */
function survivor(ids: string[], records: Record<string, ExploreRecord>, id: string) {
  const i = ids.indexOf(id);
  const live = (other: string) => other !== id && !records[other]?.discarded;
  return ids.slice(i + 1).find(live) ?? null;
}
/** Upgrades a saved session. Older sessions kept discarded photos in the feed and
 * mixed page moves into undo; only their still-outstanding discards stay undoable. */
export function migrateExplore(s: ExploreSession | ExploreSessionV1): ExploreSession {
  if (s.version === 2) return s;
  const { position, history: legacy, ...rest } = s;
  const live = (id: string) => !s.records[id]?.discarded;
  const activeId =
    position >= s.ids.length
      ? null
      : (s.ids.slice(position).find(live) ??
        s.ids.slice(0, position).reverse().find(live) ??
        null);
  const history: ExploreDiscard[] = [];
  const seen = new Set<string>();
  for (const h of [...legacy].reverse()) {
    if (seen.has(h.id) || !s.records[h.id]?.discarded || h.previous?.discarded) continue;
    seen.add(h.id);
    // Old sessions didn't store the side; restored photos enter from the left.
    history.unshift({ id: h.id, direction: "left", ...(h.previous ? { previous: h.previous } : {}) });
  }
  return { ...rest, version: 2, activeId, history };
}
export function reduceExplore(
  s: ExploreSession,
  a: ExploreAction,
  now = Date.now(),
): ExploreSession {
  const next = { ...s, revision: s.revision + 1 };
  switch (a.type) {
    case "page": {
      if (a.revision !== s.revision || a.id !== s.activeId) return s;
      // A review has no page past its last photograph, and nothing to page through once
      // everything is marked for deletion.
      if (s.review && (a.toId === null || s.activeId === null)) return s;
      const feed = exploreFeed(s);
      const from = s.activeId === null ? feed.length : feed.indexOf(s.activeId);
      const to = a.toId === null ? feed.length : feed.indexOf(a.toId);
      if (from < 0 || to < 0 || to === from) return s;
      // Backward paging only revisits. Forward paging records each departed stable ID
      // in the same transaction, even if the native scroll crosses multiple pages.
      if (to < from) return { ...next, activeId: a.toId };
      const available = new Set(a.availableIds);
      const records = { ...s.records };
      for (const id of s.review ? feed.slice(from, from + 1) : feed.slice(from, to)) {
        const previous = records[id];
        records[id] = {
          encountered: available.has(id) || previous?.encountered === true,
          unavailable: !available.has(id) && !previous?.encountered,
          discarded: previous?.discarded ?? false,
          ...(previous?.queued !== undefined ? { queued: previous.queued } : {}),
          changedAt: now,
        };
      }
      return { ...next, activeId: a.toId, records };
    }
    case "discard": {
      if (a.revision !== s.revision || !s.ids.includes(a.id) || (s.review ? a.id !== s.activeId || s.records[a.id]?.queued : s.records[a.id]?.discarded))
        return s;
      const previous = s.records[a.id];
      const records = {
        ...s.records,
        [a.id]: { encountered: true, unavailable: false, discarded: true, ...(s.review ? { queued: true } : {}), changedAt: now },
      };
      const activeId = s.review
        ? (s.ids[s.ids.length - 1] === a.id ? null : reviewSurvivor(s.ids, records, a.id))
        : survivor(s.ids, records, a.id);
      return {
        ...next,
        activeId,
        // Running out of photographs is recorded as "not finished", so it is never mistaken
        // for a review that an older build ended with Done.
        ...(s.review && activeId === null ? { finished: false } : {}),
        records,
        history: [
          ...s.history.filter((h) => h.id !== a.id),
          { id: a.id, direction: a.direction, ...(previous ? { previous } : {}) },
        ].slice(-EXPLORE_UNDO_LIMIT),
      };
    }
    case "undo": {
      const last = s.history[s.history.length - 1];
      if (!last || (a.id !== undefined && a.id !== last.id)) return s;
      const records = { ...s.records };
      if (last.previous) records[last.id] = { ...last.previous, discarded: false, queued: false };
      else delete records[last.id];
      // Back in its original slot and shown, wherever the user had moved to. An undo from
      // the closing screen reopens the review on that photograph.
      return { ...next, activeId: last.id, finished: false, records, history: s.history.slice(0, -1) };
    }
    case "seen": {
      if (!s.review || a.id !== s.activeId || s.records[a.id]?.encountered) return s;
      return { ...next, records: { ...s.records, [a.id]: { ...s.records[a.id], encountered: true, unavailable: false, discarded: s.records[a.id]?.discarded ?? false, changedAt: now } } };
    }
    case "finish":
      return s.review ? { ...next, activeId: null, finished: true } : s;
    case "back": {
      const feed = exploreFeed(s);
      const i = s.activeId === null ? feed.length : feed.indexOf(s.activeId);
      return i > 0 ? { ...next, activeId: feed[i - 1], finished: false } : s;
    }
    case "restore": {
      if (!s.records[a.id]?.discarded) return s;
      return {
        ...next,
        // Restoring never moves the user, except when nothing was left to show: then the
        // returning photograph reopens the sequence where it belongs.
        ...(resumeOn(s, a.id) ? { activeId: a.id } : {}),
        records: { ...s.records, [a.id]: { ...s.records[a.id], discarded: false, queued: false, changedAt: now } },
        history: s.history.filter((h) => h.id !== a.id),
      };
    }
    case "restoreAll": {
      const records = Object.fromEntries(
        Object.entries(s.records).map(([id, r]) => [id, { ...r, discarded: false, queued: false }]),
      );
      const first = s.ids.find((id) => !records[id]?.queued);
      return {
        ...next,
        ...(first && resumeOn(s, first) ? { activeId: first } : {}),
        records,
        history: [],
      };
    }
    case "restart":
      return {
        ...createExplore(s.ids, now),
        ...(s.review ? { review: true } : {}),
        revision: next.revision,
        instructionsDismissed: s.instructionsDismissed,
      };
    case "dismissInstructions":
      return { ...next, instructionsDismissed: true };
  }
}
export function exploreCounts(s: ExploreSession) {
  const rows = s.ids.flatMap((id) => (s.records[id] ? [s.records[id]] : []));
  const explored = rows.filter((r) => r.encountered).length;
  const discarded = rows.filter((r) => r.discarded).length;
  return {
    explored,
    discarded,
    untouched: rows.filter((r) => r.encountered && !r.discarded).length,
    unavailable: rows.filter((r) => r.unavailable).length,
  };
}

/** Worklet-safe: a flick still needs deliberate movement in its velocity direction. */
export function exploreDirection(
  x: number,
  y: number,
  vx: number,
  vy: number,
): ExploreDirection | null {
  "worklet";
  const horizontal = Math.abs(x) > Math.abs(y) * 1.15;
  if (horizontal && (Math.abs(x) >= 64 || (Math.abs(x) >= 16 && Math.abs(vx) >= 650 && x * vx > 0)))
    return x < 0 ? "left" : "right";
  if (y < 0 && -y > Math.abs(x) * 1.15 && (-y >= 64 || (-y >= 16 && vy <= -650))) return "up";
  return null;
}

/** After a photograph is marked: the next unmarked one, else the nearest earlier unmarked
 * one. `null` once everything is marked — an empty sequence, not a finished review. */
export function reviewSurvivor(
  ids: readonly string[],
  records: Record<string, ExploreRecord>,
  id: string,
): string | null {
  const index = ids.indexOf(id);
  const unmarked = (other: string) => other !== id && !records[other]?.queued;
  return (
    ids.slice(index + 1).find(unmarked) ??
    ids.slice(0, Math.max(0, index)).reverse().find(unmarked) ??
    null
  );
}
/** Whether a returning photograph should also be shown: only when the review ran out of
 * photographs without the user finishing it. */
function resumeOn(s: ExploreSession, id: string) {
  return !!s.review && !s.finished && s.activeId === null && s.ids.includes(id);
}
/** Queue is authoritative. Legacy adventure-only marks are preserved, never auto-enqueued. */
export function reconcileReview(session: ExploreSession, media: (Media | undefined)[]): ExploreSession {
  const records = { ...session.records };
  for (const item of media) {
    if (!item) continue;
    const old = records[item.id];
    const queued = !item.deletedAt && item.decision === "delete";
    if (queued || old?.queued) records[item.id] = {
      encountered: old?.encountered ?? false, unavailable: old?.unavailable ?? false,
      changedAt: old?.changedAt ?? 0, discarded: queued, queued,
    };
  }
  // Reviews saved before the trash existed used a null active photograph to mean finished.
  const legacyFinish = session.finished === undefined && session.activeId === null;
  return { ...session, review: true, ...(legacyFinish ? { finished: true } : {}), records, history: session.history.filter(entry => records[entry.id]?.discarded) };
}
