import { planReminders, PLAN_DAYS } from "@/lib/pictopia/reminders";
import type { ReminderPrefs } from "@/lib/pictopia/types";
import { adventureStore } from "./adventures";
import { dailyStore } from "./daily";
import { notificationService } from "./notifications";
import { storage } from "./repository";

let running: Promise<void> | undefined;
let again = false;
let latest: ReminderPrefs | undefined;

/** Re-plans the next week of reminders from today's facts. Calls arriving while a plan is
 * being written coalesce into one more run, so the latest facts always win. */
export function syncReminders(prefs: ReminderPrefs) {
  latest = prefs;
  if (running) { again = true; return running; }
  running = (async () => {
    try {
      do {
        again = false;
        const prefs = latest!;
        if ((await notificationService.permission()) !== "granted") return;
        const now = Date.now();
        const anyOn = prefs.streak || prefs.onThisDay || prefs.discarded;
        const [streak, stats, days] = anyOn
          ? await Promise.all([dailyStore.streak(now), storage.stats(), prefs.onThisDay ? adventureStore.upcomingDays(now, PLAN_DAYS) : {}])
          : [undefined, undefined, {}];
        const plan = streak && stats
          ? planReminders(prefs, { streak, days, pending: { count: stats.pending, bytes: stats.pendingBytes } }, now)
          : [];
        await notificationService.schedule(plan);
      } while (again);
    } finally {
      running = undefined;
    }
  })();
  return running;
}
