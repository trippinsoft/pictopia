import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { usePictopia } from "./provider";
import { adventureStore, type AdventureSlot } from "@/services/adventures";

/** Home's two Adventures and the one-line progress, refreshed whenever Home is shown. */
export function useAdventures() {
  const app = usePictopia();
  const [slots, setSlots] = useState<AdventureSlot[]>();
  const [progress, setProgress] = useState({ explored: 0, setAside: 0 });
  const [error, setError] = useState<string>();
  const alive = useRef(true),
    loading = useRef(false),
    reloadRequested = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const hasPhotos = app.ready && app.stats.total > 0;
  const load = useCallback(async () => {
    if (!hasPhotos) return;
    if (loading.current) {
      reloadRequested.current = true;
      return;
    }
    loading.current = true;
    try {
      do {
        reloadRequested.current = false;
        try {
          const [home, totals] = await Promise.all([adventureStore.home(Date.now(), app.pro), adventureStore.progress()]);
          if (!alive.current) return;
          setSlots(home.slots);
          setProgress(totals);
          setError(undefined);
        } catch {
          if (alive.current) setError("Your adventures couldn’t be prepared just now.");
        }
      } while (reloadRequested.current && alive.current);
    } finally {
      loading.current = false;
    }
  }, [hasPhotos, app.pro]);
  /** "Show me two more". Reports a new pair, exhaustion, or an error separately. */
  const refresh = useCallback(async () => {
    if (!hasPhotos) return "busy" as const;
    // Home may still be preparing its pair; wait for it rather than ignoring the tap.
    for (let waited = 0; loading.current && waited < 15000; waited += 100) await new Promise((resolve) => setTimeout(resolve, 100));
    if (loading.current) return "busy" as const;
    loading.current = true;
    try {
      const next = await adventureStore.refresh(Date.now(), app.pro);
      if (alive.current) {
        setSlots(next.slots);
        setError(undefined);
      }
      return next.unchanged ? "unchanged" as const : "changed" as const;
    } catch {
      if (alive.current) setError("New adventures couldn’t be prepared just now.");
      return "error" as const;
    } finally {
      loading.current = false;
      if (reloadRequested.current && alive.current) void load();
    }
  }, [hasPhotos, app.pro, load]);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  // A library that grows (more photos chosen, a finished sync) can fill an empty slot.
  useEffect(() => {
    void load();
  }, [load, app.stats.photos]);
  return { app, slots, progress, error, hasPhotos, reload: load, refresh };
}
