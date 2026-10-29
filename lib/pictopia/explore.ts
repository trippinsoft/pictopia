import type { Media } from "./types";

export const EXPLORE_LIMIT = 200;
export const EXPLORE_UNDO_LIMIT = 200;
export type ExploreDirection = "up" | "left" | "right";
export interface ExploreRecord {
  encountered: boolean;
  unavailable: boolean;
  discarded: boolean;
  changedAt: number;
}
export interface ExploreSession {
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
  | {
      type: "advance";
      id: string;
      revision: number;
      direction: ExploreDirection;
      available: boolean;
    }
  | { type: "undo" }
  | { type: "page"; id: string; revision: number; position: number; availableIds: string[] }
  | { type: "back" }
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
  return {
    version: 1,
    ids: [...new Set(ids)].slice(0, EXPLORE_LIMIT),
    position: 0,
    revision: 0,
    startedAt: now,
    instructionsDismissed: false,
    records: {},
    history: [],
  };
}
export function reduceExplore(
  s: ExploreSession,
  a: ExploreAction,
  now = Date.now(),
): ExploreSession {
  const next = { ...s, revision: s.revision + 1 };
  switch (a.type) {
    case "page": {
      if (
        a.revision !== s.revision ||
        s.ids[s.position] !== a.id ||
        !Number.isInteger(a.position) ||
        a.position < 0 ||
        a.position > s.ids.length
      )
        return s;
      if (a.position === s.position) return s;
      // Backward paging only revisits. Forward paging records each departed stable ID
      // in the same transaction, even if the native scroll crosses multiple pages.
      if (a.position < s.position) return { ...next, position: a.position };
      const available = new Set(a.availableIds);
      const records = { ...s.records },
        history = [...s.history];
      for (let position = s.position; position < a.position; position++) {
        const id = s.ids[position],
          previous = records[id];
        records[id] = {
          encountered: available.has(id) || previous?.encountered === true,
          unavailable: !available.has(id) && !previous?.encountered,
          discarded: previous?.discarded === true,
          changedAt: now,
        };
        history.push({ id, position, ...(previous ? { previous } : {}) });
      }
      return {
        ...next,
        position: a.position,
        records,
        history: history.slice(-EXPLORE_UNDO_LIMIT),
      };
    }
    case "advance": {
      if (a.revision !== s.revision || s.ids[s.position] !== a.id) return s;
      if (!a.available && a.direction !== "up") return s;
      const previous = s.records[a.id];
      return {
        ...next,
        position: s.position + 1,
        records: {
          ...s.records,
          [a.id]: {
            encountered: a.available || previous?.encountered === true,
            unavailable: !a.available && !previous?.encountered,
            discarded: a.direction !== "up" || previous?.discarded === true,
            changedAt: now,
          },
        },
        history: [
          ...s.history,
          { id: a.id, position: s.position, ...(previous ? { previous } : {}) },
        ].slice(-EXPLORE_UNDO_LIMIT),
      };
    }
    case "undo": {
      const last = s.history[s.history.length - 1];
      if (!last) return s;
      const records = { ...s.records };
      if (last.previous) records[last.id] = last.previous;
      else delete records[last.id];
      return { ...next, position: last.position, records, history: s.history.slice(0, -1) };
    }
    case "back":
      return s.position > 0 ? { ...next, position: s.position - 1 } : s;
    case "restore": {
      if (!s.records[a.id]?.discarded) return s;
      return {
        ...next,
        records: { ...s.records, [a.id]: { ...s.records[a.id], discarded: false, changedAt: now } },
        history: s.history.filter((h) => h.id !== a.id),
      };
    }
    case "restoreAll":
      return {
        ...next,
        records: Object.fromEntries(
          Object.entries(s.records).map(([id, r]) => [id, { ...r, discarded: false }]),
        ),
        history: [],
      };
    case "restart":
      return {
        ...createExplore(s.ids, now),
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
