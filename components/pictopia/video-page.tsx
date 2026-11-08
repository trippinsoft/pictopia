import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, StyleSheet, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { VideoView } from "expo-video";
import { useReviewVideo } from "./use-review-video";
import { Icon, Text } from "./ui";
import { videoSource } from "@/services/video-source";
import { CLOUD_ONLY } from "@/services/media-errors";
import type { Media } from "@/lib/pictopia/types";

type Phase = "idle" | "resolving" | "cloud" | "downloading" | "ready" | "failed" | "inaccessible";
const clock = (seconds: number) => { const value = Number.isFinite(seconds) ? Math.max(0, seconds) : 0; return `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`; };

/** Poster availability never gates playback. Only an explicit second tap downloads an
 * iCloud original; stale resolutions and departed/background players cannot start playback. */
export function VideoPage({ media, active, playing, onPlayingChange, onReady }: {
  media: Media; active: boolean; playing: boolean;
  onPlayingChange(playing: boolean): void; onReady?(): void;
}) {
  const [phase, setPhase] = useState<Phase>("idle"), [uri, setUri] = useState<string | null>(null);
  const retrieval = useRef<AbortController | undefined>(undefined);
  const generation = useRef(0), requested = useRef(false), foreground = useRef(AppState.currentState === "active"), focused = useRef(false);
  const ready = useRef(onReady); ready.current = onReady;
  const shownSource = useRef(uri); shownSource.current = uri;
  const { player, status, currentTime, owner, ended, retry } = useReviewVideo();
  useEffect(() => {
    retrieval.current?.abort();
    generation.current++; requested.current = false; setUri(null); setPhase("idle");
    return () => { retrieval.current?.abort(); generation.current++; };
  }, [media.id]);
  useEffect(() => {
    if (!active) { setPhase(value => value === "downloading" || value === "resolving" ? "idle" : value); retrieval.current?.abort(); generation.current++; requested.current = false; owner.current?.pause(); onPlayingChange(false); }
  }, [active, player, onPlayingChange]);
  useFocusEffect(useCallback(() => {
    focused.current = true;
    return () => { focused.current = false; setPhase(value => value === "downloading" || value === "resolving" ? "idle" : value); retrieval.current?.abort(); generation.current++; requested.current = false; owner.current?.pause(); onPlayingChange(false); };
  }, [player, onPlayingChange]));
  useEffect(() => {
    if (!playing || !active || !foreground.current || !focused.current || uri || requested.current) return;
    requested.current = true;
    if (phase === "failed" && status === "error") retry?.();
    const token = generation.current, download = phase === "cloud";
    setPhase(download ? "downloading" : "resolving");
    const controller = new AbortController(); retrieval.current?.abort(); retrieval.current = controller;
    const timeout = setTimeout(() => { controller.abort(); if (token === generation.current) { generation.current++; requested.current = false; setPhase("failed"); onPlayingChange(false); } }, 90000);
    void videoSource(media, download, controller.signal).then(result => {
      if (token !== generation.current || !foreground.current || !focused.current || !active) return;
      setUri(result.uri); // readyToPlay, not URI resolution, proves playback initialized.
    }).catch((error: unknown) => {
      if (token !== generation.current) return;
      requested.current = false; onPlayingChange(false);
      const message = error instanceof Error ? error.message : "";
      setPhase(!download && message === CLOUD_ONLY ? "cloud" : /unavailable|access|changed outside/i.test(message) ? "inaccessible" : "failed");
    }).finally(() => clearTimeout(timeout));
  }, [playing, active, uri, phase, media, onPlayingChange]);
  useEffect(() => {
    owner.current?.pause();
    void owner.current?.replace(active ? uri : null);
  }, [player, active, uri, owner]);
  useEffect(() => { if (ended) onPlayingChange(false); }, [ended, onPlayingChange]);
  useEffect(() => {
    if (!uri) return;
    if (status === "readyToPlay") { setPhase("ready"); }
    if (status === "error") { owner.current?.pause(); requested.current = false; setUri(null); setPhase("failed"); onPlayingChange(false); }
  }, [uri, status, player, onPlayingChange]);
  useEffect(() => {
    if (playing && active && foreground.current && focused.current && status === "readyToPlay" && uri) owner.current?.play();
    else owner.current?.pause();
  }, [player, uri, playing, active, status]);
  useEffect(() => {
    const app = AppState.addEventListener("change", state => {
      foreground.current = state === "active";
      if (!foreground.current) { setPhase(value => value === "downloading" || value === "resolving" ? "idle" : value); retrieval.current?.abort(); generation.current++; requested.current = false; owner.current?.pause(); onPlayingChange(false); }
    });
    return () => { app.remove(); };
  }, [player, onPlayingChange]);
  const busy = phase === "resolving" || phase === "downloading";
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    {!!player && !!uri && active && <VideoView key={uri} player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} onFirstFrameRender={() => { if (active && foreground.current && focused.current && uri === shownSource.current && uri && status === "readyToPlay") ready.current?.(); }} />}
    <View style={StyleSheet.absoluteFill} className="items-center justify-center">
      {busy ? <View className="items-center rounded-3xl bg-black/60 px-5 py-4"><ActivityIndicator color="#fff" /><Text className="mt-2 text-caption text-white">{phase === "downloading" ? "Downloading from iCloud…" : "Opening video…"}</Text></View>
        : phase === "cloud" ? <View className="items-center rounded-3xl bg-black/60 px-5 py-4"><Icon name="CloudDownload" size={30} color="#fff" /><Text className="mt-2 text-caption text-white">In iCloud · tap to download and play</Text></View>
        : phase === "failed" || phase === "inaccessible" ? <View className="max-w-[85%] items-center rounded-3xl bg-black/60 px-5 py-4"><Text className="text-center text-caption text-white">{phase === "inaccessible" ? "Video unavailable · check library access or scroll to another video" : "Video couldn’t play · tap to retry"}</Text></View>
        : !playing && <View accessibilityElementsHidden className="h-20 w-20 items-center justify-center rounded-full bg-black/55"><Icon name="Play" size={34} color="#fff" fill="#fff" /></View>}
    </View>
    <View className="absolute bottom-4 left-4 rounded-full bg-black/55 px-3 py-1"><Text className="text-caption text-white">{uri ? `${clock(currentTime)} / ` : ""}{clock(media.duration)}</Text></View>
  </View>;
}
