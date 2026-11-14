import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { allowanceStore } from "@/services/daily";
import { devOverrideStore } from "@/services/entitlement";
import { allowanceStop } from "@/lib/pictopia/daily";
import type { ExploreSession } from "@/lib/pictopia/explore";

interface Snapshot { counted: Set<string>; left: number; limit: number }

/** The free daily allowance inside the shared review. Each newly presented photo or video
 * counts once per day (the first one too); revisits within a session and assets already
 * counted today are free; Pro is unlimited. `stopBefore` is the first photo ahead that the
 * remaining allowance can't cover, where the feed shows the daily-limit page instead. */
export function useAllowance(session: ExploreSession | undefined, sequence: string[], shown: string | undefined, pro: boolean, viewable: boolean) {
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  const [focused, setFocused] = useState(false);
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
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
    const sub = AppState.addEventListener("change", (s) => { setForeground(s === "active"); if (s === "active") void load().catch(() => {}); });
    // A review left open across midnight starts the new day's allowance without leaving.
    let timer: ReturnType<typeof setTimeout>;
    let alive = true;
    const schedule = () => {
      const midnight = new Date(); midnight.setHours(24, 0, 1, 0);
      timer = setTimeout(() => { void load().catch(() => {}).finally(() => { if (alive) schedule(); }); }, Math.min(midnight.getTime() - Date.now(), 2 ** 31 - 1));
    };
    schedule();
    // Developer tools: a testing limit or a usage reset applies to an open review at once.
    const stopDev = devOverrideStore.subscribe(() => { void load().catch(() => {}); });
    return () => { alive = false; sub.remove(); clearTimeout(timer); stopDev(); };
  }, [load]);
  const free = useCallback((id: string) => pro || !!snap?.counted.has(id), [pro, snap]);
  useEffect(() => {
    if (!foreground || !focused || !viewable || !shown || !snap || (!pro && snap.left <= 0) || free(shown) || counting.current.has(shown)) return;
    counting.current.add(shown);
    // Reserve locally before the serialized durable charge resolves; fast paging must
    // not spend the same last slot on several assets.
    if (!pro) setSnap(previous => previous && previous.left > 0 ? { ...previous, counted: new Set([...previous.counted, shown]), left: previous.left - 1 } : previous);
    void allowanceStore.present(shown, pro).then((r) => {
      const reserved = new Set([...r.counted, ...[...counting.current].filter(id => id !== shown || r.allowed)]);
      setSnap({ counted: reserved, left: Math.max(0, r.limit - reserved.size), limit: r.limit });
    }).catch(() => setError(true)).finally(() => counting.current.delete(shown));
  }, [shown, snap, free, pro, viewable, foreground, focused]);
  const stopBefore = useMemo(() => {
    if (pro || !snap || !session) return undefined;
    // A loading/failed current item has not spent a slot. Do not let that
    // reservation block the next item when a free review is still available.
    return allowanceStop(sequence, shown ?? session.activeId, snap.left,
      id => free(id) || (snap.left > 0 && !viewable && id === shown));
  }, [pro, snap, session, sequence, free, shown, viewable]);
  const canReview = useCallback((id: string) => pro || (!!snap && (snap.left > 0 || snap.counted.has(id))), [pro, snap]);
  return { canReview, error: !pro && error, ready: pro || !!snap, left: pro ? undefined : snap?.left, limit: snap?.limit, stopBefore, reload: load };
}
