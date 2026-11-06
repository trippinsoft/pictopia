import React, { useEffect, useState } from "react";
import { Image } from "expo-image";
import { useVideoPlayer, VideoThumbnail } from "expo-video";
import { View } from "react-native";
import { Icon } from "./ui";
import { VideoPosterProps } from "./video-poster.types";
const fill = { width: "100%" as const, height: "100%" as const };
export function VideoPoster({ uri, fit, onReady, onFailed }: VideoPosterProps) {
  const player = useVideoPlayer(uri),
    [thumbnail, setThumbnail] = useState<VideoThumbnail>();
  useEffect(() => {
    let active = true;
    void player
      .generateThumbnailsAsync(0, { maxWidth: 900, maxHeight: 900 })
      .then((images) => {
        if (active) setThumbnail(images[0]);
      })
      .catch(() => {
        if (active) {
          // The placeholder is the settled state; never leave callers waiting for a frame.
          onFailed?.();
        }
      });
    return () => {
      active = false;
    };
  }, [uri, player]);
  return thumbnail ? (
    <Image
      source={thumbnail}
      style={fill}
      contentFit={fit}
      onLoad={onReady}
      onDisplay={onReady}
      onError={onFailed}
    />
  ) : (
    <View className="flex-1 items-center justify-center bg-secondary">
      <Icon name="Video" size={34} className="text-muted-foreground" />

    </View>
  );
}
