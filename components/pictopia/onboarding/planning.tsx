import { useEffect, useState } from "react";
import { AccessibilityInfo, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSpring, withTiming } from "react-native-reanimated";
import { Text } from "@/components/pictopia/ui";
import { useTheme } from "@/theming/ThemeProvider";
import { MediaImage } from "@/components/pictopia/media-image";
import type { Media } from "@/lib/pictopia/types";
import { storage } from "@/services/repository";

const FAN = [-16, -8, 0, 8, 16];
const PLAN_MS = 2800;

function FannedPhoto({ media, angle, index }: { media?: Media; angle: number; index: number }) {
  const reduced = useReducedMotion();
  const v = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (!reduced) v.value = withDelay(200 + index * 220, withSpring(1, { damping: 12, stiffness: 110 }));
  }, [reduced, index, v]);
  const style = useAnimatedStyle(() => ({
    opacity: v.value,
    transform: [{ translateX: angle * 4.2 * v.value }, { translateY: Math.abs(angle) * 0.9 + (1 - v.value) * 40 }, { rotate: `${angle * v.value}deg` }],
  }));
  return (
    <Animated.View style={[{ position: "absolute", width: 108, height: 144, zIndex: 10 - Math.abs(angle) }, style]}>
      <View className="flex-1 overflow-hidden rounded-2xl border-4 border-white bg-card">
        {media ? <MediaImage media={media} style={{ width: "100%", height: "100%" }} active={false} /> : null}
      </View>
    </Animated.View>
  );
}

/** "Planning your first adventure…": the user's own photos fan out while a short progress bar
 * runs. `ready` is when Pictopia has actually picked; the bar never finishes before that. */
export function Planning({ ready, total, onDone }: { ready: boolean; total: number; onDone: () => void }) {
  const reduced = useReducedMotion();
  const { theme } = useTheme();
  const [photos, setPhotos] = useState<Media[]>([]);
  const [elapsed, setElapsed] = useState(false);
  const progress = useSharedValue(0);
  useEffect(() => {
    let alive = true;
    // A spread of the library: newest few plus some much older ones.
    void Promise.all([
      storage.query({ type: "photo", screenshot: false, order: "newest", limit: 3 }),
      storage.query({ type: "photo", screenshot: false, order: "oldest", limit: 2 }),
    ]).then(([recent, old]) => { if (alive) setPhotos([...old, ...recent].filter(m => !m.deletedAt)); }).catch(() => {});
    progress.value = withTiming(0.9, { duration: reduced ? 0 : PLAN_MS, easing: Easing.out(Easing.cubic) });
    const timer = setTimeout(() => setElapsed(true), reduced ? 600 : PLAN_MS);
    return () => { alive = false; clearTimeout(timer); };
  }, [progress, reduced]);
  const finished = elapsed && ready;
  useEffect(() => {
    if (!finished) return;
    progress.value = withTiming(1, { duration: 250 });
    AccessibilityInfo.announceForAccessibility(`${total.toLocaleString()} photos ready to explore.`);
  }, [finished, progress, total]);
  const bar = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));
  useEffect(() => {
    if (!finished) return;
    const timer = setTimeout(onDone, 900);
    return () => clearTimeout(timer);
  }, [finished, onDone]);
  return (
    <View className="items-center gap-8">
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" className="h-52 w-full items-center justify-center">
        {FAN.map((angle, i) => <FannedPhoto key={i} media={photos[i]} angle={angle} index={i} />)}
      </View>
      <View accessibilityLiveRegion="polite" className="w-full items-center gap-3">
        <Text accessibilityRole="header" className="text-center text-h1 text-foreground">
          {finished ? `${total.toLocaleString()} photos ready to explore` : "Planning your first adventure…"}
        </Text>
        <Text className="text-center text-body leading-6 text-muted-foreground">
          {finished ? "Pictopia has picked where to start." : "Looking through your years and months for a great place to start."}
        </Text>
        <View className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-foreground/10">
          <Animated.View style={[{ height: "100%", borderRadius: 999, backgroundColor: theme.colors.grass }, bar]} />
        </View>
      </View>
    </View>
  );
}
