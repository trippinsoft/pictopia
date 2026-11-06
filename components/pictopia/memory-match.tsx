import { NavigationBack, ScreenHeader } from "./navigation-header";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, AppState, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import Animated, { cancelAnimation, FadeIn, ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import { Button, Icon, Loading, Text } from "./ui";
import { MemoryCard } from "./memory-card";
import { usePictopia } from "./provider";
import { cardPhoto, memoryDeck } from "@/lib/pictopia/pitstops";
import { initialMemoryState, memoryController, memoryGrid, type MemoryPairs } from "@/lib/pictopia/memory-match";
import type { Media } from "@/lib/pictopia/types";
import { pitStopStore } from "@/services/pitstops";
import { adventureStore } from "@/services/adventures";
import { memoryMatchHaptic } from "@/services/memory-haptics";

const exit = () => router.canGoBack() ? router.back() : router.replace("/pit-stops");
type Run = { photos: Media[]; deck: string[]; pairs: MemoryPairs };

export function MemoryMatchScreen() {
  const [pairs, setPairs] = useState<MemoryPairs>(4);
  const [capacity, setCapacity] = useState<number>();
  const [run, setRun] = useState<Run>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [retry, setRetry] = useState(0);
  const request = useRef(0), busy = useRef(false);
  const preferenceWrite = useRef(Promise.resolve());
  useEffect(() => {
    let alive = true;
    setError(undefined);
    void Promise.all([pitStopStore.library(), pitStopStore.memoryPairs()]).then(([library, saved]) => {
      if (alive) { setCapacity(library.photos); setPairs(library.photos < 6 ? 4 : saved); }
    }).catch(() => { if (alive) setError("Your photos couldn’t be read. Please try again."); });
    return () => { alive = false; };
  }, [retry]);
  useFocusEffect(useCallback(() => () => { request.current++; busy.current = false; setLoading(false); }, []));
  function choosePairs(value: MemoryPairs) {
    setPairs(value);
    preferenceWrite.current = preferenceWrite.current.catch(() => {}).then(() => pitStopStore.saveMemoryPairs(value));
    // Starting retries a failed preference write and reports it with the loading error.
    void preferenceWrite.current.catch(() => {});
  }
  async function start() {
    if (busy.current) return;
    busy.current = true;
    const token = ++request.current;
    setLoading(true); setError(undefined);
    try {
      const seed = Date.now();
      const photos = await pitStopStore.sample("memoryMatch", seed, pairs);
      const deck = memoryDeck(photos, seed, pairs);
      if (deck.length !== pairs * 2) throw Error(`This game needs ${pairs} available photographs. Try four pairs or choose more photos in Home.`);
      await preferenceWrite.current.catch(() => {});
      await pitStopStore.saveMemoryPairs(pairs);
      if (token === request.current) setRun({ photos, deck, pairs });
    } catch (e) { if (token === request.current) setError(e instanceof Error ? e.message : "Your photos couldn’t be loaded. Try again."); }
    finally { if (token === request.current) { busy.current = false; setLoading(false); } }
  }
  function restart() { request.current++; busy.current = false; setLoading(false); setError(undefined); setRun(undefined); }
  return <SafeAreaView className="flex-1 bg-background">
    <View className="mx-auto w-full max-w-md flex-1 px-4 pb-2">
      {run ? <MemoryBoard deck={run.deck} photos={run.photos} pairs={run.pairs} onRestart={restart} onExit={exit} /> : <>
        <MemoryHeader onExit={exit} />
        <ScrollView contentContainerStyle={styles.center}>
          <View className="gap-6 px-4 py-6">
            <View className="self-center rounded-2xl bg-accent p-6"><Icon name="Aperture" size={36} strokeWidth={1.25} className="text-primary" /></View>
            <View className="gap-2"><Text className="text-center text-h2 text-foreground">A little moment to remember.</Text><Text className="text-center text-body text-muted-foreground">Turn two cards. Find the same photograph.</Text></View>
            {capacity === undefined && !error ? <Loading /> : <>
              <View className="flex-row self-center rounded-2xl bg-secondary p-1">
                {([4, 6] as const).map(value => <Pressable key={value} accessibilityRole="radio" accessibilityLabel={`${value} pairs`} accessibilityState={{ checked: pairs === value, disabled: loading || (capacity ?? 0) < value }}
                  disabled={loading || (capacity ?? 0) < value} onPress={() => choosePairs(value)} className={`min-h-11 min-w-24 items-center justify-center rounded-xl px-5 ${(capacity ?? 0) < value ? "opacity-40" : ""} ${pairs === value ? "bg-card" : ""}`}>
                  <Text className={`text-h6 ${pairs === value ? "text-primary" : "text-muted-foreground"}`}>{value} pairs</Text>
                </Pressable>)}
              </View>
              {(capacity ?? 0) < 4 ? <Text className="text-center text-body text-muted-foreground">Choose at least four photographs in Home to play.</Text> : <Button disabled={loading} onPress={() => void start()}>{loading ? "Preparing your photos…" : "Let’s play"}</Button>}
            </>}
            {!!error && <View className="gap-3"><Text accessibilityLiveRegion="polite" className="text-center text-body text-muted-foreground">{error}</Text>{capacity === undefined && <Button secondary onPress={() => setRetry(value => value + 1)}>Try again</Button>}</View>}
          </View>
        </ScrollView>
      </>}
    </View>
  </SafeAreaView>;
}
function MemoryHeader({ onExit, children }: { onExit(): void; children?: ReactNode }) {
  return <View className="min-h-14 flex-row items-center gap-2">
    <NavigationBack label="Back to Pit Stops" onPress={onExit} />
    <Text accessibilityRole="header" className="flex-1 text-headline text-foreground">Memory Match</Text>{children}
  </View>;
}

export function MemoryBoard({ deck, photos, pairs, onRestart, onExit }: Run & { onRestart(): void; onExit(): void }) {
  const { prefs } = usePictopia();
  const [state, setState] = useState(initialMemoryState);
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});
  const [failed, setFailed] = useState(false);
  const [area, setArea] = useState({ width: 0, height: 0 });
  const [reader, setReader] = useState(true);
  const systemReduced = useReducedMotion();
  const [reduced, setReduced] = useState(systemReduced);
  const [active, setActive] = useState(AppState.currentState !== "background" && AppState.currentState !== "inactive");
  const [focused, setFocused] = useState(true);
  const controller = useRef<ReturnType<typeof memoryController> | null>(null);
  const haptics = useRef(prefs.haptics); haptics.current = prefs.haptics;
  const ready = deck.every(card => loaded[card]);
  useEffect(() => {
    const current = memoryController(deck, setState, () => { if (haptics.current) memoryMatchHaptic(); });
    controller.current = current;
    return () => { current.dispose(); controller.current = null; };
  }, [deck]);
  useEffect(() => {
    if (ready || failed) return;
    const timeout = setTimeout(() => setFailed(true), 12000);
    return () => clearTimeout(timeout);
  }, [ready, failed]);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isScreenReaderEnabled().then(value => { if (alive) setReader(value); }).catch(() => {});
    const screenReader = AccessibilityInfo.addEventListener("screenReaderChanged", setReader);
    const motion = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    const app = AppState.addEventListener("change", value => setActive(value === "active"));
    const visibility = () => setActive(globalThis.document.visibilityState === "visible");
    if (Platform.OS === "web") { visibility(); globalThis.document.addEventListener("visibilitychange", visibility); }
    return () => { alive = false; screenReader.remove(); motion.remove(); app.remove(); if (Platform.OS === "web") globalThis.document.removeEventListener("visibilitychange", visibility); };
  }, []);
  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => { controller.current?.configure({ active: false, ready: false, reduced: false, reader: true }); setFocused(false); };
  }, []));
  useEffect(() => { controller.current?.configure({ active: active && focused, ready: ready && !failed, reduced, reader }); }, [active, focused, ready, failed, reduced, reader]);
  const count = state.matched.length / 2;
  const countScale = useSharedValue(1);
  useEffect(() => {
    countScale.value = reduced ? 1 : 1.08;
    countScale.value = withTiming(1, { duration: reduced ? 0 : 280 });
    return () => cancelAnimation(countScale);
  }, [count, reduced, countScale]);
  const progress = useAnimatedStyle(() => ({ transform: [{ scale: countScale.value }] }));
  function stop(action: () => void) { controller.current?.dispose(); action(); }
  const frame = memoryGrid(area.width, area.height - 8, pairs);
  return <View className="flex-1">
    <MemoryHeader onExit={() => stop(onExit)}>
      <Animated.View style={progress}><Text accessibilityLiveRegion="polite" accessibilityLabel={`${count} of ${pairs} pairs found`} className="text-h6 text-muted-foreground">{count} / {pairs}</Text></Animated.View>
    </MemoryHeader>
    {state.phase === "complete" ? <MemoryCompletion pairs={pairs} ids={[...new Set(deck.map(cardPhoto))]} reduced={reduced} onRestart={() => stop(onRestart)} onExit={() => stop(() => router.replace("/pit-stops"))} /> : <>
      <Text accessibilityLiveRegion="polite" className="pb-3 pt-1 text-center text-body text-muted-foreground">{failed ? "A photo couldn’t load. Try a new set." : !ready ? "Preparing your photographs…" : "Turn two cards. Find the pair."}</Text>
      <View className="min-h-0 flex-1" onLayout={event => { const { width, height } = event.nativeEvent.layout; setArea(old => old.width === width && old.height === height ? old : { width, height }); }}>
        {area.width > 0 && <ScrollView contentContainerStyle={styles.board} showsVerticalScrollIndicator={false}>
          <View style={[styles.grid, { gap: frame.gap }]}>
            {deck.map((card, index) => {
              const matched = state.matched.includes(card), open = matched || state.open.includes(card);
              return <MemoryCard key={card} index={index} photoNumber={[...new Set(deck.map(cardPhoto))].indexOf(cardPhoto(card)) + 1}
                photo={photos.find(photo => photo.id === cardPhoto(card))} open={open} matched={matched} celebrating={state.phase === "matching" && state.open.includes(card)}
                reduced={reduced} active={active && focused} width={frame.cardWidth} height={frame.cardHeight}
                disabled={!ready || failed || !active || !focused || state.phase !== "ready" || open}
                onPress={() => controller.current?.select(card)} onSettled={status => { if (status === "failed") setFailed(true); else setLoaded(old => old[card] ? old : { ...old, [card]: true }); }} />;
            })}
          </View>
        </ScrollView>}
      </View>
      <Pressable accessibilityRole="button" onPress={() => stop(onRestart)} className="min-h-11 items-center justify-center"><Text className="text-h6 text-muted-foreground">{failed ? "Try a new set" : "Start over"}</Text></Pressable>
    </>}
  </View>;
}
export function MemoryCompletion({ pairs, ids, reduced, onRestart, onExit }: { pairs: MemoryPairs; ids: string[]; reduced: boolean; onRestart(): void; onExit(): void }) {
  const [reviewing, setReviewing] = useState(false), [error, setError] = useState(false);
  const alive = useRef(true), busy = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function review() {
    if (busy.current) return;
    busy.current = true; setReviewing(true); setError(false);
    try {
      const adventure = await adventureStore.fromPhotos(ids, "Memory Match");
      if (!adventure) throw Error("unavailable");
      if (!alive.current) return;
      await adventureStore.open(adventure.id);
      if (alive.current) router.replace({ pathname: "/vertical-explore", params: { adventure: adventure.id } });
    } catch { if (alive.current) setError(true); }
    finally { busy.current = false; if (alive.current) setReviewing(false); }
  }
  return <><ScreenHeader title="Memory Match" onBack={onExit} />
  <ScrollView contentContainerStyle={styles.center}>
    <Animated.View entering={FadeIn.duration(reduced ? 0 : 300).reduceMotion(ReduceMotion.System)} ><View className="gap-6 px-5 py-6">
      <View className="h-20 w-20 items-center justify-center self-center rounded-full bg-accent"><Icon name="Check" size={32} strokeWidth={1.5} className="text-primary" /></View>
      <View className="gap-2"><Text accessibilityRole="header" className="text-center text-h1 text-foreground">All together.</Text><Text accessibilityLiveRegion="polite" className="text-center text-body text-muted-foreground">{pairs} pairs found. A moment well spent.</Text></View>
      <View className="gap-3">
        <Button disabled={reviewing} onPress={onRestart}>Play again</Button>
        <Button secondary disabled={reviewing} onPress={() => void review()}>{reviewing ? "Opening photos…" : "Review these photos"}</Button>
      </View>
      <Pressable accessibilityRole="button" disabled={reviewing} onPress={onExit} className="min-h-11 items-center justify-center"><Text className="text-h6 text-muted-foreground">Back to Pit Stops</Text></Pressable>
      {error && <Text accessibilityLiveRegion="polite" className="text-center text-body text-muted-foreground">These photos couldn’t be opened. Please try again.</Text>}
    </View></Animated.View>
  </ScrollView></>;
}

const styles = StyleSheet.create({ center: { flexGrow: 1, justifyContent: "center" }, board: { flexGrow: 1, justifyContent: "center", paddingVertical: 4 }, grid: { flexDirection: "row", flexWrap: "wrap" } });
