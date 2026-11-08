import type { Media } from "./types";
import { qualifiedEncounterTime } from "./photo-encounter";

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
  /** Browse the v21 live feed; canonical snapshot IDs/history remain intact. */
  review?: boolean;
  /** A segment whose final boundary the user crossed. Simply opening the final photo
   * or exhausting the daily allowance never finishes it. */
  finished?: boolean;
  /** Written by a validated segment boundary or revision-checked compatibility Finish action. */
  completionVerifiedAt?: number;
  /** The fixed snapshot in original order. The feed is derived from it, never stored. */
  ids: string[];
  /** Photo being shown, by stable ID; null is the completion page after the last photo. */
  activeId: string | null;
  /** Furthest original position reached; separate from the current cursor. */
  highestPosition?: number;
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
  | { type: "unavailable"; id: string }
  | { type: "seen"; id: string; displayedAt?: number }
  | { type: "finish"; expectedRevision?: number; endId?: string; boundary?: { startedAt: number; endpoint: string } }
  | { type: "restore"; id: string }
  | { type: "restoreAll" }
  | { type: "restart" }
  /** Reopen a finished review on a photograph (the first by default) to look again or change
   * marks. Its completion proof stays; reaching the end shows completion again. */
  | { type: "revisit"; toId?: string }
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
/** A review keeps every original slot: discarded photographs stay, faded, so places and
 * counts never shift. Only the isolated prototype removes its discards. */
export function exploreFeed(s: Pick<ExploreSession, "ids" | "records" | "review">) {
  return s.review ? [...s.ids] : s.ids.filter(id => !s.records[id]?.discarded);
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
/** Prefer this review's reversible history. Existing queue marks may have come from
 * another review; without local history, Undo restores the most recently changed mark. */
export function lastExploreDiscard(s: ExploreSession): ExploreDiscard | undefined {
  const historical = [...s.history].reverse().find(entry => s.records[entry.id]?.discarded);
  if (historical || !s.review) return historical;
  let latest: string | undefined;
  for (const id of s.ids) {
    if (!s.records[id]?.queued) continue;
    if (!latest || s.records[id].changedAt >= s.records[latest].changedAt) latest = id;
  }
  return latest ? { id: latest, direction: "left" } : undefined;
}

export function reduceExplore(
  s: ExploreSession,
  a: ExploreAction,
  now = Date.now(),
): ExploreSession {
  const next = { ...s, highestPosition: Math.max(s.highestPosition ?? 0, s.activeId ? s.ids.indexOf(s.activeId) : 0, a.type === "page" && a.toId ? s.ids.indexOf(a.toId) : 0), revision: s.revision + 1 };
  switch (a.type) {
    case "page": {
      if (a.revision !== s.revision || a.id !== s.activeId) return s;
      const feed = exploreFeed(s);
      if (s.review) {
        // A review's saved place is always a photograph in its sequence: the end card is
        // never a saved place. Moving to any of its photographs is valid from anywhere,
        // including a place an older build saved as "past the end".
        if (a.toId === null || a.toId === s.activeId || !feed.includes(a.toId)) return s;
        const from = s.activeId === null ? -1 : feed.indexOf(s.activeId);
        if (from < 0 || feed.indexOf(a.toId) < from) return { ...next, activeId: a.toId };
        // Scrolling past a photograph reviews it, as in any feed. Only a photograph that
        // failed to load stays unreviewed.
        const records = { ...s.records };
        for (const id of feed.slice(from, feed.indexOf(a.toId))) {
          const previous = records[id];
          if (previous?.encountered || previous?.unavailable) continue;
          records[id] = {
            encountered: true,
            unavailable: false,
            discarded: previous?.discarded ?? false,
            ...(previous?.queued !== undefined ? { queued: previous.queued } : {}),
            // A mark's time orders Undo; seeing it again never changes that.
            changedAt: previous?.changedAt ?? now,
          };
        }
        return { ...next, activeId: a.toId, records };
      }
      const from = s.activeId === null ? feed.length : feed.indexOf(s.activeId);
      const to = a.toId === null ? feed.length : feed.indexOf(a.toId);
      if (from < 0 || to < 0 || to === from) return s;
      // Paging proves position, not meaningful display. Production reviews credit only
      // explicit visibility events (or the existing explicit discard). The isolated
      // prototype retains its original departure-based counting.
      if (to < from) return { ...next, activeId: a.toId };
      const available = new Set(a.availableIds);
      const records = { ...s.records };
      for (const id of feed.slice(from, to)) {
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
      // A review marks the photograph the user can see. Its id is the truth, whatever place
      // was last saved: a stale saved place must never turn a visible mark into a failure.
      if (a.revision !== s.revision || !s.ids.includes(a.id) || (s.review ? s.records[a.id]?.queued : s.records[a.id]?.discarded))
        return s;
      const previous = s.records[a.id];
      const records = {
        ...s.records,
        [a.id]: { encountered: true, unavailable: false, discarded: true, ...(s.review ? { queued: true } : {}), changedAt: now },
      };
      // A review moves on to the next slot, whether or not that photograph is marked. At
      // the final slot the marked photograph stays the saved place; the end card never is.
      const activeId = s.review ? (s.ids[s.ids.indexOf(a.id) + 1] ?? a.id) : survivor(s.ids, records, a.id);
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
      const last = lastExploreDiscard(s);
      if (!last || (a.id !== undefined && a.id !== last.id)) return s;
      const records = { ...s.records };
      const encountered = s.review && !!records[last.id]?.encountered;
      if (last.previous) records[last.id] = { ...last.previous, ...(encountered ? { encountered: true, unavailable: false } : {}), discarded: false, queued: false };
      else if (encountered) records[last.id] = { ...records[last.id], discarded: false, queued: false };
      else delete records[last.id];
      // Back in its original slot and shown, wherever the user had moved to. An undo from
      // the closing screen reopens the review on that photograph.
      return { ...next, activeId: last.id, finished: false, records, history: s.history.filter(entry => entry.id !== last.id) };
    }
    case "unavailable": {
      if (!s.review || !s.ids.includes(a.id) || s.records[a.id]?.encountered || s.records[a.id]?.unavailable) return s;
      return { ...next, records: { ...s.records, [a.id]: { ...s.records[a.id], encountered: false, unavailable: true, discarded: s.records[a.id]?.discarded ?? false, changedAt: s.records[a.id]?.changedAt ?? now } } };
    }
    case "seen": {
      // A qualified visibility event can wait behind another save. Credit the photo that
      // was actually displayed without changing the user's newer place in the feed.
      const qualified = qualifiedEncounterTime(a.displayedAt, s.startedAt, now);
      if (!s.review || !s.ids.includes(a.id) || (!qualified && a.id !== s.activeId) || s.records[a.id]?.encountered) return s;
      if (a.displayedAt !== undefined && !qualified) return s;
      return { ...next, records: { ...s.records, [a.id]: { ...s.records[a.id], encountered: true, unavailable: false, discarded: s.records[a.id]?.discarded ?? false, changedAt: now } } };
    }
    case "finish": {
      const boundary = s.review && a.boundary?.startedAt === s.startedAt && a.boundary?.endpoint === s.ids.at(-1);
      if (!boundary && a.expectedRevision !== undefined && a.expectedRevision !== s.revision) return s;
      // A stale end-page callback cannot finish a review from the middle. The final
      // original discard may have already selected an earlier surviving photograph.
      const feed = exploreFeed(s);
      const last = s.ids[s.ids.length - 1];
      // Native paging may reach the end before its final photo-position save settles.
      // An explicit end-page action can identify the last surviving, meaningfully seen
      // photo, but must still match the captured revision (navigation/Undo invalidate it).
      const witnessedEnd = a.expectedRevision !== undefined && a.endId !== undefined &&
        a.endId === feed[feed.length - 1] && !!(s.records[a.endId]?.encountered || s.records[a.endId]?.unavailable);
      const atEnd = !!last && (s.activeId === feed[feed.length - 1] || !!s.records[last]?.queued || witnessedEnd);
      return s.review && (atEnd || boundary) ? { ...next, activeId: null, finished: true, ...(a.expectedRevision !== undefined || boundary ? { completionVerifiedAt: now } : {}) } : s;
    }
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
    case "revisit": {
      if (!s.review || !s.finished || !s.ids.length) return s;
      const to = a.toId && s.ids.includes(a.toId) ? a.toId : s.ids[0];
      return { ...next, finished: false, activeId: to };
    }
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
export function reconcileReview(session: ExploreSession, media: (Media | undefined)[], confirmedLegacy = false): ExploreSession {
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
  const legacyFinish = confirmedLegacy && session.finished === undefined && session.activeId === null && session.ids.length > 0 && session.ids.every(id => session.records[id]?.encountered || session.records[id]?.unavailable);
  // Marks never move the saved place: every slot stays in the feed. Earlier builds saved
  // "past the last photograph" after marking the final one; an unfinished review always
  // resumes on a photograph, the last one, which is where that user was.
  let activeId = session.activeId;
  if (!session.finished && !legacyFinish && (activeId === null || !session.ids.includes(activeId)))
    activeId = session.ids[session.ids.length - 1] ?? null;
  return { ...session, review: true, activeId, ...(legacyFinish ? { finished: true } : {}), records, history: session.history.filter(entry => records[entry.id]?.discarded) };
}
