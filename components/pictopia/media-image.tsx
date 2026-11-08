import React, { useEffect, useRef, useState } from "react";
import { View, StyleProp, ViewStyle, Platform, ActivityIndicator, Pressable, AppState } from "react-native";
import { Image } from "expo-image";
import { Media } from "@/lib/pictopia/types";
import { reviewMedia } from "@/services/review-media";
import { mediaService } from "@/services/media";
import { rememberDisplay } from "@/lib/pictopia/display-cache";
import { photoDisplay } from "@/services/photo-display";
import { CLOUD_ONLY } from "@/services/media-errors";
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
  onResolved,
  failureContent,
  active = true,
  allowRetry = false,
}: {
  media?: Media;
  uri?: string;
  style?: StyleProp<ViewStyle>;
  className?: string;
  fit?: "cover" | "contain";
  showLoading?: boolean;
  onSettled?: (state: MediaSettled) => void;
  onResolved?(uri: string): void;
  /** Decorative thumbnails may provide a compact fallback without review error copy. */
  failureContent?: React.ReactNode;
  /** Only the visible review photo may offer an explicit iCloud download. */
  active?: boolean;
  /** Retry controls belong only to full review surfaces, never nested thumbnail buttons. */
  allowRetry?: boolean;
}) {
  const { theme } = useTheme();
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  useEffect(() => { const sub = AppState.addEventListener("change", state => setForeground(state === "active")); return () => sub.remove(); }, []);
  const nativeVideo = Platform.OS !== "web" && media?.type === "video";
  const [source, setSource] = useState<string>(), [failed, setFailed] = useState(false),
    [loaded, setLoaded] = useState(false), [cloud, setCloud] = useState(false),
    [download, setDownload] = useState(false), [attempt, setAttempt] = useState(0);
  const successful = useRef<{ key: string; uri: string } | undefined>(undefined);
  const generation = useRef(0), report = useRef(onSettled), resolved = useRef(onResolved), timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined), downloadFor = useRef<string | undefined>(undefined);
  report.current = onSettled; resolved.current = onResolved;
  const key = `${media?.id ?? uri}:${media?.modified ?? ""}:${attempt}`;
  const sourceTicket = useRef<{ uri?: string; generation: number }>({ generation: -1 });
  const token = sourceTicket.current.uri === source ? sourceTicket.current.generation : -1;
  function settle(state: MediaSettled) {
    if (token !== generation.current) return;
    if (state === "loaded") { if (source) { successful.current = { key, uri: source }; if (media) rememberDisplay(media, source); } clearTimeout(timeout.current); setLoaded(true); setFailed(false); }
    report.current?.(state);
  }
  function fail() { if (token === generation.current) { clearTimeout(timeout.current); setFailed(true); report.current?.("failed"); } }
  useEffect(() => {
    const ticket = ++generation.current;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    if (successful.current?.key === key) {
      sourceTicket.current = { uri: successful.current.uri, generation: ticket };
      setSource(successful.current.uri); setLoaded(true); setFailed(false);
      return () => { controller.abort(); generation.current++; };
    }
    setFailed(false); setLoaded(false); setCloud(false); setSource(undefined);
    // Resolution uses the complete asset ID and local metadata, never the ph:// host.
    // The latter is truncated by the SDK's PhotoKit image loader for /L0/... IDs.
    const resolve = async () => {
      if (nativeVideo && media) return reviewMedia.thumbnail(media);
      if (media?.type === "photo") {
        try { return await photoDisplay(media, active && foreground && allowRetry, controller.signal); }
        catch (error) { if (active && download && downloadFor.current === media.id) return (await mediaService.resolve(media, { download: true })).uri; throw error; }
      }
      if (media) return (await mediaService.resolve(media, { download: active && download && downloadFor.current === media.id })).uri;
      if (uri?.startsWith("web:")) {
        const item = await storage.get(uri.slice(4));
        if (!item) throw Error("Unavailable");
        return (await mediaService.resolve(item)).uri;
      }
      return uri;
    };
    timer = timeout.current = setTimeout(() => {
      if (ticket !== generation.current) return;
      controller.abort(); generation.current++; setFailed(true); report.current?.("failed");
    }, download ? 120000 : 30000);
    void resolve().then(value => {
      if (ticket !== generation.current) return;
      if (!value) throw Error("Unavailable");
      sourceTicket.current = { uri: value, generation: ticket };
      setSource(value); resolved.current?.(value);
    }).catch((error: unknown) => {
      if (ticket !== generation.current) return;
      clearTimeout(timer);
      setCloud(error instanceof Error && error.message === CLOUD_ONLY);
      setFailed(true); report.current?.("failed");
    });
    return () => { controller.abort(); clearTimeout(timer); generation.current++; };
  }, [key, download, active, foreground, allowRetry]);
  useEffect(() => { if (!active) setDownload(false); }, [active]);
  return (
    <View pointerEvents={allowRetry ? "auto" : "none"} style={style} className={className}>
      {failed ? (
        failureContent ?? <View className="flex-1 items-center justify-center bg-secondary p-3">
          <Icon name="CloudOff" className="text-muted-foreground" size={26} />
          <Text className="mt-2 text-caption text-center text-muted-foreground">
            {media?.type === "video" ? "Video preview unavailable" : cloud ? "This photo is in iCloud" : "Photo couldn’t load. Check photo access or try again."}
          </Text>
          {media?.type === "photo" && active && allowRetry && <Pressable accessibilityRole="button" onPress={() => { downloadFor.current = media.id; setDownload(cloud); setAttempt(value => value + 1); }} className="mt-3 min-h-11 items-center justify-center px-4"><Text className="text-button text-foreground">{cloud ? "Download photo" : "Try again"}</Text></Pressable>}
        </View>
      ) : media?.type === "video" && !nativeVideo && source ? (
        <VideoPoster uri={source} fit={fit} onReady={() => settle("loaded")} onFailed={fail} />
      ) : source ? (
        <Image
          key={key}
          source={source}
          style={fillStyle}
          contentFit={fit}
          cachePolicy="memory-disk"
          recyclingKey={key}
          transition={0}
          onError={fail}
          onLoad={() => { if (source) settle("loaded"); }}
          onDisplay={() => { if (source) settle("loaded"); }}
        />
      ) : <View className="flex-1" />}
      {showLoading && !loaded && !failed && (
        <View className="absolute inset-0 items-center justify-center">
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      )}
    </View>
  );
}

const fillStyle = { width: "100%" as const, height: "100%" as const };
