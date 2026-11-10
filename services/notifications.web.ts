import type { NotificationService } from "./notifications.types";

/** Browsers can't receive Pictopia's scheduled reminders; they work in the installed app. */
export const notificationService: NotificationService = {
  async permission() { return "unsupported"; },
  async request() { return "unsupported"; },
  async schedule() {},
  onOpen() { return () => {}; },
};
