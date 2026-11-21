import { useCallback, useState } from "react";
import { AppState, Platform } from "react-native";
import { useFocusEffect } from "expo-router";
import { localDate } from "@/lib/pictopia/daily";

/** Refresh date-sensitive cards without requiring a trip into a review. */
export function useLocalDay() {
  const [day, setDay] = useState(() => localDate(Date.now()));
  useFocusEffect(useCallback(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      clearTimeout(timer);
      const now = new Date();
      setDay(localDate(now.getTime()));
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      timer = setTimeout(refresh, Math.max(1000, midnight.getTime() - now.getTime() + 100));
    };
    refresh();
    const subscription = AppState.addEventListener("change", state => { if (state === "active") refresh(); });
    const page = Platform.OS === "web" ? globalThis.document : undefined;
    const visible = () => { if (page?.visibilityState === "visible") refresh(); };
    page?.addEventListener("visibilitychange", visible);
    return () => { clearTimeout(timer); subscription.remove(); page?.removeEventListener("visibilitychange", visible); };
  }, []));
  return day;
}
