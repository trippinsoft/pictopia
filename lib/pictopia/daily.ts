/** Daily activity, calendar-day streaks with Restore Streak, and the free daily swipe allowance.
 * Pure and clock-injected so every rule is testable. Dates are the device's local calendar
 * (YYYY-MM-DD) at the moment something happens; once recorded they are never re-bucketed. */

export const STREAK_VIEWS = 10;
export const RESTORE_MIN_STREAK = 3;
export const RESTORE_EVERY_DAYS = 30;
export const STREAK_MILESTONES = [3, 7, 14, 30, 50, 100, 200, 365] as const;
export const DEFAULT_FREE_SWIPES = 150;
const DAY = 86400000;

export function localDate(t: number) {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
/** Calendar arithmetic on YYYY-MM-DD keys, independent of time zones and DST. */
export function addDays(date: string, n: number) {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

// ── Activity ────────────────────────────────────────────────────────────────────────────────
export interface DayRecord {
  /** Distinct photos displayed in the foreground, however briefly, or explicitly marked. */
  photos: number;
  /** Distinct videos meaningfully viewed. Count toward streaks, never toward photo badges. */
  videos: number;
  /** Photos explored for the first time ever. */
  newPhotos: number;
  marked: number;
  /** Photos and videos whose deletion iOS/Android confirmed. */
  deleted: number;
  qualifiedAt?: number;
}
export interface Activity {
  version: 1;
  days: Record<string, DayRecord>;
  /** Today's distinct viewed ids, for once-a-day counting; replaced when the date changes. */
  today: { date: string; ids: string[] };
  /** Latest wall-clock time seen. Activity stamped earlier never extends a streak. */
  lastWallClock: number;
}
export const emptyActivity = (): Activity => ({ version: 1, days: {}, today: { date: "", ids: [] }, lastWallClock: 0 });
const emptyDay = (): DayRecord => ({ photos: 0, videos: 0, newPhotos: 0, marked: 0, deleted: 0 });
export const qualifies = (d?: DayRecord) => !!d && (d.photos + d.videos >= STREAK_VIEWS || d.deleted > 0);

export type ActivityEvent =
  | { type: "view"; id: string; video: boolean; firstTime: boolean; marked?: boolean }
  | { type: "deleted"; count: number };
export function recordActivity(state: Activity | undefined, events: ActivityEvent[], at: number): Activity {
  const s = state ?? emptyActivity();
  // A clock set backwards credits the latest real date, never an earlier day.
  const date = [localDate(at), s.today.date].filter(Boolean).sort().at(-1)!;
  const day = { ...(s.days[date] ?? emptyDay()) };
  const ids = new Set(s.today.date === date ? s.today.ids : []);
  for (const e of events) {
    if (e.type === "deleted") day.deleted += e.count;
    else {
      if (e.marked) day.marked++;
      if (ids.has(e.id)) continue;
      ids.add(e.id);
      if (e.video) day.videos++;
      else day.photos++;
      if (e.firstTime && !e.video) day.newPhotos++;
    }
  }
  if (!day.qualifiedAt && qualifies(day)) day.qualifiedAt = at;
  const today = { date, ids: [...ids] };
  return { ...s, days: { ...s.days, [date]: day }, today, lastWallClock: Math.max(s.lastWallClock, at) };
}

// ── Streaks ─────────────────────────────────────────────────────────────────────────────────
export interface StreakRestore {
  /** The missed calendar day that was restored. */
  date: string;
  usedAt: number;
  streakBefore: number;
}
export interface StreakState {
  current: number;
  best: number;
  activeDays: number;
  todayDone: boolean;
  /** Last seven days, oldest first, ending today. */
  week: { date: string; state: "done" | "restored" | "missed" | "today" }[];
  restore?: { date: string; streakBefore: number; deadline: string };
  nextRestoreFrom?: number;
}

function runEnding(date: string, filled: (d: string) => boolean) {
  let n = 0;
  for (let d = date; filled(d); d = addDays(d, -1)) n++;
  return n;
}
export function streak(activity: Activity | undefined, restores: readonly StreakRestore[], now: number): StreakState {
  const a = activity ?? emptyActivity();
  // A clock set backwards uses the latest date ever seen, so it can't reopen past days.
  const today = [localDate(now), a.today.date].filter(Boolean).sort().at(-1)!;
  const qualified = new Set(Object.keys(a.days).filter((d) => d <= today && qualifies(a.days[d])));
  const restored = new Set(restores.map((r) => r.date));
  const filled = (d: string) => qualified.has(d) || restored.has(d);
  const todayDone = qualified.has(today);
  const current = runEnding(todayDone ? today : addDays(today, -1), filled);
  let best = current;
  for (const d of [...qualified, ...restored]) if (!filled(addDays(d, 1))) best = Math.max(best, runEnding(d, filled));
  const week = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i - 6);
    const state: "done" | "restored" | "missed" | "today" = qualified.has(date) ? "done" : restored.has(date) ? "restored" : date === today ? "today" : "missed";
    return { date, state };
  });
  const last = [...restores].sort((x, y) => y.usedAt - x.usedAt)[0];
  const nextRestoreFrom = last ? last.usedAt + RESTORE_EVERY_DAYS * DAY : undefined;
  let restore: StreakState["restore"];
  if (!nextRestoreFrom || now >= nextRestoreFrom) {
    // Exactly one missed day D, offered through the end of D+2; on D+2 only if D+1 qualified.
    for (const back of [1, 2]) {
      const missed = addDays(today, -back);
      if (filled(missed)) continue;
      if (back === 2 && !qualified.has(addDays(today, -1))) continue;
      const before = runEnding(addDays(missed, -1), filled);
      if (before >= RESTORE_MIN_STREAK) restore = { date: missed, streakBefore: before, deadline: addDays(missed, 2) };
      break;
    }
  }
  return { current, best, activeDays: qualified.size, todayDone, week, restore, nextRestoreFrom };
}
/** Applies an offered restore; refuses anything the rules don't currently offer. */
export function applyRestore(activity: Activity | undefined, restores: readonly StreakRestore[], now: number) {
  const offer = streak(activity, restores, now).restore;
  if (!offer) return undefined;
  return [...restores, { date: offer.date, usedAt: now, streakBefore: offer.streakBefore }];
}

// ── Daily swipe allowance ───────────────────────────────────────────────────────────────────
export interface Allowance {
  version: 1;
  date: string;
  /** Assets already counted today; revisiting them is free. */
  counted: string[];
  lastWallClock: number;
}
export const emptyAllowance = (): Allowance => ({ version: 1, date: "", counted: [], lastWallClock: 0 });
/** The allowance in effect at `now`: a new local day starts fresh; a clock moved backwards
 * never resets the count (moving it forward can't be detected without a server). */
export function currentAllowance(state: Allowance | undefined, now: number): Allowance {
  const s = state ?? emptyAllowance();
  const date = localDate(now);
  if (s.date && date <= s.date) return { ...s, lastWallClock: Math.max(s.lastWallClock, now) };
  return { version: 1, date, counted: [], lastWallClock: Math.max(s.lastWallClock, now) };
}
export function swipesLeft(state: Allowance | undefined, limit: number, now: number) {
  return Math.max(0, limit - currentAllowance(state, now).counted.length);
}
/** Counts a newly presented asset once per day. Pro is never blocked or counted. */
export function presentAsset(state: Allowance | undefined, id: string, limit: number, pro: boolean, now: number) {
  const s = currentAllowance(state, now);
  if (pro || s.counted.includes(id)) return { state: s, allowed: true, changed: s.date !== state?.date };
  if (s.counted.length >= limit) return { state: s, allowed: false, changed: false };
  return { state: { ...s, counted: [...s.counted, id] }, allowed: true, changed: true };
}
/** Whether an asset may be shown without spending: already counted today, or Pro. */
export const canShowFree = (state: Allowance | undefined, id: string, pro: boolean, now: number) =>
  pro || currentAllowance(state, now).counted.includes(id);

/** Remote limit, validated: a whole number from 10 to 10,000, else the fallback. */
export function validLimit(value: unknown, fallback = DEFAULT_FREE_SWIPES) {
  const n = typeof value === "object" && value ? (value as { freeDailySwipes?: unknown }).freeDailySwipes : value;
  return typeof n === "number" && Number.isInteger(n) && n >= 10 && n <= 10000 ? n : fallback;
}

/** Where the review must stop for the free allowance: the first asset at or after `fromId`
 * that is neither free (already counted today, or a revisit) nor covered by what's left.
 * Undefined means the whole sequence can be shown. */
export function allowanceStop(sequence: readonly string[], fromId: string | null | undefined, left: number, free: (id: string) => boolean) {
  let remaining = left;
  for (let i = Math.max(0, fromId ? sequence.indexOf(fromId) : 0); i < sequence.length; i++) {
    const id = sequence[i];
    if (free(id)) continue;
    if (remaining > 0) { remaining--; continue; }
    return id;
  }
  return undefined;
}
