import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { usePictopia } from "./provider";
import { exploreStore, exploreStoreFor, type ExploreStore } from "@/services/explore";
import { ReviewState } from "@/lib/pictopia/review-state";
import { storage } from "@/services/storage";
import type { ExploreAction, ExploreSession } from "@/lib/pictopia/explore";
import type { Media } from "@/lib/pictopia/types";

/** The explorer's session: an Adventure's (by its session key) or, without a key, the
 * original prototype's, which is started on demand. */
export function useExplore(key?: string) {
  const app = usePictopia();
  const store: ExploreStore = useMemo(() => (key ? exploreStoreFor(key) : exploreStore), [key]);
  const [snapshot, setSnapshot] = useState<{ session?: ExploreSession; media: Record<string, Media> }>({ media: {} });
  const { session, media } = snapshot;
  const publish = useCallback((session: ExploreSession | undefined, media?: Record<string, Media>) => {
    setSnapshot(previous => ({ session, media: media ?? previous.media }));
  }, []);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const lock = useRef(false),
    alive = useRef(true),
    current = useRef(session);
  const state = useRef(new ReviewState());
  const dirtyQueue = useRef(false);
  const refresh = useRef(app.refresh); refresh.current = app.refresh;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (dirtyQueue.current) void refresh.current().catch(() => {});
    };
  }, []);
  const readMedia = useCallback(async (s: ExploreSession) => {
    const rows = await Promise.all(s.ids.map((id) => storage.get(id)));
    return Object.fromEntries(rows.filter((m): m is Media => !!m && m.active && !m.deletedAt).map(m => [m.id, m]));
  }, []);
  const reloadRequested = useRef(false);
  const reload = useCallback(async () => {
    if (!app.ready) return;
    if (lock.current) { reloadRequested.current = true; return; }
    try {
      const before = current.current;
      const saved = await store.load();
      if (saved && alive.current && !lock.current && current.current === before) {
        const rows = await readMedia(saved);
        if (!alive.current || lock.current || current.current !== before) return;
        state.current.load(saved); current.current = state.current.value;
        publish(current.current, rows); setError(undefined);
      }
    } catch {
      if (alive.current)
        setError("Couldn’t read your saved review. Your original photos are safe. Try again.");
    }
  }, [app.ready, readMedia, store, publish]);
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );
  useEffect(() => {
    if (current.current) void reload();
  }, [app.revision, reload]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void reload();
    });
    return () => subscription.remove();
  }, [reload]);
  const start = useCallback(async () => {
    if (lock.current || !app.ready || app.busy || !store.start) return;
    lock.current = true;
    setPending(true);
    setError(undefined);
    try {
      const saved = await store.start();
      const rows = await readMedia(saved);
      state.current.load(saved); current.current = state.current.value;
      if (alive.current) publish(current.current, rows);
    } catch {
      if (alive.current) setError("Couldn’t start the review. Check photo access and try again.");
    } finally {
      lock.current = false;
      if (alive.current) setPending(false);
    }
  }, [app.ready, app.busy, readMedia, store, publish]);
  /** Writes queue in the store's serialized order instead of rejecting, so background
   * page saves never block input. Sessions publish in the same order they were saved. */
  const writes = useRef(0);
  const change = useCallback(
    async (action: ExploreAction | ((current: ExploreSession) => ExploreAction)) => {
      const token = state.current.enqueue(action);
      current.current = state.current.value;
      if (alive.current) publish(current.current);
      writes.current++;
      lock.current = true;
      setPending(true);
      setError(undefined);
      try {
        const saved = await store.change(action);

        state.current.settle(token, saved); current.current = state.current.value;
        if (alive.current) { publish(current.current); setError(undefined); }
        if (saved.review) dirtyQueue.current = true;
        return saved;
      } catch (e) {
        state.current.settle(token); current.current = state.current.value;
        if (alive.current) publish(current.current);
        if (alive.current)
          setError("Couldn’t save that action. Please try again. Your original photos are safe.");
        throw e;
      } finally {
        if (--writes.current === 0) {
          lock.current = false;
          if (alive.current) { setPending(false); if (reloadRequested.current) { reloadRequested.current = false; void reload(); } }
          else if (dirtyQueue.current) void refresh.current().catch(() => {});
        }
      }
    },
    [store, publish, reload],
  );
  const getSession = useCallback(() => current.current!, []);
  return { app, session, media, pending, error, start, change, reload, getSession };
}
