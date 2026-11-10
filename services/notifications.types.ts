import type { PlannedReminder } from "@/lib/pictopia/reminders";
/** "unsupported" is the browser preview: reminders need the installed app. */
export type ReminderPermission = "granted" | "denied" | "undetermined" | "unsupported";
export interface NotificationService {
  permission(): Promise<ReminderPermission>;
  /** Shows the OS prompt when it can still be shown; otherwise reports the current state. */
  request(): Promise<ReminderPermission>;
  /** Replaces every scheduled Pictopia reminder with `plan`. */
  schedule(plan: PlannedReminder[]): Promise<void>;
  /** Opens a tapped reminder's route, including the one that launched the app. */
  onOpen(open: (url: string) => void): () => void;
}
