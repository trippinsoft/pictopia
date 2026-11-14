import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { allowanceStore } from "@/services/daily";
import { devOverrideStore } from "@/services/entitlement";
import { allowanceStop } from "@/lib/pictopia/daily";
import type { ExploreSession } from "@/lib/pictopia/explore";
import { rewardEvents } from "@/services/reward-events";

interface Snapshot { counted: Set<string>; left: number; limit: number; date: string }

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
  const date = useRef<string | undefined>(undefined);
  const accept = useCallback((result: { counted: string[]; left: number; limit: number; date: string }, omit?: string) => {
    const pending = [...counting.current].filter(id => id !== omit && !result.counted.includes(id));
    setSnap({ counted: new Set([...result.counted, ...pending]), left: Math.max(0, result.left - pending.length), limit: result.limit, date: result.date });
    if (date.current && date.current !== result.date) setWaived(new Set());
    date.current = result.date;
  }, []);
  // Photos whose review Undo gave back: showing them again in this review stays free, so the
  // returned review isn't spent the moment the photo slides back into view.
  const [waived, setWaived] = useState<ReadonlySet<string>>(new Set());
  const load = useCallback(async () => {
    try {
      accept(await allowanceStore.snapshot());
      setError(false);
    } catch { setError(true); }
  }, [accept]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
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
    const stopRewards = rewardEvents.subscribe(() => { void load(); });
    return () => { alive = false; sub.remove(); clearTimeout(timer); stopDev(); stopRewards(); };
  }, [load]);
  const free = useCallback((id: string) => pro || waived.has(id) || !!snap?.counted.has(id), [pro, snap, waived]);
  /** Undo of a discard returns that photo's free review to today's allowance. */
  const refund = useCallback((id: string | undefined) => {
    if (pro || !id) return;
    setWaived(previous => new Set([...previous, id]));
    void allowanceStore.refund(id).then(r => {
      accept(r);
    }).catch(() => { setWaived(previous => new Set([...previous].filter(value => value !== id))); setError(true); });
  }, [pro, accept]);
  useEffect(() => {
    if (error || !foreground || !focused || !viewable || !shown || !snap || (!pro && snap.left <= 0) || free(shown) || counting.current.has(shown)) return;
    counting.current.add(shown);
    // Reserve locally before the serialized durable charge resolves; fast paging must
    // not spend the same last slot on several assets.
    if (!pro) setSnap(previous => previous && previous.left > 0 ? { ...previous, counted: new Set([...previous.counted, shown]), left: previous.left - 1 } : previous);
    void allowanceStore.present(shown, pro).then((r) => {
      accept(r, shown);
    }).catch(() => {
      setSnap(previous => previous ? { ...previous, counted: new Set([...previous.counted].filter(id => id !== shown)) } : previous);
      setError(true);
    }).finally(() => counting.current.delete(shown));
  }, [shown, snap, free, pro, viewable, foreground, focused, accept, error]);
  const stopBefore = useMemo(() => {
    if (pro || !snap || !session) return undefined;
    // A loading/failed current item has not spent a slot. Do not let that
    // reservation block the next item when a free review is still available.
    return allowanceStop(sequence, shown ?? session.activeId, snap.left,
      id => free(id) || (snap.left > 0 && !viewable && id === shown));
  }, [pro, snap, session, sequence, free, shown, viewable]);
  const canReview = useCallback((id: string) => pro || waived.has(id) || (!!snap && (snap.left > 0 || snap.counted.has(id))), [pro, snap, waived]);
  return { canReview, refund, error: !pro && error, ready: pro || !!snap, left: pro ? undefined : snap?.left, limit: snap?.limit, stopBefore, reload: load };
}
