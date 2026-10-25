import { Collection, Media, Session } from "./types";
export const smartSessions = [
  {
    key: "quick" as const,
    title: "Quick Wins",
    description: "Screenshots and easy decisions first.",
    icon: "Zap" as const,
  },
  {
    key: "memory" as const,
    title: "Memory Lane",
    description: "Rediscover older memories, in order.",
    icon: "CalendarHeart" as const,
  },
  {
    key: "best" as const,
    title: "Best of the Bunch",
    description: "Review similar shots with a suggested keeper.",
    icon: "Images" as const,
  },
];
export function sessionTitle(collection: Collection) {
  return smartSessions.find((s) => s.key === collection)?.title ?? "One memory at a time";
}
export function remainingSeconds(session: Session) {
  return Math.max(0, (session.minutes ?? 5) * 60 - Math.floor((session.elapsedMs ?? 0) / 1000));
}
export function milestone(reviewed: number) {
  return reviewed > 0 && reviewed % 10 === 0
    ? String(reviewed) + " memories reviewed. A little lighter already."
    : null;
}
/** Review time only accrues while the app is foregrounded, visible, showing media, and ticking. */
export function countsAsReviewTime(t: {
  active: boolean;
  visible: boolean;
  ready: boolean;
  delta: number;
}) {
  // Long gaps are suspended time, never time spent reviewing.
  return t.active && t.visible && t.ready && t.delta > 0 && t.delta <= 1500;
}
export interface SessionTally {
  reviewed: number;
  kept: number;
  setAside: number;
}
/**
 * Counts a session from each item's current state, not from counters saved at swipe time:
 * restored items return to unreviewed and drop out; verified deletions still count as set aside.
 */
export function sessionTally(session: Session, current: (Media | undefined)[]): SessionTally {
  const ids = new Set(session.history.map((h) => h.id));
  let kept = 0,
    setAside = 0;
  for (const m of current) {
    if (!m || !ids.has(m.id)) continue;
    ids.delete(m.id);
    if (m.decision === "delete" || m.deletedAt !== undefined) setAside++;
    else if (m.decision === "keep") kept++;
  }
  return { reviewed: kept + setAside, kept, setAside };
}
