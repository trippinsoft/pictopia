/** Local reminder planning: pure and clock-injected, so every rule is testable. Pictopia has no
 * server, so the next week of reminders is planned on the device and re-planned whenever the
 * app opens, goes to the background or the user's progress changes. At most one reminder a
 * day, at the user's chosen time; a quiet user gets fewer, never more. */
import { addDays, localDate, STREAK_VIEWS } from "./daily";
import { bytes } from "./logic";
import { plural } from "./text";
import { DEFAULT_REMINDERS, type ReminderPrefs } from "./types";

export { DEFAULT_REMINDERS, type ReminderPrefs };
/** Times offered in Settings. */
export const REMINDER_TIMES = [9, 12, 17, 19, 21] as const;
export const PLAN_DAYS = 7;
/** Days ahead the single Discarded nudge lands, so it never shares today with a streak alert. */
const DISCARDED_AFTER = 2;

export type ReminderKind = "streak" | "streakStart" | "onThisDay" | "discarded";
export interface PlannedReminder {
  /** Stable per date, so re-planning replaces rather than duplicates. */
  id: string;
  kind: ReminderKind;
  at: number;
  title: string;
  body: string;
  /** In-app route opened when the reminder is tapped. */
  url: string;
}
export interface ReminderFacts {
  streak: { current: number; todayDone: boolean };
  /** Photos from earlier years on each upcoming calendar date (YYYY-MM-DD → count, years). */
  days: Record<string, { count: number; years: number[] }>;
  pending: { count: number; bytes: number };
}

export function reminderTimeLabel(hour: number, minute = 0) {
  return new Date(2026, 0, 1, hour, minute).toLocaleTimeString(undefined, { hour: "numeric", minute: minute ? "2-digit" : undefined });
}

function atTime(date: string, hour: number, minute: number) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d, hour, minute, 0, 0).getTime();
}
function yearsLabel(years: number[]) {
  const sorted = [...new Set(years)].sort((a, b) => a - b);
  if (!sorted.length) return "past years";
  if (sorted.length === 1) return String(sorted[0]);
  return `${sorted[0]}–${sorted[sorted.length - 1]}`;
}
function dayName(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: "long", day: "numeric" });
}

export function planReminders(prefs: ReminderPrefs, facts: ReminderFacts, now: number): PlannedReminder[] {
  const today = localDate(now);
  const out: PlannedReminder[] = [];
  for (let i = 0; i < PLAN_DAYS; i++) {
    const date = addDays(today, i);
    const at = atTime(date, prefs.hour, prefs.minute);
    if (at <= now) continue;
    const base = { id: `pictopia-reminder-${date}`, at };
    const { current, todayDone } = facts.streak;
    // The streak is at risk today if today isn't done yet, or tomorrow once today is done.
    // Further ahead the streak would already have lapsed, so no streak alerts are planned.
    const atRisk = current > 0 && ((i === 0 && !todayDone) || (i === 1 && todayDone));
    const otd = facts.days[date];
    if (prefs.streak && atRisk) {
      out.push({ ...base, kind: "streak", title: `Don’t lose your ${current}-day streak 🔥`, body: `Explore ${STREAK_VIEWS} photos today to keep it going.`, url: "/(tabs)/home" });
    } else if (prefs.onThisDay && otd && otd.count > 0) {
      out.push({ ...base, kind: "onThisDay", title: `On this day: ${plural(otd.count, "photo")}`, body: `Take a trip back to ${dayName(date)} in ${yearsLabel(otd.years)}.`, url: "/on-this-day" });
    } else if (prefs.streak && i === 0 && !todayDone && current === 0) {
      out.push({ ...base, kind: "streakStart", title: "A few minutes with your photos?", body: `Explore ${STREAK_VIEWS} today to start a streak.`, url: "/(tabs)/home" });
    } else if (prefs.discarded && i === DISCARDED_AFTER && facts.pending.count > 0) {
      const size = facts.pending.bytes > 0 ? ` ${bytes(facts.pending.bytes)}` : "";
      out.push({ ...base, kind: "discarded", title: `Ready to free up${size || " some space"}?`, body: `${facts.pending.count.toLocaleString()} waiting in Discarded. Nothing is deleted until you confirm.`, url: "/queue" });
    }
  }
  return out;
}
