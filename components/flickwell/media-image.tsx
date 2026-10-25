import React, { useEffect, useState } from "react";
import { View, StyleProp, ViewStyle } from "react-native";
import { Image } from "expo-image";
import { Media } from "@/lib/flickwell/types";
import { mediaService } from "@/services/media";
import { Text, Icon } from "./ui";
import { VideoPoster } from "./video-poster";
import { storage } from "@/services/storage";
export function MediaImage({
  media,
  uri,
  style,
  className,
  fit = "cover",
  onReady,
}: {
  media?: Media;
  uri?: string;
  style?: StyleProp<ViewStyle>;
  className?: string;
  fit?: "cover" | "contain";
  onReady?: () => void;
}) {
  const [source, setSource] = useState<string>(),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    setFailed(false);
    setSource(undefined);
    if (media) {
      mediaService
        .resolve(media)
        .then((r) => {
          if (active) setSource(r.uri);
        })
        .catch(() => {
          if (active) setFailed(true);
        });
    } else if (uri?.startsWith("web:")) {
      storage
        .get(uri.slice(4))
        .then((m) => (m ? mediaService.resolve(m) : undefined))
        .then((r) => {
          if (active) setSource(r?.uri);
        })
        .catch(() => {
          if (active) setFailed(true);
        });
    } else setSource(uri);
    return () => {
      active = false;
    };
  }, [media?.id, uri]);
  return (
    <View pointerEvents="none" style={style} className={className}>
      {failed ? (
        <View className="flex-1 items-center justify-center bg-secondary p-3">
          <Icon name="CloudOff" className="text-muted-foreground" size={26} />
          <Text className="mt-2 text-caption text-muted-foreground">Unavailable locally</Text>
        </View>
      ) : media?.type === "video" && source ? (
        <VideoPoster uri={source} fit={fit} onReady={onReady} />
      ) : (
        <Image
          source={source}
          style={fillStyle}
          contentFit={fit}
          cachePolicy="memory-disk"
          recyclingKey={media?.id ?? uri}
          onError={() => setFailed(true)}
          onLoad={onReady}
        />
      )}
    </View>
  );
}

const fillStyle = { width: "100%" as const, height: "100%" as const };
