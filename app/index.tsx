import { useEffect } from "react";
import { Platform } from "react-native";
import { Redirect } from "expo-router";
import { usePictopia } from "@/components/pictopia/provider";

/** First launch goes to onboarding. People who already use Pictopia (photo access given or a
 * library already loaded) are marked onboarded and never see it. */
export default function Index() {
  const app = usePictopia();
  // Browsers always report access; there only a loaded library marks an existing user.
  const existing = (Platform.OS !== "web" && !!app.permission?.granted) || app.stats.total > 0;
  const needsOnboarding = app.ready && !app.prefs.onboarded && !existing;
  useEffect(() => {
    if (app.ready && !app.prefs.onboarded && existing) void app.updatePrefs({ onboarded: true }).catch(() => {});
  }, [app, existing]);
  if (!app.ready && !app.error) return null;
  return <Redirect href={needsOnboarding ? "/onboarding" : "/(tabs)/home"} />;
}
