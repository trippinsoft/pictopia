import { impactAsync, ImpactFeedbackStyle, notificationAsync, NotificationFeedbackType } from "expo-haptics";
export function memoryMatchHaptic() { void impactAsync(ImpactFeedbackStyle.Soft).catch(() => {}); }
/** A cheerful success buzz as a new badge lands. */
export function celebrationHaptic() { void notificationAsync(NotificationFeedbackType.Success).catch(() => {}); }
