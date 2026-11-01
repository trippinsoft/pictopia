import { useCallback, useState } from "react";
import { Platform, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { Button, Loading, Text } from "@/components/pictopia/ui";
import { ArtRow, Eyebrow, RowGroup } from "@/components/pictopia/art-list";
import { artForKind } from "@/components/pictopia/illustration";
import { PitStopMenu } from "@/components/pictopia/pit-stop-menu";
import { usePictopia } from "@/components/pictopia/provider";
import { adventurePlace } from "@/lib/pictopia/adventures";
import { adventureStore, type AdventureSlot, type ExploreChoice } from "@/services/adventures";

type Choices = Awaited<ReturnType<typeof adventureStore.choices>>;
export default function Explore() {
  const app = usePictopia();
  const [choices, setChoices] = useState<Choices>();
  const [unfinished, setUnfinished] = useState<AdventureSlot[]>([]);
  const [busy, setBusy] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [retry, setRetry] = useState(0);
  const hasPhotos = app.ready && app.stats.photos > 0;
  useFocusEffect(useCallback(() => {
    let alive = true;
    setMessage(undefined);
    void Promise.all([adventureStore.choices(), adventureStore.unfinished()]).then(([c, u]) => {
      if (alive) { setChoices(c); setUnfinished(u); }
    }).catch(() => { if (alive) setMessage("Your library couldn’t be read just now."); });
    return () => { alive = false; };
  }, [app.stats.photos, retry]));
  async function begin(choice: ExploreChoice | string) {
    if (busy) return;
    setBusy(typeof choice === "string" ? choice : choice.kind); setMessage(undefined);
    try {
      const adventure = typeof choice === "string" ? { id: choice } : await adventureStore.choose(choice);
      if (!adventure) { setMessage("No eligible photos left there right now. Try another adventure."); return; }
      await adventureStore.open(adventure.id);
      router.push({ pathname: "/vertical-explore", params: { adventure: adventure.id } });
    } catch { setMessage("That adventure couldn’t be opened. Please try again."); }
    finally { setBusy(undefined); }
  }
  return <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
    <ScrollView><View className="mx-auto w-full max-w-md px-6 pb-8 pt-6">
      <Text accessibilityRole="header" className="text-h1 text-foreground">Explore</Text>
      <Text className="mt-2 text-body text-muted-foreground">Choose your adventure.</Text>
      {!hasPhotos && app.ready && <View className="mt-6 gap-4"><Text className="text-body leading-6 text-muted-foreground">A little time travel starts with your photos. Everything stays on this device.</Text><Button disabled={app.busy} onPress={() => void app.connect()}>{app.busy ? "Opening your library…" : Platform.OS === "web" ? "Choose photos" : "Allow photo access"}</Button>{!!app.error && <Text className="text-body text-muted-foreground">{app.error}</Text>}</View>}
      {hasPhotos && !choices && !message && <View className="mt-8"><Loading /></View>}
      {hasPhotos && choices && <>
        <Eyebrow>Adventures</Eyebrow>
        <RowGroup>
          {!!choices.years.length && <ArtRow first art="timeMachine" title="Time Machine" detail="Revisit a year or month" onPress={() => router.push("/time-machine")} />}
          {choices.day && <ArtRow art="onThisDay" title="On This Day" detail={busy === "day" ? "Preparing…" : "Around this date in past years"} disabled={!!busy} onPress={() => void begin({ kind: "day" })} />}
          {choices.detour && <ArtRow art="detour" title="Surprise Me" detail={busy === "detour" ? "Preparing…" : "An unexpected collection across your years"} disabled={!!busy} onPress={() => void begin({ kind: "detour" })} />}
          {choices.screenshots && <ArtRow art="screenshots" title="Screenshot Sweep" detail={busy === "screenshots" ? "Preparing…" : "A little digital decluttering"} disabled={!!busy} onPress={() => void begin({ kind: "screenshots" })} />}
        </RowGroup>
      </>}
      {!!message && <Pressable accessibilityRole="button" onPress={() => setRetry(n => n + 1)} className="mt-5 py-2"><Text accessibilityLiveRegion="polite" className="text-body text-muted-foreground">{message} Tap to try again.</Text></Pressable>}
      <Eyebrow>Pit Stops</Eyebrow>
      <PitStopMenu compact />
      {!!unfinished.length && <><Eyebrow>Continue</Eyebrow><RowGroup>{unfinished.slice(0, 3).map((slot, i) => {
        const place = adventurePlace(slot.session);
        return <ArtRow key={slot.adventure.id} first={!i} art={artForKind(slot.adventure.kind)} title={slot.adventure.hint.title} detail={busy === slot.adventure.id ? "Opening…" : `${place.explored} of ${place.total} explored`} disabled={!!busy} onPress={() => void begin(slot.adventure.id)} />;
      })}</RowGroup></>}
    </View></ScrollView>
  </SafeAreaView>;
}
