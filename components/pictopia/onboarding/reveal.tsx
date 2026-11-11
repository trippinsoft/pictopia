import { useEffect, useMemo, useState } from "react";
import { AccessibilityInfo, View } from "react-native";
import Animated, { FadeIn, FadeOut, useReducedMotion } from "react-native-reanimated";
import { Text } from "@/components/pictopia/ui";
import { MediaImage } from "@/components/pictopia/media-image";
import { revealInterval, type YearTotal } from "@/lib/pictopia/onboarding";
import type { Media } from "@/lib/pictopia/types";
import { storage } from "@/services/repository";

const COLORS = ["text-tomato", "text-grass", "text-tertiary", "text-primary"];
const GRID = 4;

/** The library reveal: each year of the user's own photos in turn, a few of that year's
 * photos, a per-year bar chart, then the whole library's total. */
export function LibraryReveal({ years, total, photosCount, videos }: { years: YearTotal[]; total: number; photosCount: number; videos: number }) {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(reduced ? years.length : 0);
  const [photos, setPhotos] = useState<Record<number, Media[]>>({});
  const done = index >= years.length;
  useEffect(() => {
    let alive = true;
    void (async () => {
      for (const { year } of [...years].reverse()) {
        const rows = await storage.query({ type: "photo", year: String(year), screenshot: false, order: "newest", limit: GRID }).catch(() => []);
        if (!alive) return;
        setPhotos(previous => ({ ...previous, [year]: rows.filter(m => !m.deletedAt) }));
      }
    })();
    return () => { alive = false; };
  }, [years]);
  useEffect(() => {
    if (done) return;
    const timer = setTimeout(() => setIndex(i => i + 1), revealInterval(years.length));
    return () => clearTimeout(timer);
  }, [index, done, years.length]);
  useEffect(() => {
    if (done) AccessibilityInfo.announceForAccessibility(`${total.toLocaleString()} photos and videos discovered. ${photosCount.toLocaleString()} photos, ${videos.toLocaleString()} videos.`);
  }, [done, total, photosCount, videos]);
  const max = useMemo(() => Math.max(1, ...years.map(y => y.photos)), [years]);
  const current = years[Math.min(index, years.length - 1)];
  const shown = done ? Object.values(photos).flat().slice(0, GRID) : current ? photos[current.year] ?? [] : [];
  return (
    <View className="gap-5">
      <View accessibilityLiveRegion="polite" className="h-32 items-center justify-center">
        {done || !current ? (
          <Animated.View key="total" entering={reduced ? undefined : FadeIn.duration(300)} style={{ alignItems: "center" }}>
            <Text className="text-center text-display text-foreground" style={{ fontSize: 54, lineHeight: 62 }}>{total.toLocaleString()}</Text>
            <Text className="text-center text-h4 text-muted-foreground">photos &amp; videos discovered</Text>
          <Text className="mt-1 text-center text-caption text-muted-foreground">{`${photosCount.toLocaleString()} photos · ${videos.toLocaleString()} videos`}</Text>
          </Animated.View>
        ) : (
          <Animated.View key={current.year} entering={reduced ? undefined : FadeIn.duration(180)} exiting={reduced ? undefined : FadeOut.duration(120)} style={{ alignItems: "center" }}>
            <Text className={`text-center text-display ${COLORS[index % COLORS.length]}`} style={{ fontSize: 72, lineHeight: 80 }}>{current.year}</Text>
            <Text className="text-center text-h4 text-muted-foreground">{current.photos.toLocaleString()} photos</Text>
          </Animated.View>
        )}
      </View>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" className="h-36 flex-row gap-2">
        {Array.from({ length: GRID }, (_, i) => (
          <View key={i} className="flex-1 overflow-hidden rounded-2xl bg-card" style={{ transform: [{ rotate: `${[-4, 3, -2, 4][i]}deg` }] }}>
            {shown[i] ? <MediaImage key={shown[i].id} media={shown[i]} style={{ width: "100%", height: "100%" }} active={false} /> : null}
          </View>
        ))}
      </View>
      {years.length > 1 ? (
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" className="gap-1.5">
          <View className="h-24 flex-row items-end gap-[3px]">
            {years.map((y, i) => (
              <View key={y.year} className={`flex-1 rounded-t-md ${done || i === index ? "bg-tomato" : i < index ? "bg-foreground/25" : "bg-foreground/10"}`} style={{ height: `${Math.max(6, (y.photos / max) * 100)}%` }} />
            ))}
          </View>
          <View className="flex-row justify-between">
            <Text className="text-caption text-muted-foreground">{years[0].year}</Text>
            <Text className="text-caption text-muted-foreground">{years[years.length - 1].year}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}
