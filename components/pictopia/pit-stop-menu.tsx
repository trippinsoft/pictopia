import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { RowGroup } from "./art-list";
import { Icon, Text } from "./ui";
import { usePictopia } from "./provider";
import { ACTIVE_PIT_STOPS, PIT_STOPS, unavailable } from "@/lib/pictopia/pitstops";
import { pitStopStore } from "@/services/pitstops";

import { Illustration } from "./illustration";

export function PitStopMenu({ compact = false }: { compact?: boolean }) {
  const app = usePictopia();
  const [library, setLibrary] = useState<Awaited<ReturnType<typeof pitStopStore.library>>>();
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useFocusEffect(useCallback(() => {
    let alive = true;
    setError(false);
    void pitStopStore.library().then(value => { if (alive) setLibrary(value); })
      .catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [app.stats.photos, retry]));
  if (error) return <Pressable accessibilityRole="button" onPress={() => setRetry(n => n + 1)} className="py-4"><Text className="text-body text-muted-foreground">Couldn’t read your photos. Tap to try again.</Text></Pressable>;
  const rows = ACTIVE_PIT_STOPS.map((game, i) => {
    const info = PIT_STOPS[game];
    const reason = library ? unavailable(game, library) : "Checking your library…";
    const open = () => router.push({ pathname: "/pit-stop", params: { game } });
    return compact ? (
      <Pressable key={game} accessibilityRole="button" accessibilityLabel={`${info.title}. ${reason ?? info.subtitle}`}
        accessibilityState={{ disabled: !!reason }} disabled={!!reason} onPress={open}
        className="min-w-0 w-[48%] rounded-2xl border border-border bg-card p-3 active:opacity-70">
        <View className="mb-3 aspect-square w-full overflow-hidden rounded-xl">
          <Illustration name={game} square />
        </View>
        <Text className="text-h6 text-foreground">{info.title}</Text>
        <Text className="mt-1 min-h-9 text-caption leading-[17px] text-muted-foreground">{reason ?? info.subtitle}</Text>
      </Pressable>
    ) : (
      <Pressable key={game} accessibilityRole="button" accessibilityLabel={`${info.title}. ${reason ?? info.subtitle}`}
        accessibilityState={{ disabled: !!reason }} disabled={!!reason} onPress={open}
        className={`min-h-[108px] flex-row items-center gap-4 px-4 py-3 active:bg-secondary ${i === 0 ? "" : "border-t border-border"}`}>
        <View className="h-20 w-20 overflow-hidden rounded-2xl">
          <Illustration name={game} square />
        </View>
        <View className="flex-1">
          <Text className="text-h5 text-foreground">{info.title}</Text>
          <Text className="mt-0.5 text-caption leading-[17px] text-muted-foreground">{reason ?? info.subtitle}</Text>
        </View>
        {!reason && <Icon name="ChevronRight" size={18} className="text-muted-foreground" />}
      </Pressable>
    );
  });
  return compact ? <View className="flex-row flex-wrap justify-between gap-y-3">{rows}</View> : <RowGroup>{rows}</RowGroup>;
}
