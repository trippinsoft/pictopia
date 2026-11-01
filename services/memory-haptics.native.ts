import { impactAsync, ImpactFeedbackStyle } from "expo-haptics";
export function memoryMatchHaptic() { void impactAsync(ImpactFeedbackStyle.Soft).catch(() => {}); }
