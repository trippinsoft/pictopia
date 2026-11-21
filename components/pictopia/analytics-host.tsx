import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import { usePathname } from "expo-router";
import { analyticsScreen } from "@/lib/pictopia/analytics-policy";
import { flushAnalytics, trackAnalytics, trackScreen } from "@/services/analytics";

export function AnalyticsHost() {
  const path = usePathname();
  const opened = useRef(false);
  const lastScreen = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!opened.current) {
      opened.current = true;
      trackAnalytics("app_opened");
    }
    if (Platform.OS === "web") {
      const page = globalThis.document;
      if (!page) return;
      const onVisibility = () => {
        if (page.visibilityState === "visible") trackAnalytics("app_foregrounded");
        else flushAnalytics();
      };
      page.addEventListener("visibilitychange", onVisibility);
      return () => page.removeEventListener("visibilitychange", onVisibility);
    }
    let previous = AppState.currentState;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active" && previous !== "active") trackAnalytics("app_foregrounded");
      else if (state !== "active") flushAnalytics();
      previous = state;
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const screen = analyticsScreen(path);
    if (screen && screen !== lastScreen.current) trackScreen(path);
    lastScreen.current = screen;
  }, [path]);

  return null;
}
