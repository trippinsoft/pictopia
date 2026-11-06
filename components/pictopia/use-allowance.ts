import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { allowanceStore } from "@/services/daily";
import { allowanceStop } from "@/lib/pictopia/daily";
import type { ExploreSession } from "@/lib/pictopia/explore";

interface Snapshot { counted: Set<string>; left: number; limit: number }

/** The free daily allowance inside the shared review. Each newly presented photo or video
 * counts once per day (the first one too); revisits within a session and assets already
 * counted today are free; Pro is unlimited. `stopBefore` is the first photo ahead that the
 * remaining allowance can't cover, where the feed shows the daily-limit page instead. */
export function useAllowance(session: ExploreSession | undefined, sequence: string[], shown: string | undefined, pro: boolean) {
  const [snap, setSnap] = useState<Snapshot>();
  const [error, setError] = useState(false);
  const counting = useRef(new Set<string>());
  const load = useCallback(async () => {
    try {
      const [state, limit] = await Promise.all([allowanceStore.state(), allowanceStore.limit()]);
      setSnap({ counted: new Set(state.counted), left: Math.max(0, limit - state.counted.length), limit });
      setError(false);
    } catch { setError(true); }
  }, []);
  useEffect(() => {
    void load().catch(() => {});
    // Midnight, or a remote limit fetched while away, takes effect on return.
    const sub = AppState.addEventListener("change", (s) => { if (s === "active") void load().catch(() => {}); });
    // A review left open across midnight starts the new day's allowance without leaving.
    let timer: ReturnType<typeof setTimeout>;
    let alive = true;
    const schedule = () => {
      const midnight = new Date(); midnight.setHours(24, 0, 1, 0);
      timer = setTimeout(() => { void load().catch(() => {}).finally(() => { if (alive) schedule(); }); }, Math.min(midnight.getTime() - Date.now(), 2 ** 31 - 1));
    };
    schedule();
    return () => { alive = false; sub.remove(); clearTimeout(timer); };
  }, [load]);
  const free = useCallback((id: string) => pro || !!snap?.counted.has(id), [pro, snap]);
  useEffect(() => {
    if (!shown || !snap || free(shown) || counting.current.has(shown)) return;
    counting.current.add(shown);
    void allowanceStore.present(shown, pro).then((r) => {
      setSnap({ counted: new Set(r.counted), left: r.left, limit: r.limit });
    }).catch(() => setError(true)).finally(() => counting.current.delete(shown));
  }, [shown, snap, free, pro]);
  const stopBefore = useMemo(() => {
    if (pro || !snap || !session) return undefined;
    return allowanceStop(sequence, session.activeId, snap.left, free);
  }, [pro, snap, session, sequence, free]);
  return { error: !pro && error, ready: pro || !!snap, left: pro ? undefined : snap?.left, limit: snap?.limit, stopBefore, reload: load };
}
