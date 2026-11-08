import { useCallback, useRef, useState } from "react";
import { FlatList, Platform, Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { ScreenHeader } from "@/components/pictopia/navigation-header";
import { Icon, Loading, Text } from "@/components/pictopia/ui";
import { usePictopia } from "@/components/pictopia/provider";
import { adventureStore } from "@/services/adventures";
import { plural } from "@/lib/pictopia/text";

export default function OnThisDay() {
  const app = usePictopia();
  const [dates, setDates] = useState<Awaited<ReturnType<typeof adventureStore.history>>>();
  const [error, setError] = useState<string>(), [busy, setBusy] = useState<string>();
  const opening = useRef(false);
  useFocusEffect(useCallback(() => {
    let live = true; setDates(undefined);
    void adventureStore.history().then(rows => { if (live) { setDates(rows); setError(undefined); } }).catch(() => { if (live) setError("Dates couldn’t load. Return to Explore and try again."); });
    return () => { live = false; };
  }, []));
  const open = async (date: string, historical: boolean) => {
    if (historical && !app.pro) return router.push("/paywall");
    if (opening.current) return;
    opening.current = true; setBusy(date); setError(undefined);
    try {
      const adventure = await adventureStore.choose({ kind: "day", date }, Date.now(), app.pro);
      if (!adventure) { setError("No photos on this exact date. Choose another day."); return; }
      await adventureStore.open(adventure.id, app.pro);
      router.push({ pathname: "/vertical-explore", params: { adventure: adventure.id } });
    } catch { setError("These photos couldn’t open. Please try again."); }
    finally { opening.current = false; setBusy(undefined); }
  };
  return <SafeAreaView className="flex-1 bg-background">
    <View className="mx-auto w-full max-w-md flex-1 px-5">
      <ScreenHeader title="On This Day" fallback="/(tabs)/explore" />
      <Text className="mb-4 mt-3 text-body text-muted-foreground">Today’s memories, across the years.</Text>
      {Platform.OS === "web" && <Text className="mb-3 text-caption text-muted-foreground">Browser dates use file-modified dates.</Text>}
      {!!error && <Text accessibilityLiveRegion="polite" className="mb-4 text-body text-destructive">{error}</Text>}
      {!dates && !error ? <Loading /> : <FlatList data={dates} keyExtractor={row => row.date} renderItem={({ item, index }) => <Pressable accessibilityRole="button" disabled={!!busy || item.count === 0} onPress={() => void open(item.date, index > 0)} className="mb-2 min-h-16 flex-row items-center gap-3 rounded-2xl bg-card px-4 py-3 active:opacity-70">
        <View className="flex-1">
          <Text className="text-h4 text-foreground">{index === 0 ? "Today" : new Date(`${item.date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</Text>
          <Text className="mt-1 text-caption text-muted-foreground">{busy === item.date ? "Opening…" : item.count ? plural(item.count, "photo") : "No photos on this date"}</Text>
        </View>
        {index > 0 && !app.pro && <View className="rounded-full bg-secondary px-2 py-1"><Text className="text-caption text-muted-foreground">Pictopia+</Text></View>}
        {item.count > 0 && <Icon name="ChevronRight" size={18} className="text-muted-foreground" />}
      </Pressable>} />}
    </View>
  </SafeAreaView>;
}
