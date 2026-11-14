import { exploreCounts, exploreFeed, type ExploreSession } from "./explore";

/** Target photos per Adventure: short enough to finish in a few minutes. Configurable;
 * production snapshots retain all selected references. */
export const ADVENTURE_SIZE = 20;
/** Curation scoring targets, not snapshot limits. On This Day ignores the target and runs whole;
 * big piles come in bite-sized sweeps. The curated kinds hold 20. */
export function adventureSize(kind: AdventureKind) {
  return kind === "day" ? 500 : kind === "screenshots" ? 50 : ADVENTURE_SIZE;
}
/** An offer needs enough photos to feel like a trip. Chosen ones can be smaller. */
export const OFFER_MIN = 3;
/** Recently offered or started sources, oldest first, for variety. */
export const RECENT_LIMIT = 12;
/** `random` is the original Surprise Me (kept so saved Adventures still read). */
export type AdventureKind =
  | "year"
  | "month"
  | "day"
  | "screenshots"
  | "detour"
  | "capsule"
  | "corners"
  | "pitstop"
  | "random";
export type Dimension =
  | "discovery"
  | "coherence"
  | "variety"
  | "cleanup"
  | "effort"
  | "personalization";
export interface AdventureHint {
  title: string;
  detail: string;
}
/** Why the engine made this Adventure, in plain words and per-dimension scores (0–1). */
export interface AdventureDiagnostics {
  total: number;
  scores: Record<Dimension, number>;
  reasons: Record<Dimension, string>;
  why: string[];
  selection: string[];
  sequencing: string;
  limitations: string[];
  overlap: string;
  pool: number;
  pairing?: string;
  /** Other candidates of the same kind and how they scored. */
  alternatives?: { title: string; detail: string; total: number }[];
}
export type LabExperiment = "detour" | "capsule" | "corners";
export interface Adventure {
  version: 1;
  id: string;
  kind: AdventureKind;
  /** What it was drawn from (`year:2019`, `month:2016-10`, `day:10-30`, `screenshots`, …). */
  source: string;
  /** Computed from the frozen selection, so it is always true of what is inside. */
  hint: AdventureHint;
  /** The understated line shown on finishing. */
  closing?: string;
  count: number;
  createdAt: number;
  startedAt?: number;
  openedAt?: number;
  /** Reached the completion page (counted once). */
  finishedAt?: number;
  /** Saved atomically after checking the session; survives later Undo/review visits. */
  completionProof?: { version: 1 | 2; at: number; sessionStartedAt: number; endpoint: string; total: number; explored: number };
  priorCompletionProof?: Adventure["completionProof"];
  /** Picked in Explore rather than offered on Home. */
  chosen?: boolean;
  /** An Adventure Lab experiment. */
  lab?: LabExperiment;
  diagnostics?: AdventureDiagnostics;
  /** Current bounded segment; previous snapshots remain available for evidence/Undo. */
  segment?: number;
  segmentKeys?: string[];
  /** One-time milestone recognition, monotonic even if accessible totals change. */
  milestones?: number[];
  dayDate?: string;
  /** Historical-date selection requires Pro; a paused Free journey can still resume tomorrow. */
  historyPro?: boolean;

}
export interface AdventureIndex {
  version: 1;
  /** The (at most two) Adventures on Home, in display order: A, B. */
  slots: string[];
  /** Unfinished Adventures that aren't on Home (chosen in Explore, or retired from Home). */
  parked: string[];
  /** Every Adventure ever started; progress and set-aside review read these. */
  started: string[];
  /** Sources recently offered or started, oldest first. */
  recent: string[];
  /** The swipe instructions were dismissed once; they aren't shown in later Adventures. */
  introSeen: boolean;
  /** Home slots come from the curation engine (older ones were up to 100 photos). */
  curated?: boolean;
  /** Finished Adventures, for pacing the occasional "More like this?". */
  finished?: number;
  /** `finished` count when "More like this?" was last asked. */
  askedAt?: number;
  /** When Home last offered a Screenshot Sweep (Pictopia+ only), to keep it occasional. */
  screenshotsOfferedAt?: number;
}
export const emptyIndex = (): AdventureIndex => ({
  version: 1,
  slots: [],
  parked: [],
  started: [],
  recent: [],
  introSeen: false,
  curated: true,
});

const MONTHS = Array.from({ length: 12 }, (_, i) =>
  new Date(2001, i, 15).toLocaleDateString(undefined, { month: "long" }),
);
/** "October" from `2016-10`. */
export const monthName = (key: string) => MONTHS[Number(key.slice(5, 7)) - 1] ?? key;

/** Whether an Adventure has reached its end: a review the user finished with Done, the
 * explorer's completion page, or an empty snapshot. A review that has everything marked for
 * deletion is not complete; its photographs can still be restored. */
export const adventureComplete = (s: ExploreSession | undefined) =>
  !!s && (s.review ? !!s.finished || !s.ids.length : s.activeId === null || !s.ids.length);
/** Completion evidence is independent of the controller's ending flag. Legacy records
 * need a nonempty snapshot, saved activity and evidence at its original endpoint. */
export function completionEvidence(s: ExploreSession | undefined) {
  if (!s || !Array.isArray(s.ids) || !s.records || !s.ids.length || new Set(s.ids).size !== s.ids.length) return false;
  // Photos deleted since the review leave its feed; the rest must still be covered.
  const shown = s.review ? exploreFeed(s) : s.ids;
  const last = shown[shown.length - 1] ?? s.ids[s.ids.length - 1];
  const covered = shown.every(id => s.records[id]?.encountered || s.records[id]?.unavailable);
  if (!s.completionVerifiedAt && !covered) return false;
  return !!(s.review ? s.finished || (s.finished === undefined && s.activeId === null && covered) : s.activeId === null) &&
    s.ids.some(id => s.records[id]?.encountered) &&
    !!(s.records[last]?.encountered || s.records[last]?.unavailable);
}

export function completionProof(s: ExploreSession, at: number): NonNullable<Adventure["completionProof"]> {
  return { version: 2, at, sessionStartedAt: s.startedAt, endpoint: s.ids[s.ids.length - 1], total: s.ids.length, explored: s.ids.filter(id => s.records[id]?.encountered).length };
}
export function savedCompletion(meta: Adventure, s: ExploreSession | undefined) {
  const p = meta.completionProof;
  return !!p && p.version === 2 && p.at === meta.finishedAt && p.total > 0 &&
    p.total === meta.count && Number.isInteger(p.explored) && p.explored > 0 && p.explored <= p.total &&
    !!s && p.sessionStartedAt === s.startedAt && p.total === s.ids.length && p.endpoint === s.ids[s.ids.length - 1];
}

/** "23 of 100": photos meaningfully seen in this Adventure. */
export function adventurePlace(s: ExploreSession) {
  if (!s.review) return { explored: exploreCounts(s).explored, total: s.ids.length };
  const feed = exploreFeed(s);
  return { explored: feed.filter(id => s.records[id]?.encountered).length, total: feed.length };
}
/** Cumulative progress across every Adventure. A photo counts once however often it is
 * revisited or appears again; "set aside" means currently provisionally discarded. */
export function adventureProgress(sessions: (ExploreSession | undefined)[]) {
  const explored = new Set<string>(),
    setAside = new Set<string>();
  for (const s of sessions) {
    if (!s) continue;
    for (const id of s.ids) {
      const r = s.records[id];
      if (r?.encountered) explored.add(id);
      if (r?.discarded) setAside.add(id);
    }
  }
  return { explored: explored.size, setAside: setAside.size, exploredIds: explored };
}

/** An opened record alone is not meaningful progress or a reason to show Continue. */
export function meaningfulReview(s: ExploreSession | undefined) {
  if (!s || s.finished) return false;
  const viewed = s.ids.filter(id => s.records[id]?.encountered).length;
  return s.ids.some(id => s.records[id]?.queued) || viewed > 1 || (viewed > 0 && s.activeId !== s.ids[0]);
}
