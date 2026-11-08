import { useCallback, useEffect, useRef, useState } from "react";
import { createVideoPlayer, type VideoPlayer } from "expo-video";
import { VideoLifecycle } from "@/lib/pictopia/video-lifecycle";

/** Explicit ownership avoids hook-owned release running ahead of our cleanup effects. */
export function useReviewVideo() {
  const [generation, setGeneration] = useState(0);
  const retry = useCallback(() => { setPlayer(undefined); setStatus("idle"); setGeneration(value => value + 1); }, []);
  const [ended, setEnded] = useState(0);
  const [player, setPlayer] = useState<VideoPlayer>();
  const [status, setStatus] = useState("idle"), [currentTime, setTime] = useState(0);
  const owner = useRef<VideoLifecycle<VideoPlayer> | undefined>(undefined);
  useEffect(() => {
    let live = true;
    const lease = new VideoLifecycle<VideoPlayer>(() => { if (live) setStatus("error"); });
    owner.current = lease;
    try {
      const native = createVideoPlayer(null);
      lease.attach(native);
      native.loop = false; native.timeUpdateEventInterval = 0.5;
      // Register each remover immediately; partial listener setup can fail too.
      const statusSubscription = native.addListener("statusChange", event => { if (live && lease.live) setStatus(event.status); });
      lease.listen(() => statusSubscription.remove());
      const timeSubscription = native.addListener("timeUpdate", event => { if (live && lease.live) setTime(event.currentTime); });
      lease.listen(() => timeSubscription.remove());
      const endSubscription = native.addListener("playToEnd", () => { if (live && lease.live) { lease.pause(); lease.command(p => { p.currentTime = 0; }); setEnded(value => value + 1); } });
      lease.listen(() => endSubscription.remove());
      setPlayer(native);
    } catch { setStatus("error"); lease.dispose(); }
    return () => { live = false; lease.dispose(); if (owner.current === lease) owner.current = undefined; };
  }, [generation]);
  return { player, status, currentTime, owner, ended, retry };
}
