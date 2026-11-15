import { useLifetimeTest } from "./use-lifetime-test";
import { testProgress } from "@/lib/pictopia/lifetime-testing";
import { useCallback, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { libraryPercent } from "@/lib/pictopia/library-progress";
import { progressResource } from "@/services/progress";
import { usePictopia } from "./provider";

export function useLibraryProgress() {
  const app = usePictopia();
  const [state, setState] = useState(progressResource.get);
  useFocusEffect(useCallback(() => {
    const update = () => setState(progressResource.get());
    const unsubscribe = progressResource.subscribe(update);
    update();
    const refresh = () => { if (app.ready && app.libraryReliable) void progressResource.refresh(app.revision); };
    refresh();
    const subscription = AppState.addEventListener("change", value => { if (value === "active") refresh(); });
    return () => { unsubscribe(); subscription.remove(); };
  }, [app.ready, app.libraryReliable, app.revision]));
  const simulation = useLifetimeTest();
  const progress = simulation ? testProgress(simulation) : state.value?.progress;
  return {
    progress, snapshot: state.value, error: state.error, refreshing: state.refreshing,
    initialLoading: !state.value && !state.error,
    percent: progress ? libraryPercent(progress) : undefined,
  };
}
