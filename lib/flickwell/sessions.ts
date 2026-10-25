import { Collection, Session } from "./types";
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
