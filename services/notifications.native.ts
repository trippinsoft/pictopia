import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import type { NotificationService, ReminderPermission } from "./notifications.types";

const CHANNEL = "reminders";
const PREFIX = "pictopia-reminder-";

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

function status(p: Notifications.NotificationPermissionsStatus): ReminderPermission {
  if (p.granted || p.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) return "granted";
  return p.canAskAgain ? "undetermined" : "denied";
}
let channel: Promise<unknown> | undefined;
/** Android needs a channel before the permission prompt can appear. */
function ensureChannel() {
  if (Platform.OS !== "android") return Promise.resolve();
  return (channel ??= Notifications.setNotificationChannelAsync(CHANNEL, { name: "Reminders", importance: Notifications.AndroidImportance.DEFAULT }));
}

export const notificationService: NotificationService = {
  async permission() {
    return status(await Notifications.getPermissionsAsync());
  },
  async request() {
    await ensureChannel();
    const current = await Notifications.getPermissionsAsync();
    if (current.granted || !current.canAskAgain) return status(current);
    return status(await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } }));
  },
  async schedule(plan) {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(scheduled.filter(n => n.identifier.startsWith(PREFIX)).map(n => Notifications.cancelScheduledNotificationAsync(n.identifier)));
    if (!plan.length || (await this.permission()) !== "granted") return;
    await ensureChannel();
    for (const r of plan) {
      await Notifications.scheduleNotificationAsync({
        identifier: r.id,
        content: { title: r.title, body: r.body, data: { url: r.url, kind: r.kind } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(r.at), ...(Platform.OS === "android" ? { channelId: CHANNEL } : {}) },
      });
    }
  },
  onOpen(open) {
    const handle = (response: Notifications.NotificationResponse | null | undefined) => {
      const url = response?.notification.request.content.data?.url;
      if (typeof url !== "string" || !response?.notification.request.identifier.startsWith(PREFIX)) return;
      Notifications.clearLastNotificationResponse();
      open(url);
    };
    handle(Notifications.getLastNotificationResponse());
    const subscription = Notifications.addNotificationResponseReceivedListener(handle);
    return () => subscription.remove();
  },
};
