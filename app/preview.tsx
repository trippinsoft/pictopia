import { ScreenHeader } from "@/components/pictopia/navigation-header";
import React, { useState, useEffect, useCallback, useRef } from "react";
import { View, Pressable, ScrollView, Platform, AppState } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { LivePhoto } from "@/components/pictopia/live-photo";
import { usePhotoEncounter } from "@/components/pictopia/use-photo-encounter";
import { ZoomPhoto } from "@/components/pictopia/zoom-photo";

import { useVideoPlayer, VideoView } from "expo-video";
import { Text, Icon, Empty, Loading, Button } from "@/components/pictopia/ui";
import { usePictopia } from "@/components/pictopia/provider";
import { repository, storage } from "@/services/repository";
import { mediaService } from "@/services/media";
import { CLOUD_ONLY } from "@/services/media-errors";
import { Media } from "@/lib/pictopia/types";
import { bytes } from "@/lib/pictopia/logic";
function Video({ uri, autoplay, onReady }: { uri: string; autoplay: boolean; onReady(): void }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    if (autoplay) p.play();
  });
  useFocusEffect(useCallback(() => () => player.pause(), [player]));
  useEffect(() => { const sub = AppState.addEventListener("change", state => { if (state !== "active") player.pause(); }); return () => sub.remove(); }, [player]);
  return (
    <VideoView
      player={player}
      onFirstFrameRender={onReady}
      style={videoStyle}
      nativeControls
      contentFit="contain"
      fullscreenOptions={{ enable: true }}
    />
  );
}
export default function Preview() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const app = usePictopia();
  const downloadGeneration = useRef(0);
  useEffect(() => () => { downloadGeneration.current++; }, [id]);
  const [loadedId, setLoadedId] = useState<string>();
  usePhotoEncounter(id, loadedId === id, undefined, undefined, app.setError);
  const [m, setM] = useState<Media>(),
    [uri, setUri] = useState<string>(),
    [error, setError] = useState(""),
    [details, setDetails] = useState(false),
    [motion, setMotion] = useState(false),
    [changing, setChanging] = useState(false),
    [downloading, setDownloading] = useState(false);
  async function change(decision: "keep" | "delete") {
    if (!m) return;
    setChanging(true);
    try {
      await app.changeDecision(m.id, decision);
      setM({ ...m, decision });
    } catch (e) {
      app.setError((e as Error).message);
    } finally {
      setChanging(false);
    }
  }
  useEffect(() => {
    let active = true;
    void storage
      .get(id)
      .then(async (item) => {
        if (!item) throw Error("This item is no longer available.");
        if (active) setM(item);
        const resolved = await mediaService.resolve(item).catch(async (e: Error) => {
          // Native photos display straight from the library (including iCloud originals),
          // so a missing local file only matters for video playback.
          if (Platform.OS !== "web" && item.type === "photo")
            return { uri: item.uri, size: await mediaService.size(item) } as { uri: string; size?: number; systemFavorite?: boolean };
          throw e;
        });
        const updated = {
          ...item,
          size: resolved.size ?? item.size ?? await mediaService.size(item),
          systemFavorite: resolved.systemFavorite ?? item.systemFavorite,
        };
        if (active) {
          setM(updated);
          setUri(resolved.uri);
        }
        if ("size" in resolved)
          await repository.update(item.id, (latest) => ({
            ...latest,
            size: latest.modified === item.modified ? updated.size ?? latest.size : latest.size,
            systemFavorite: resolved.systemFavorite ?? latest.systemFavorite,
          }));
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [id, app.revision]);
  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="mx-auto w-full max-w-6xl flex-1">
        <View className="px-5">
          <ScreenHeader title={m?.type === "video" ? "Video preview" : "Photo preview"} fallback="/(tabs)/swipe" action={<View className="flex-row">
            <Pressable
              accessibilityRole="button"
              disabled={!m}
              accessibilityState={{ disabled: !m }}
              accessibilityLabel={m?.favorite ? "Remove app favorite" : "Add app favorite"}
              onPress={() => {
                if (m)
                  void repository
                    .favorite(m.id)
                    .then(app.refresh)
                    .catch((e) => app.setError(e.message));
              }}
              className={`h-12 w-12 items-center justify-center rounded-full bg-card active:opacity-70 ${!m ? "opacity-40" : ""}`}
            >
              <Icon
                name="Heart"
                size={23}
                className={m?.favorite ? "text-destructive" : "text-muted-foreground"}
              />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={!m}
              accessibilityState={{ disabled: !m }}
              accessibilityLabel="Media details"
              onPress={() => setDetails(!details)}
              className={`h-12 w-12 items-center justify-center rounded-full bg-card active:opacity-70 ${!m ? "opacity-40" : ""}`}
            >
              <Icon name="Info" size={23} className="text-muted-foreground" />
            </Pressable>
          </View>} />
        </View>
        <View className="flex-1 overflow-hidden">
          {error ? (
            <Empty
              icon="CloudOff"
              title={m?.type === "video" ? "Video unavailable" : "This photo isn’t available locally"}
              description={error}
              action={m?.type === "video" && error === CLOUD_ONLY ? <Button disabled={downloading} onPress={() => {
                const ticket = ++downloadGeneration.current;
                setDownloading(true);
                void mediaService.resolve(m, { download: true }).then(value => { if (ticket === downloadGeneration.current) { setUri(value.uri); setError(""); } }).catch(e => { if (ticket === downloadGeneration.current) setError(e instanceof Error ? e.message : "Video download failed. Try again."); }).finally(() => { if (ticket === downloadGeneration.current) setDownloading(false); });
              }}>{downloading ? "Downloading from iCloud…" : "Download video from iCloud"}</Button> : undefined}
            />
          ) : !m || !uri ? (
            <Loading />
          ) : m.type === "video" ? (
            <Video uri={uri} autoplay={app.prefs.autoplay} onReady={() => setLoadedId(m.id)} />
          ) : motion && m.livePhoto ? (
            <LivePhoto id={m.id} />
          ) : (
            <ZoomPhoto media={m} onSettled={state => setLoadedId(state === "loaded" ? m.id : undefined)} />
          )}
        </View>
        {m?.livePhoto && Platform.OS === "ios" && (
          <Pressable
            accessibilityRole="button"
            onPress={() => setMotion(!motion)}
            className="self-center rounded-full bg-accent px-6 py-3"
          >
            <Text className="text-h6 text-primary">
              {motion ? "View still image" : "Play Live Photo"}
            </Text>
          </Pressable>
        )}
        {details && m && (
          <ScrollView style={detailsStyle} className="border-t border-border bg-card p-5">
            <Text className="text-h5 text-foreground">{m.name}</Text>
            <Text className="mt-3 text-body leading-7 text-muted-foreground">
              {new Date(m.created).toLocaleString()}
              {"\n"}
              {m.width} × {m.height}{m.size !== undefined ? ` • ${bytes(m.size)}` : ""}
              {m.duration ? `\n${Math.round(m.duration)} seconds` : ""}
              {"\n"}Favorites are saved in Pictopia; your original media is not modified.
            </Text>
          </ScrollView>
        )}
        {m?.decision && m.active ? (
          <View className="gap-2 border-t border-border p-4">
            <Text className="text-caption text-center text-muted-foreground">
              {m.decision === "keep"
                ? "You kept this one."
                : "Set aside. Nothing is deleted until you confirm in the queue."}
            </Text>
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Button
                  danger={m.decision !== "delete"}
                  secondary={m.decision === "delete"}
                  icon="X"
                  disabled={m.decision === "delete" || changing}
                  onPress={() => void change("delete")}
                >
                  Set aside
                </Button>
              </View>
              <View className="flex-1">
                <Button
                  secondary={m.decision === "keep"}
                  icon="Check"
                  disabled={m.decision === "keep" || changing}
                  onPress={() => void change("keep")}
                >
                  Keep
                </Button>
              </View>
            </View>
          </View>
        ) : (
          <Text className="p-4 text-caption text-center text-muted-foreground">
            {m?.type === "video"
              ? "Use the video controls to play, pause, and scrub."
              : "Pinch or double-tap to zoom. Drag to explore."}
          </Text>
        )}
      </View>
    </SafeAreaView>
  );
}

const videoStyle = { flex: 1, width: "100%" as const, minHeight: 250 };

const detailsStyle = { maxHeight: 220 };
