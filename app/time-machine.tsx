import { useCallback, useMemo, useState } from "react";
import { FlatList, Platform, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { ArtRow, ScreenHeader } from "@/components/pictopia/art-list";
import { Button, Loading, Text } from "@/components/pictopia/ui";
import { adventureStore, type AdventureSlot, type ExploreChoice } from "@/services/adventures";
import { meaningfulReview } from "@/lib/pictopia/adventures";
import { adventureLabel, catalogEntry } from "@/lib/pictopia/catalog";
import { plural } from "@/lib/pictopia/text";

type Choices = Awaited<ReturnType<typeof adventureStore.choices>>;
export default function Yearbook() {
  const [choices, setChoices] = useState<Choices>();
  const [saved, setSaved] = useState<AdventureSlot[]>([]);
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [retry, setRetry] = useState(0);
  useFocusEffect(useCallback(() => {
    let alive = true;
    setError(undefined);
    void Promise.all([adventureStore.choices(), adventureStore.yearbooks()]).then(([value, sessions]) => {
      if (alive) {
        setChoices(value);
        setSaved(sessions);
      }
    })
      .catch(() => { if (alive) setError("Your library couldn’t be read. Please try again."); });
    return () => { alive = false; };
  }, [retry]));
  const rows = useMemo(() => [
    ...saved.map(({ adventure, session }) => ({
      key: adventure.id, title: adventureLabel(adventure),
      detail: `${meaningfulReview(session) ? "Continue" : "Open saved Yearbook"} · ${Math.max(1, session.ids.indexOf(session.activeId ?? "") + 1)} of ${session.ids.length}`,
      savedId: adventure.id, choice: undefined,
    })),
    ...(choices?.years.map(year => ({
      key: `new:${year}`, title: year, detail: `${plural(choices.yearPhotos[year], "photo")} · Start a new Yearbook`,
      savedId: undefined, choice: { kind: "year", year } as ExploreChoice,
    })) ?? []),
  ], [choices, saved]);
  async function begin(key: string, choice?: ExploreChoice, savedId?: string) {
    if (busy) return;
    setBusy(key); setError(undefined);
    try {
      const adventure = savedId ? await adventureStore.get(savedId) : choice ? await adventureStore.choose(choice) : undefined;
      if (!adventure) { setError("No eligible photos left there right now. Try another year."); return; }
      await adventureStore.open(adventure.id);
      router.push({ pathname: "/vertical-explore", params: { adventure: adventure.id } });
    } catch { setError("That adventure couldn’t be prepared. Please try again."); }
    finally { setBusy(undefined); }
  }
  return <SafeAreaView className="flex-1 bg-background">
    <View className="mx-auto w-full max-w-md flex-1 px-5">
      <ScreenHeader title="The Yearbook" subtitle={catalogEntry("time-machine").blurb} fallback="/(tabs)/explore" />
      <Text className="mb-4 mt-5 text-caption text-muted-foreground">Up to 18 photos, curated across your chosen year. Your saved Yearbooks stay here.</Text>
      {Platform.OS === "web" && <Text className="mb-3 text-caption text-muted-foreground">Browser dates are file-modified dates.</Text>}
      {!!error && <View className="mb-4 gap-3"><Text accessibilityLiveRegion="polite" className="text-body text-muted-foreground">{error}</Text>{!choices && <Button secondary onPress={() => setRetry(n => n + 1)}>Try again</Button>}</View>}
      {!choices && !error ? <Loading /> : <FlatList data={rows} keyExtractor={item => item.key} contentContainerStyle={listStyle}
        ListEmptyComponent={<Text className="py-8 text-center text-body text-muted-foreground">Your years will appear here after you add photos.</Text>}
        renderItem={({ item }) => <View className="mb-2 overflow-hidden rounded-2xl border border-border bg-card"><ArtRow first art="timeMachine" title={item.title} detail={busy === item.key ? "Opening…" : item.detail} disabled={!!busy} onPress={() => void begin(item.key, item.choice, item.savedId)} /></View>} />}
    </View>
  </SafeAreaView>;
}
const listStyle = { paddingBottom: 24 };
