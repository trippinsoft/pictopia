import React, { useState, useEffect } from "react";
import { View, Pressable, ScrollView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { LivePhoto } from "@/components/flickwell/live-photo";
import { ZoomPhoto } from "@/components/flickwell/zoom-photo";

import { useVideoPlayer, VideoView } from "expo-video";
import { Text, Icon, Empty, Loading } from "@/components/flickwell/ui";
import { useFlickWell } from "@/components/flickwell/provider";
import { repository, storage } from "@/services/repository";
import { mediaService } from "@/services/media";
import { Media } from "@/lib/flickwell/types";
import { bytes } from "@/lib/flickwell/logic";
function Video({ uri, autoplay }: { uri: string; autoplay: boolean }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    if (autoplay) p.play();
  });
  return (
    <VideoView
      player={player}
      style={videoStyle}
      nativeControls
      contentFit="contain"
      fullscreenOptions={{ enable: true }}
    />
  );
}
export default function Preview() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const app = useFlickWell();
  const [m, setM] = useState<Media>(),
    [uri, setUri] = useState<string>(),
    [error, setError] = useState(""),
    [details, setDetails] = useState(false),
    [motion, setMotion] = useState(false);
  useEffect(() => {
    let active = true;
    void storage
      .get(id)
      .then(async (item) => {
        if (!item) throw Error("This item is no longer available.");
        const resolved = await mediaService.resolve(item);
        const updated = {
          ...item,
          size: resolved.size ?? item.size,
          systemFavorite: resolved.systemFavorite ?? item.systemFavorite,
        };
        if (active) {
          setM(updated);
          setUri(resolved.uri);
        }
        await repository.update(item.id, (latest) => ({
          ...latest,
          size: resolved.size ?? latest.size,
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
        <View className="flex-row items-center justify-between px-4 py-3">
          <Pressable
            accessibilityLabel="Close preview"
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/swipe"))}
            className="p-3"
          >
            <Icon name="X" size={25} className="text-foreground" />
          </Pressable>
          <Text className="text-h5 text-foreground">
            {m?.type === "video" ? "Video preview" : "Photo preview"}
          </Text>
          <View className="flex-row">
            <Pressable
              accessibilityLabel={m?.favorite ? "Remove app favorite" : "Add app favorite"}
              onPress={() => {
                if (m) void repository.favorite(m.id).then(app.refresh).catch(e=>app.setError(e.message));
              }}
              className="p-3"
            >
              <Icon
                name="Heart"
                size={23}
                className={m?.favorite ? "text-destructive" : "text-muted-foreground"}
              />
            </Pressable>
            <Pressable
              accessibilityLabel="Media details"
              onPress={() => setDetails(!details)}
              className="p-3"
            >
              <Icon name="Info" size={23} className="text-muted-foreground" />
            </Pressable>
          </View>
        </View>
        <View className="flex-1 overflow-hidden">
          {error ? (
            <Empty
              icon="CloudOff"
              title="This memory isn’t available locally"
              description={error}
            />
          ) : !m || !uri ? (
            <Loading />
          ) : m.type === "video" ? (
            <Video uri={uri} autoplay={app.prefs.autoplay} />
          ) : motion && m.livePhoto ? (
            <LivePhoto id={m.id} />
          ) : (
            <ZoomPhoto media={m} />
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
              {m.width} × {m.height} • {bytes(m.size)}
              {m.duration ? `\n${Math.round(m.duration)} seconds` : ""}
              {"\n"}Favorites are saved in FlickWell; your original media is not modified.
            </Text>
          </ScrollView>
        )}
        <Text className="p-4 text-caption text-center text-muted-foreground">
          {m?.type === "video"
            ? "Use the video controls to play, pause, and scrub."
            : "Pinch or double-tap to zoom. Drag to explore."}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const videoStyle = { flex: 1, width: "100%" as const, minHeight: 250 };

const detailsStyle = { maxHeight: 220 };
