import { useCallback, useEffect, useRef, useState } from "react";
import { createVideoPlayer, type VideoPlayer } from "expo-video";
import { VideoLifecycle } from "@/lib/pictopia/video-lifecycle";

/** Explicit ownership avoids hook-owned release running ahead of our cleanup effects.
 * A player exists only while `enabled` (the review's on-screen video); leaving releases it,
 * so neighbouring cards never hold idle native players. */
export function useReviewVideo(enabled = true) {
  const [generation, setGeneration] = useState(0);
  const retry = useCallback(() => { setPlayer(undefined); setStatus("idle"); setError(undefined); setGeneration(value => value + 1); }, []);
  const [ended, setEnded] = useState(0);
  const [player, setPlayer] = useState<VideoPlayer>();
  const [status, setStatus] = useState("idle"), [currentTime, setTime] = useState(0);
  // The native reason for the latest failure, kept for diagnostics only.
  const [error, setError] = useState<unknown>();
  const owner = useRef<VideoLifecycle<VideoPlayer> | undefined>(undefined);
  useEffect(() => {
    if (!enabled) { setPlayer(undefined); setStatus("idle"); return; }
    let live = true;
    const lease = new VideoLifecycle<VideoPlayer>(reason => { if (live) { setError(reason); setStatus("error"); } });
    owner.current = lease;
    try {
      const native = createVideoPlayer(null);
      lease.attach(native);
      native.loop = false; native.timeUpdateEventInterval = 0.5;
      // Register each remover immediately; partial listener setup can fail too.
      const statusSubscription = native.addListener("statusChange", event => {
        if (!live || !lease.live) return;
        if (event.status === "error") setError(event.error?.message ?? "player error");
        setStatus(event.status);
      });
      lease.listen(() => statusSubscription.remove());
      const timeSubscription = native.addListener("timeUpdate", event => { if (live && lease.live) setTime(event.currentTime); });
      lease.listen(() => timeSubscription.remove());
      const endSubscription = native.addListener("playToEnd", () => { if (live && lease.live) { lease.pause(); lease.command(p => { p.currentTime = 0; }); setEnded(value => value + 1); } });
      lease.listen(() => endSubscription.remove());
      setPlayer(native);
    } catch (reason) { setError(reason); setStatus("error"); lease.dispose(); }
    return () => { live = false; lease.dispose(); if (owner.current === lease) owner.current = undefined; };
  }, [generation, enabled]);
  return { player, status, currentTime, owner, ended, retry, error };
}
