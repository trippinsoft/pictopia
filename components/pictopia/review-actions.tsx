import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform, Pressable, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { Icon, Text } from "./ui";
import { useTheme } from "@/theming/ThemeProvider";
import { reviewMedia } from "@/services/review-media";
import type { FavoriteState } from "@/services/review-media.types";
import type { Media } from "@/lib/pictopia/types";
export function ReviewActions({ media, disabled, queued, legacy, highlighted, onRestore, onUsed }: {
  media?: Media; disabled: boolean; queued: boolean; legacy: boolean; highlighted: boolean;
  onRestore(): void; onUsed(): void;
}) {
  const { theme } = useTheme();
  const [favorite, setFavorite] = useState<FavoriteState>(), [working, setWorking] = useState(false), [message, setMessage] = useState<string>();
  const lock = useRef(false), generation = useRef(0);
  useFocusEffect(useCallback(() => {
    let alive = true;
    const current = ++generation.current;
    setFavorite(undefined); setMessage(undefined); setWorking(false); lock.current = false;
    const read = () => { if (media) void reviewMedia.favorite(media).then(value => { if (alive && current === generation.current && !lock.current) setFavorite(value); }).catch(() => { if (alive && current === generation.current) setFavorite({ supported: false, reason: "The native favorite status couldn’t be read. Check library access and try again." }); }); };
    read();
    const subscription = AppState.addEventListener("change", state => { if (state === "active") read(); });
    return () => { alive = false; generation.current++; subscription.remove(); reviewMedia.cancelShare(); };
  }, [media?.id, media?.modified]));
  useEffect(() => { if (!message) return; const timer = setTimeout(() => setMessage(undefined), 6500); return () => clearTimeout(timer); }, [message]);
  async function act(kind: "favorite" | "share") {
    if (!media || lock.current || disabled) return;
    if (kind === "favorite" && !favorite?.supported) { setMessage(favorite?.reason ?? "Checking your library’s favorite status…"); return; }
    const token = generation.current;
    lock.current = true; setWorking(true); setMessage(undefined);
    try {
      if (kind === "favorite") {
        const saved = await reviewMedia.setFavorite(media, !favorite?.value);
        if (generation.current === token) { setFavorite({ supported: true, value: saved }); onUsed(); }
      } else { await reviewMedia.share(media); if (generation.current === token) onUsed(); }
    } catch (error) { if (generation.current === token) setMessage(error instanceof Error ? error.message : "That action couldn’t finish. Please try again."); }
    finally { if (generation.current === token) { lock.current = false; setWorking(false); } }
  }
  // The browser can't favorite or share library originals, so the controls aren't offered.
  const native = Platform.OS !== "web";
  return <View className="flex-row items-center gap-2.5">
    {(queued || legacy) && <Pressable accessibilityRole="button" accessibilityLabel="Restore this photograph" disabled={disabled} onPress={onRestore} className="h-12 flex-row items-center gap-1.5 rounded-full bg-card/90 px-4 active:opacity-70"><Icon name="RotateCcw" size={18} className="text-foreground" /><Text className="text-button text-foreground">Restore</Text></Pressable>}
    {native && <Pressable accessibilityRole="button" accessibilityLabel={favorite?.value ? "Remove from Favorites" : "Add to Favorites"} accessibilityState={{ selected: favorite?.value, disabled: disabled || working || !media }} disabled={disabled || working || !media} onPress={() => void act("favorite")} className={`h-12 w-12 items-center justify-center rounded-full bg-card/90 active:opacity-70 ${highlighted ? "border-2 border-sun" : ""}`}>
      <Icon name="Heart" size={22} fill={favorite?.value ? theme.colors.destructive : "none"} className={favorite?.value ? "text-destructive" : "text-foreground"} />
    </Pressable>}
    {native && <Pressable accessibilityRole="button" accessibilityLabel="Share original photograph" disabled={disabled || working || !media} onPress={() => void act("share")} className="h-12 w-12 items-center justify-center rounded-full bg-card/90 active:opacity-70"><Icon name="Share" size={21} className="text-foreground" /></Pressable>}
    {!!message && <Text pointerEvents="none" accessibilityLiveRegion="polite" className="absolute bottom-full right-0 mb-2 w-64 rounded-xl bg-card px-3 py-2 text-center text-caption text-foreground">{message}</Text>}
  </View>;
}
