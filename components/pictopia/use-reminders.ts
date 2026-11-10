import { useEffect } from "react";
import { AppState } from "react-native";
import { router, type Href } from "expo-router";
import { usePictopia } from "./provider";
import { notificationService } from "@/services/notifications";
import { syncReminders } from "@/services/reminders";

/** Keeps the next week of local reminders current and opens tapped ones. Re-plans after
 * library/progress changes, settings changes, and whenever the app opens or leaves. */
export function useReminders() {
  const { ready, revision, prefs } = usePictopia();
  const reminders = prefs.reminders;
  useEffect(() => {
    if (!ready) return;
    // Progress refreshes come in bursts; plan once they settle.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const sync = () => { clearTimeout(timer); timer = setTimeout(() => void syncReminders(reminders).catch(() => {}), 1500); };
    sync();
    const subscription = AppState.addEventListener("change", state => {
      // Leaving the app is the last chance to plan with today's progress: do it at once.
      if (state === "background") { clearTimeout(timer); void syncReminders(reminders).catch(() => {}); }
      else if (state === "active") sync();
    });
    return () => { clearTimeout(timer); subscription.remove(); };
  }, [ready, revision, reminders]);
  useEffect(() => notificationService.onOpen(url => router.push(url as Href)), []);
}

/** Mounted inside the navigator so a reminder that launched the app can navigate. */
export function ReminderHost() {
  useReminders();
  return null;
}
