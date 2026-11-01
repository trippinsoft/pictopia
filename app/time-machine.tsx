import { useCallback, useMemo, useState } from "react";
import { FlatList, Platform, Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { ArtRow, ScreenHeader } from "@/components/pictopia/art-list";
import { seasonFor } from "@/components/pictopia/illustration";
import { Button, Loading, Text } from "@/components/pictopia/ui";
import { adventureStore, type ExploreChoice } from "@/services/adventures";
import { monthName } from "@/lib/pictopia/adventures";
import { plural } from "@/lib/pictopia/text";

type Choices = Awaited<ReturnType<typeof adventureStore.choices>>;
export default function TimeMachine() {
  const [choices, setChoices] = useState<Choices>();
  const [mode, setMode] = useState<"year" | "month">("year");
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [retry, setRetry] = useState(0);
  useFocusEffect(useCallback(() => {
    let alive = true;
    setError(undefined);
    void adventureStore.choices().then(value => { if (alive) setChoices(value); })
      .catch(() => { if (alive) setError("Your library couldn’t be read. Please try again."); });
    return () => { alive = false; };
  }, [retry]));
  const rows = useMemo(() => choices?.years.flatMap(year => mode === "year"
    ? [{ key: year, title: year, count: choices.yearPhotos[year], choice: { kind: "year", year } as ExploreChoice, art: "timeMachine" as const }]
    : (choices.monthsByYear[year] ?? []).slice().reverse().map(month => ({ key: month, title: `${monthName(month)} ${year}`, count: choices.photos[month], choice: { kind: "month", month } as ExploreChoice, art: seasonFor(Number(month.slice(5))) }))) ?? [], [choices, mode]);
  async function begin(key: string, choice: ExploreChoice) {
    if (busy) return;
    setBusy(key); setError(undefined);
    try {
      const adventure = await adventureStore.choose(choice);
      if (!adventure) { setError("No eligible photos left there right now. Try another date."); return; }
      await adventureStore.open(adventure.id);
      router.push({ pathname: "/vertical-explore", params: { adventure: adventure.id } });
    } catch { setError("That adventure couldn’t be prepared. Please try again."); }
    finally { setBusy(undefined); }
  }
  return <SafeAreaView className="flex-1 bg-background">
    <View className="mx-auto w-full max-w-md flex-1 px-6">
      <ScreenHeader title="Time Machine" subtitle="Pick a year or month to explore." fallback="/(tabs)/explore" />
      <View className="mb-5 mt-6 flex-row rounded-2xl bg-secondary p-1">
        {(["year", "month"] as const).map(value => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: mode === value }} onPress={() => setMode(value)} className={`min-h-11 flex-1 items-center justify-center rounded-xl ${mode === value ? "bg-primary" : ""}`}><Text className={`text-button ${mode === value ? "text-primary-foreground" : "text-foreground"}`}>{value === "year" ? "Year" : "Month"}</Text></Pressable>)}
      </View>
      {Platform.OS === "web" && <Text className="mb-3 text-caption text-muted-foreground">Browser dates are file-modified dates.</Text>}
      {!!error && <View className="mb-4 gap-3"><Text accessibilityLiveRegion="polite" className="text-body text-muted-foreground">{error}</Text>{!choices && <Button secondary onPress={() => setRetry(n => n + 1)}>Try again</Button>}</View>}
      {!choices && !error ? <Loading /> : <FlatList data={rows} keyExtractor={item => item.key} contentContainerStyle={listStyle}
        ListEmptyComponent={<Text className="py-8 text-center text-body text-muted-foreground">Your years will appear here after you add photos.</Text>}
        renderItem={({ item }) => <View className="mb-2 overflow-hidden rounded-2xl border border-border bg-card"><ArtRow first art={item.art} title={item.title} detail={busy === item.key ? "Preparing…" : plural(item.count, "photo")} disabled={!!busy} onPress={() => void begin(item.key, item.choice)} /></View>} />}
    </View>
  </SafeAreaView>;
}
const listStyle = { paddingBottom: 24 };
