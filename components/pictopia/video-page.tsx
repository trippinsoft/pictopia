import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, StyleSheet, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { VideoView } from "expo-video";
import { useReviewVideo } from "./use-review-video";
import { Icon, Text } from "./ui";
import { VideoScrubber } from "./video-scrubber";
import { clock } from "./video-scrubber-bar";
import type { NativeGesture } from "react-native-gesture-handler";
import { videoSource } from "@/services/video-source";
import { classifyVideoError, videoErrorDetail } from "@/lib/pictopia/video-playback";
import { reviewTrace, tracePhoto } from "@/lib/pictopia/review-trace";
import type { Media } from "@/lib/pictopia/types";

type Phase = "idle" | "resolving" | "cloud" | "downloading" | "ready" | "failed" | "inaccessible";
// A local lookup (or a slow-motion export) is quick; an explicit iCloud download may be large.
const RESOLVE_TIMEOUT = 90000, DOWNLOAD_TIMEOUT = 600000;

/** Playback only: the poster, review credit and discard never wait for it. Only an explicit
 * second tap downloads an iCloud video; stale resolutions and departed/background players
 * cannot start playback. The native player exists only while this video is on screen. */
export function VideoPage({ media, active, playing, onPlayingChange, onReady, nativeScroll }: {
  media: Media; active: boolean; playing: boolean;
  onPlayingChange(playing: boolean): void; onReady?(): void;
  /** The feed's scroll, held still while the progress bar is being dragged. */
  nativeScroll?: NativeGesture;
}) {
  const [phase, setPhase] = useState<Phase>("idle"), [uri, setUri] = useState<string | null>(null);
  const retrieval = useRef<AbortController | undefined>(undefined);
  const generation = useRef(0), requested = useRef(false), foreground = useRef(AppState.currentState === "active"), focused = useRef(false);
  const ready = useRef(onReady); ready.current = onReady;
  const shownSource = useRef(uri); shownSource.current = uri;
  // Other ways to open the same video, tried in turn before playback is reported as failed.
  const fallbacks = useRef<string[]>([]);
  const { player, status, currentTime, owner, ended, retry, error } = useReviewVideo(active);
  /** Stops any source lookup or download in flight; nothing already shown is discarded. */
  const halt = useCallback(() => {
    setPhase(value => value === "downloading" ? "cloud" : value === "resolving" ? "idle" : value);
    retrieval.current?.abort(); generation.current++; requested.current = false;
  }, []);
  useEffect(() => {
    retrieval.current?.abort();
    generation.current++; requested.current = false; fallbacks.current = []; setUri(null); setPhase("idle");
    return () => { retrieval.current?.abort(); generation.current++; };
  }, [media.id]);
  // Effects below depend on stable callbacks and refs only. Recreating the player (retry,
  // or returning to this video) must never look like leaving, or it cancels its own load.
  useEffect(() => {
    if (!active) { halt(); owner.current?.pause(); onPlayingChange(false); }
  }, [active, halt, onPlayingChange]);
  useFocusEffect(useCallback(() => {
    focused.current = true;
    return () => { focused.current = false; halt(); owner.current?.pause(); onPlayingChange(false); };
  }, [halt, onPlayingChange]));
  // Tapping again while a source is still being fetched cancels it (an iCloud download too).
  useEffect(() => {
    if (!playing && requested.current && !uri) { reviewTrace("video.source.cancelled", { photo: tracePhoto(media.id) }); halt(); }
  }, [playing, uri, halt, media.id]);
  useEffect(() => {
    if (!playing || !active || !foreground.current || !focused.current || uri || requested.current) return;
    requested.current = true;
    if (phase === "failed" && status === "error") retry?.();
    const token = generation.current, download = phase === "cloud";
    setPhase(download ? "downloading" : "resolving");
    reviewTrace("video.source.request", { photo: tracePhoto(media.id), download });
    const controller = new AbortController(); retrieval.current?.abort(); retrieval.current = controller;
    const timeout = setTimeout(() => {
      controller.abort();
      if (token !== generation.current) return;
      generation.current++; requested.current = false; setPhase("failed"); onPlayingChange(false);
      reviewTrace("video.source.failed", { photo: tracePhoto(media.id), download, kind: "failed", detail: "timeout" });
    }, download ? DOWNLOAD_TIMEOUT : RESOLVE_TIMEOUT);
    void videoSource(media, download, controller.signal).then(result => {
      if (token !== generation.current || !foreground.current || !focused.current || !active) return;
      reviewTrace("video.source.ready", { photo: tracePhoto(media.id), download, scheme: result.uri.split(":")[0], alternates: result.alternates?.length ?? 0 });
      fallbacks.current = result.alternates ?? [];
      setUri(result.uri); // readyToPlay, not URI resolution, proves playback initialized.
    }).catch((reason: unknown) => {
      if (token !== generation.current) return;
      requested.current = false; onPlayingChange(false);
      const kind = classifyVideoError(reason, download);
      reviewTrace("video.source.failed", { photo: tracePhoto(media.id), download, kind, detail: videoErrorDetail(reason) });
      setPhase(kind);
    }).finally(() => clearTimeout(timeout));
  }, [playing, active, uri, phase, media, onPlayingChange]);
  useEffect(() => {
    owner.current?.pause();
    void owner.current?.replace(active ? uri : null);
    // The player is created in the same commit `active` changes (its effect runs first), so
    // its later state update must not load the same source a second time.
  }, [active, uri, owner]);
  useEffect(() => { if (ended) onPlayingChange(false); }, [ended, onPlayingChange]);
  useEffect(() => {
    if (!uri) return;
    if (status === "readyToPlay") { setPhase("ready"); }
    if (status === "error") {
      const next = fallbacks.current.shift();
      reviewTrace("video.player.failed", { photo: tracePhoto(media.id), scheme: uri.split(":")[0], detail: videoErrorDetail(error), fallback: next?.split(":")[0] ?? null });
      if (next && active) {
        // A fresh player opens the next source; the tap that asked to play still stands.
        retry(); setUri(next); return;
      }
      fallbacks.current = [];
      owner.current?.pause(); requested.current = false; setUri(null); setPhase("failed"); onPlayingChange(false);
    }
  }, [uri, status, player, error, media.id, owner, active, retry, onPlayingChange]);
  useEffect(() => {
    if (playing && active && foreground.current && focused.current && status === "readyToPlay" && uri) owner.current?.play();
    else owner.current?.pause();
  }, [player, uri, playing, active, status]);
  useEffect(() => {
    const app = AppState.addEventListener("change", state => {
      foreground.current = state === "active";
      if (!foreground.current) { halt(); owner.current?.pause(); onPlayingChange(false); }
    });
    return () => { app.remove(); };
  }, [halt, onPlayingChange]);
  const busy = phase === "resolving" || phase === "downloading";
  const seek = useCallback((seconds: number) => { owner.current?.command(p => { p.currentTime = seconds; }); }, [owner]);
  // Only the progress bar takes touches; everything else leaves them to the review gestures.
  return <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
    {!!player && !!uri && active && <View pointerEvents="none" style={StyleSheet.absoluteFill}><VideoView key={uri} player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} onFirstFrameRender={() => { if (active && foreground.current && focused.current && uri === shownSource.current && uri && status === "readyToPlay") ready.current?.(); }} /></View>}
    <View pointerEvents="none" style={StyleSheet.absoluteFill} className="items-center justify-center">
      {busy ? <View className="items-center rounded-3xl bg-black/60 px-5 py-4"><ActivityIndicator color="#fff" /><Text className="mt-2 text-caption text-white">{phase === "downloading" ? "Downloading from iCloud…" : "Opening video…"}</Text>{phase === "downloading" && <Text className="mt-1 text-caption text-white/80">Tap to cancel</Text>}</View>
        : phase === "cloud" ? <View className="max-w-[85%] items-center rounded-3xl bg-black/60 px-5 py-4"><Icon name="CloudDownload" size={30} color="#fff" /><Text className="mt-2 text-center text-caption text-white">In iCloud · tap to download and play</Text><Text className="mt-1 text-center text-caption text-white/80">Swipe sideways to discard without downloading</Text></View>
        : phase === "failed" || phase === "inaccessible" ? <View className="max-w-[85%] items-center rounded-3xl bg-black/60 px-5 py-4"><Text className="text-center text-caption text-white">{phase === "inaccessible" ? "Video unavailable · check library access or scroll to another video" : "Video couldn’t play · tap to retry"}</Text>{phase === "failed" && <Text className="mt-1 text-center text-caption text-white/80">You can still swipe sideways to discard it</Text>}</View>
        : !playing && <View accessibilityElementsHidden className="h-20 w-20 items-center justify-center rounded-full bg-black/55"><Icon name="Play" size={34} color="#fff" fill="#fff" /></View>}
    </View>
    {uri && phase === "ready" && active
      ? <VideoScrubber duration={player?.duration && player.duration > 0 ? player.duration : media.duration} position={currentTime} onSeek={seek} nativeScroll={nativeScroll} />
      : <View pointerEvents="none" className="absolute bottom-4 left-4 rounded-full bg-black/55 px-3 py-1"><Text className="text-caption text-white">{uri ? `${clock(currentTime)} / ` : ""}{clock(media.duration)}</Text></View>}
  </View>;
}
