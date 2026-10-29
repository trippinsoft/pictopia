import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import { useFocusEffect } from "expo-router";
import { ReviewClock } from "@/lib/pictopia/review-clock";
/**
 * Live review timer for one session. Signals (focus, AppState, page visibility, photo readiness)
 * drive a ReviewClock; counted time is persisted every few seconds and immediately on pause,
 * blur, or backgrounding, so it survives navigation, screen lock and termination.
 * Returns the elapsed milliseconds to display, including time not yet saved.
 */
export function useReviewClock({
  sessionId,
  enabled,
  ready,
  persistedMs,
  save,
  onError,
}: {
  sessionId?: string;
  enabled: boolean;
  ready: boolean;
  persistedMs: number;
  save: (id: string, ms: number) => Promise<void>;
  onError: (message: string) => void;
}) {
  const clock = useRef<ReviewClock | null>(null);
  if (!clock.current) clock.current = new ReviewClock(() => Date.now());
  const inflight = useRef(0);
  const target = useRef({ sessionId, save, onError });
  target.current = { sessionId, save, onError };
  const [, setTick] = useState(0);
  const flush = useCallback((force: boolean) => {
    const c = clock.current!;
    const id = target.current.sessionId;
    if (!id) return;
    for (let amount = c.take(force); amount > 0; amount = force ? c.take(true) : 0) {
      const ms = amount;
      inflight.current += ms;
      void target.current
        .save(id, ms)
        .catch((e: Error) => {
          c.restore(ms);
          target.current.onError(e.message);
        })
        .finally(() => {
          inflight.current -= ms;
          setTick((n) => n + 1);
        });
    }
  }, []);
  // A different session starts from its own persisted value. The previous session's time was
  // already flushed when it completed or lost readiness.
  const sessionRef = useRef(sessionId);
  if (sessionRef.current !== sessionId) {
    sessionRef.current = sessionId;
    clock.current.reset();
    inflight.current = 0;
  }
  useEffect(() => {
    clock.current!.set({ ready: enabled && ready });
    if (!(enabled && ready)) flush(true);
  }, [enabled, ready, sessionId, flush]);
  useFocusEffect(
    useCallback(() => {
      clock.current!.set({ focused: true, active: AppState.currentState === "active" });
      return () => {
        clock.current!.set({ focused: false });
        flush(true);
      };
    }, [flush]),
  );
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      clock.current!.set({ active: state === "active" });
      if (state !== "active") flush(true);
    });
    const doc =
      Platform.OS === "web" && typeof globalThis.document !== "undefined"
        ? globalThis.document
        : undefined;
    const onVisibility = () => {
      const visible = doc?.visibilityState === "visible";
      clock.current!.set({ visible });
      if (!visible) flush(true);
    };
    doc?.addEventListener("visibilitychange", onVisibility);
    if (doc) onVisibility();
    return () => {
      subscription.remove();
      doc?.removeEventListener("visibilitychange", onVisibility);
    };
  }, [flush]);
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => {
      clock.current!.sample();
      flush(false);
      setTick((n) => n + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [enabled, flush]);
  return persistedMs + inflight.current + clock.current.unsaved;
}
