import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { MemoryMatchScreen } from "@/components/pictopia/memory-match";
import { WhichFirstGame } from "@/components/pictopia/which-first-game";
import { ScreenHeader } from "@/components/pictopia/navigation-header";
import { Button, Loading, Text } from "@/components/pictopia/ui";
import type { GameResult } from "@/components/pictopia/pit-stop-games";
import { orderRounds, type OrderRound } from "@/lib/pictopia/pitstops";
import { pitStopStore } from "@/services/pitstops";
import { preparePitStop, type PitStopPhotos } from "@/services/pit-stop-photos";

const exit = () => router.canGoBack() ? router.back() : router.replace("/pit-stops");
export default function PitStopScreen() {
  const { game } = useLocalSearchParams<{ game?: string }>();
  return game === "memoryMatch" ? <MemoryMatchScreen /> : <WhichFirstScreen enabled={game === "whichFirst"} />;
}
function WhichFirstScreen({ enabled }: { enabled: boolean }) {
  const [run, setRun] = useState<PitStopPhotos & { rounds: OrderRound[] }>();
  const [result, setResult] = useState<GameResult>();
  const [unsupported, setUnsupported] = useState(false);
  const [error, setError] = useState<string>(), [retry, setRetry] = useState(0);
  const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  useEffect(() => {
    if (!enabled) { router.replace("/pit-stops"); return; }
    const controller = new AbortController(); let prepared: PitStopPhotos | undefined;
    setRun(undefined); setResult(undefined); setError(undefined);
    void (async () => {
      const library = await pitStopStore.library();
      if (controller.signal.aborted) return;
      if (!library.captureDates) { setUnsupported(true); throw Error("This Pit Stop needs capture dates from your iOS or Android photo library. Browser files only provide modified dates."); }
      const seed = Date.now(); prepared = await preparePitStop("whichFirst", seed, controller.signal);
      const rounds = orderRounds(prepared.photos, seed);
      if (!rounds.length) throw Error("This Pit Stop needs accessible photos taken on different dates.");
      if (!controller.signal.aborted) setRun({ ...prepared, rounds });
    })().catch(error => {
      prepared?.dispose();
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Your photos couldn’t load. Please try again.");
    });
    return () => { controller.abort(); prepared?.dispose(); };
  }, [enabled, retry]);
  if (run && !result) return <SafeAreaView className="flex-1 bg-background"><View className="mx-auto w-full max-w-3xl flex-1 px-3 pb-1">
    <WhichFirstGame key={retry} rounds={run.rounds} photos={run.photos} uris={run.uris} onFinish={value => { if (live.current) setResult(value); }} onExit={exit} />
  </View></SafeAreaView>;
  return <SafeAreaView className="flex-1 bg-background">
    <View className="mx-auto w-full max-w-md flex-1 px-5">
      <ScreenHeader title="Which Came First?" onBack={exit} />
      <View className="flex-1 justify-center gap-5 pb-8">
        {result ? <>
          <Text accessibilityRole="header" className="text-center text-display text-foreground">{result.total ? "Nice exploring!" : "Another time, perhaps."}</Text>
          <Text className="text-center text-body text-muted-foreground">{result.total ? `You got ${result.correct} out of ${result.total} correct.` : "These photos weren’t available. Try a fresh set."}</Text>
          <Button onPress={() => setRetry(n => n + 1)}>Play Again</Button>
          <Button secondary onPress={exit}>Done</Button>
        </> : error ? <>
          <Text accessibilityRole="header" className="text-center text-h2 text-foreground">Not enough dated photos yet</Text>
          <Text className="text-center text-body text-muted-foreground">{error}</Text>
          {!unsupported && <Button onPress={() => setRetry(n => n + 1)}>Try again</Button>}
          <Button secondary onPress={exit}>Back to Pit Stops</Button>
        </> : <Loading />}
      </View>
    </View>
  </SafeAreaView>;
}
