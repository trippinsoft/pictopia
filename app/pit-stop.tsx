import { MemoryMatchScreen } from "@/components/pictopia/memory-match";
import { WhichFirstGame } from "@/components/pictopia/which-first-game";
import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import Animated, { FadeInDown, ReduceMotion } from "react-native-reanimated";
import { ScreenHeader } from "@/components/pictopia/art-list";
import { Illustration } from "@/components/pictopia/illustration";
import { Button, Loading, Text } from "@/components/pictopia/ui";
import { PhotoQuiz, type GameResult, type Question } from "@/components/pictopia/pit-stop-games";
import { PIT_STOPS, guessRounds, orderRounds, unavailable, verdict, type PitStop } from "@/lib/pictopia/pitstops";
import { pitStopStore } from "@/services/pitstops";
import { adventureStore } from "@/services/adventures";
import type { Media } from "@/lib/pictopia/types";

type Run = { photos: Media[]; questions: Question[]; deck: string[] };
export default function PitStopScreen() {
  const { game } = useLocalSearchParams<{ game?: string }>();
  return game === "memoryMatch" ? <MemoryMatchScreen /> : <OtherPitStopScreen />;
}
function OtherPitStopScreen() {
  const { game: param } = useLocalSearchParams<{ game?: string }>();
  const game = param && Object.prototype.hasOwnProperty.call(PIT_STOPS, param) ? param as PitStop : undefined;
  const title = game ? PIT_STOPS[game].title : "Pit Stop";
  const [run, setRun] = useState<Run>();
  const [result, setResult] = useState<GameResult>();
  const [error, setError] = useState<string>();
  const [retry, setRetry] = useState(0);
  const [reviewing, setReviewing] = useState(false);
  useEffect(() => {
    let alive = true;
    setRun(undefined); setResult(undefined); setError(undefined);
    void (async () => {
      if (!game) throw Error("That Pit Stop couldn’t be found.");
      const library = await pitStopStore.library();
      const reason = unavailable(game, library);
      if (reason) throw Error(reason);
      const seed = Date.now();
      const photos = await pitStopStore.sample(game, seed);
      const questions: Question[] = game === "guessYear" ? guessRounds(photos, seed).map(round => ({ kind: "year", round })) : game === "whichFirst" ? orderRounds(photos, seed).map(round => ({ kind: "order", round })) : [];
      const deck: string[] = [];
      if (questions.length < 1) throw Error("There aren’t enough eligible photos for this game right now. Try another Pit Stop.");
      if (game === "guessYear" && new Set(questions.map(q => q.round.answer)).size < 2) throw Error("This game needs accessible photos from at least two years. Try another Pit Stop.");
      if (alive) setRun({ photos, questions, deck });
    })().catch(e => { if (alive) setError(e instanceof Error ? e.message : "Your photos couldn’t be read. Please try again."); });
    return () => { alive = false; };
  }, [game, retry]);
  async function review() {
    if (!result || reviewing) return;
    setReviewing(true); setError(undefined);
    try {
      const adventure = await adventureStore.fromPhotos(result.ids, title);
      if (!adventure) { setError("These photos are no longer available to review."); return; }
      await adventureStore.open(adventure.id);
      router.replace({ pathname: "/vertical-explore", params: { adventure: adventure.id } });
    } catch { setError("These photos couldn’t be opened. Please try again."); }
    finally { setReviewing(false); }
  }
  if (game === "whichFirst" && run && !result) return <SafeAreaView className="flex-1 bg-background">
    <View className="mx-auto w-full max-w-md flex-1 px-3 pb-1">
      <WhichFirstGame key={retry} rounds={run.questions.flatMap(question => question.kind === "order" ? [question.round] : [])} photos={run.photos} onFinish={setResult} onExit={() => router.canGoBack() ? router.back() : router.replace("/pit-stops")} />
    </View>
  </SafeAreaView>;
  return <SafeAreaView className="flex-1 bg-background">
    <ScrollView><View className="mx-auto w-full max-w-md px-6 pb-8">
      <ScreenHeader title={title} fallback="/pit-stops" />
      <View className="mt-5">
        {result ? <Animated.View entering={FadeInDown.duration(260).reduceMotion(ReduceMotion.System)}>
          <View className="mx-auto mb-6 h-44 w-44 overflow-hidden rounded-[32px]"><Illustration name="gameResult" square /></View>
          <Text accessibilityRole="header" className="text-center text-h1 text-foreground">{result.total ? verdict(result.correct, result.total) : "Another time, perhaps."}</Text>
          <Text className="mt-3 text-center text-body text-muted-foreground">{`${result.correct} out of ${result.total} correct`}</Text>
          {!!result.skipped && <Text className="mt-2 text-center text-caption text-muted-foreground">{result.skipped} unavailable {result.skipped === 1 ? "round" : "rounds"} skipped.</Text>}
          <View className="mt-8 gap-3"><Button disabled={reviewing} onPress={() => setRetry(n => n + 1)}>Play again</Button>{!!result.ids.length && <Button secondary disabled={reviewing} onPress={() => void review()}>{reviewing ? "Opening photos…" : "Review these photos"}</Button>}</View>
        </Animated.View> : run ? <PhotoQuiz key={retry} questions={run.questions} photos={run.photos} onFinish={setResult} /> : !error ? <Loading /> : null}
        {!!error && <View className="mt-6 gap-4"><Text accessibilityLiveRegion="polite" className="text-center text-body leading-6 text-muted-foreground">{error}</Text>{!result && <Button secondary onPress={() => setRetry(n => n + 1)}>Try again</Button>}</View>}
        <View className="mt-6"><Button secondary onPress={() => router.replace("/pit-stops")}>Back to Pit Stops</Button></View>
      </View>
    </View></ScrollView>
  </SafeAreaView>;
}
