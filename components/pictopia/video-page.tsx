import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, StyleSheet, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useEvent } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import { Icon, Text } from "./ui";
import { mediaService } from "@/services/media";
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
  const generation = useRef(0), requested = useRef(false), foreground = useRef(true);
  const ready = useRef(onReady); ready.current = onReady;
  const player = useVideoPlayer(null, p => { p.loop = false; p.timeUpdateEventInterval = 0.5; });
  const { status } = useEvent(player, "statusChange", { status: player.status });
  const { currentTime } = useEvent(player, "timeUpdate", { currentTime: 0, currentLiveTimestamp: null, currentOffsetFromLive: null, bufferedPosition: 0 });
  useEffect(() => {
    generation.current++; requested.current = false; setUri(null); setPhase("idle");
    return () => { generation.current++; };
  }, [media.id]);
  useEffect(() => {
    if (!active) { generation.current++; requested.current = false; player.pause(); onPlayingChange(false); }
  }, [active, player, onPlayingChange]);
  useFocusEffect(useCallback(() => {
    foreground.current = true;
    return () => { foreground.current = false; generation.current++; requested.current = false; player.pause(); onPlayingChange(false); };
  }, [player, onPlayingChange]));
  useEffect(() => {
    if (!playing || !active || !foreground.current || uri || requested.current) return;
    requested.current = true;
    const token = generation.current, download = phase === "cloud";
    setPhase(download ? "downloading" : "resolving");
    void mediaService.resolve(media, { download }).then(result => {
      if (token !== generation.current || !foreground.current) return;
      setUri(result.uri); // readyToPlay, not URI resolution, proves playback initialized.
    }).catch((error: unknown) => {
      if (token !== generation.current) return;
      requested.current = false; onPlayingChange(false);
      const message = error instanceof Error ? error.message : "";
      setPhase(!download && message === CLOUD_ONLY ? "cloud" : /unavailable|access|changed outside/i.test(message) ? "inaccessible" : "failed");
    });
  }, [playing, active, uri, phase, media, onPlayingChange]);
  useEffect(() => {
    let alive = true;
    player.pause();
    void player.replaceAsync(active ? uri : null).catch(() => {
      if (alive && active && uri) { requested.current = false; setUri(null); setPhase("failed"); onPlayingChange(false); }
    });
    return () => { alive = false; player.pause(); };
  }, [player, active, uri, onPlayingChange]);
  useEffect(() => {
    if (!uri) return;
    if (status === "readyToPlay") { setPhase("ready"); }
    if (status === "error") { player.pause(); requested.current = false; setUri(null); setPhase("failed"); onPlayingChange(false); }
  }, [uri, status, player, onPlayingChange]);
  useEffect(() => {
    if (playing && active && foreground.current && status === "readyToPlay" && uri) player.play();
    else player.pause();
  }, [player, uri, playing, active, status]);
  useEffect(() => {
    const ended = player.addListener("playToEnd", () => { player.currentTime = 0; onPlayingChange(false); });
    const app = AppState.addEventListener("change", state => {
      foreground.current = state === "active";
      if (!foreground.current) { generation.current++; requested.current = false; player.pause(); onPlayingChange(false); }
    });
    return () => { ended.remove(); app.remove(); };
  }, [player, onPlayingChange]);
  const busy = phase === "resolving" || phase === "downloading";
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    {!!uri && active && <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} onFirstFrameRender={() => { if (active && foreground.current) ready.current?.(); }} />}
    <View style={StyleSheet.absoluteFill} className="items-center justify-center">
      {busy ? <View className="items-center rounded-3xl bg-black/60 px-5 py-4"><ActivityIndicator color="#fff" /><Text className="mt-2 text-caption text-white">{phase === "downloading" ? "Downloading from iCloud…" : "Opening video…"}</Text></View>
        : phase === "cloud" ? <View className="items-center rounded-3xl bg-black/60 px-5 py-4"><Icon name="CloudDownload" size={30} color="#fff" /><Text className="mt-2 text-caption text-white">In iCloud · tap to download and play</Text></View>
        : phase === "failed" || phase === "inaccessible" ? <View className="max-w-[85%] items-center rounded-3xl bg-black/60 px-5 py-4"><Text className="text-center text-caption text-white">{phase === "inaccessible" ? "Video unavailable · check library access or scroll to another video" : "Video couldn’t play · tap to retry"}</Text></View>
        : !playing && <View accessibilityElementsHidden className="h-20 w-20 items-center justify-center rounded-full bg-black/55"><Icon name="Play" size={34} color="#fff" fill="#fff" /></View>}
    </View>
    <View className="absolute bottom-4 left-4 rounded-full bg-black/55 px-3 py-1"><Text className="text-caption text-white">{uri ? `${clock(currentTime)} / ` : ""}{clock(media.duration)}</Text></View>
  </View>;
}
