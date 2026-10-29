import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { usePictopia } from "./provider";
import { exploreStore } from "@/services/explore";
import { storage } from "@/services/storage";
import type { ExploreAction, ExploreSession } from "@/lib/pictopia/explore";
import type { Media } from "@/lib/pictopia/types";

export function useExplore() {
  const app = usePictopia();
  const [session, setSession] = useState<ExploreSession>();
  const [media, setMedia] = useState<Record<string, Media>>({});
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const lock = useRef(false),
    alive = useRef(true),
    current = useRef(session);
  current.current = session;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const readMedia = useCallback(async (s: ExploreSession) => {
    const rows = await Promise.all(s.ids.map((id) => storage.get(id)));
    if (alive.current)
      setMedia(
        Object.fromEntries(
          rows.filter((m): m is Media => !!m && m.active && !m.deletedAt).map((m) => [m.id, m]),
        ),
      );
  }, []);
  const reload = useCallback(async () => {
    if (!app.ready || lock.current) return;
    try {
      const saved = await exploreStore.load();
      if (saved && alive.current && !lock.current) {
        current.current = saved;
        setSession(saved);
        await readMedia(saved);
      }
    } catch {
      if (alive.current)
        setError("Couldn’t read your saved test. Your original photos are safe. Try again.");
    }
  }, [app.ready, readMedia]);
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );
  useEffect(() => {
    if (current.current) void readMedia(current.current);
  }, [app.revision, readMedia]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void reload();
    });
    return () => subscription.remove();
  }, [reload]);
  const start = useCallback(async () => {
    if (lock.current || !app.ready || app.busy) return;
    lock.current = true;
    setPending(true);
    setError(undefined);
    try {
      const saved = await exploreStore.start();
      await readMedia(saved);
      current.current = saved;
      if (alive.current) setSession(saved);
    } catch {
      if (alive.current) setError("Couldn’t start the test. Check photo access and try again.");
    } finally {
      lock.current = false;
      if (alive.current) setPending(false);
    }
  }, [app.ready, app.busy, readMedia]);
  /** Writes queue in the store's serialized order instead of rejecting, so background
   * page saves never block input. Sessions publish in the same order they were saved. */
  const writes = useRef(0);
  const change = useCallback(
    async (action: ExploreAction | ((current: ExploreSession) => ExploreAction)) => {
      writes.current++;
      lock.current = true;
      setPending(true);
      setError(undefined);
      try {
        const saved = await exploreStore.change(action);
        current.current = saved;
        if (alive.current) setSession(saved);
        return saved;
      } catch (e) {
        if (alive.current)
          setError("Couldn’t save that action. Your place hasn’t changed. Please try again.");
        throw e;
      } finally {
        if (--writes.current === 0) {
          lock.current = false;
          if (alive.current) setPending(false);
        }
      }
    },
    [],
  );
  const getSession = useCallback(() => current.current!, []);
  return { app, session, media, pending, error, start, change, reload, getSession };
}
