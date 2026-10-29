import React, { useEffect, useRef, useState } from "react";
import { View, StyleProp, ViewStyle, Platform, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { Media } from "@/lib/pictopia/types";
import { mediaService } from "@/services/media";
import { Text, Icon } from "./ui";
import { VideoPoster } from "./video-poster";
import { storage } from "@/services/storage";
import { useTheme } from "@/theming/ThemeProvider";
/** "loaded" once pixels are on screen; "failed" once a visible placeholder replaces them. */
export type MediaSettled = "loaded" | "failed";
export function MediaImage({
  media,
  uri,
  style,
  className,
  fit = "cover",
  showLoading = false,
  onSettled,
}: {
  media?: Media;
  uri?: string;
  style?: StyleProp<ViewStyle>;
  className?: string;
  fit?: "cover" | "contain";
  showLoading?: boolean;
  onSettled?: (state: MediaSettled) => void;
}) {
  const { theme } = useTheme();
  // Native photos render straight from the library reference (ph:// on iOS loads iCloud
  // originals too); a looked-up local file is only a fallback. Browser files need a lookup.
  const direct = Platform.OS !== "web" && media?.type === "photo" ? media.uri : undefined;
  const [source, setSource] = useState<string | undefined>(direct ?? (media ? undefined : uri)),
    [failed, setFailed] = useState(false),
    [loaded, setLoaded] = useState(false);
  const fellBack = useRef(false);
  const report = useRef(onSettled);
  report.current = onSettled;
  const settledFor = useRef<string | undefined>(undefined);
  const key = media?.id ?? uri;
  function settle(state: MediaSettled) {
    if (state === "loaded") setLoaded(true);
    if (settledFor.current === key && state !== "failed") return;
    settledFor.current = key;
    report.current?.(state);
  }
  function fail() {
    setFailed(true);
    settle("failed");
  }
  useEffect(() => {
    let active = true;
    fellBack.current = false;
    settledFor.current = undefined;
    setFailed(false);
    setLoaded(false);
    if (direct) setSource(direct);
    else if (media) {
      setSource(undefined);
      mediaService
        .resolve(media)
        .then((r) => {
          if (active) setSource(r.uri);
        })
        .catch(() => {
          if (active) fail();
        });
    } else if (uri?.startsWith("web:")) {
      setSource(undefined);
      storage
        .get(uri.slice(4))
        .then((m) => (m ? mediaService.resolve(m) : undefined))
        .then((r) => {
          if (active) {
            if (r?.uri) setSource(r.uri);
            else fail();
          }
        })
        .catch(() => {
          if (active) fail();
        });
    } else setSource(uri);
    return () => {
      active = false;
    };
  }, [key, direct]);
  function onImageError() {
    // A direct library reference can fail where a resolved local file works; try that once.
    if (media && direct && !fellBack.current) {
      fellBack.current = true;
      mediaService
        .resolve(media)
        .then((r) => setSource(r.uri))
        .catch(fail);
      return;
    }
    fail();
  }
  return (
    <View pointerEvents="none" style={style} className={className}>
      {failed ? (
        <View className="flex-1 items-center justify-center bg-secondary p-3">
          <Icon name="CloudOff" className="text-muted-foreground" size={26} />
          <Text className="mt-2 text-caption text-center text-muted-foreground">
            Can’t show this one right now
          </Text>
        </View>
      ) : media?.type === "video" && source ? (
        <VideoPoster uri={source} fit={fit} onReady={() => settle("loaded")} onFailed={fail} />
      ) : (
        <Image
          source={source}
          style={fillStyle}
          contentFit={fit}
          cachePolicy="memory-disk"
          recyclingKey={key}
          transition={0}
          onError={onImageError}
          onLoad={() => settle("loaded")}
          onDisplay={() => settle("loaded")}
        />
      )}
      {showLoading && !loaded && !failed && (
        <View className="absolute inset-0 items-center justify-center">
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      )}
    </View>
  );
}

const fillStyle = { width: "100%" as const, height: "100%" as const };
