import { NavigationBack } from "./navigation-header";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, AppState, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import Animated, { cancelAnimation, FadeIn, ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import { Button, Icon, Loading, Text } from "./ui";
import { Illustration } from "./illustration";
import { MemoryCard } from "./memory-card";
import { usePictopia } from "./provider";
import { cardPhoto, memoryDeck } from "@/lib/pictopia/pitstops";
import { initialMemoryState, memoryController, memoryGrid, type MemoryPairs } from "@/lib/pictopia/memory-match";
import type { Media } from "@/lib/pictopia/types";
import { pitStopStore } from "@/services/pitstops";
import { preparePitStop } from "@/services/pit-stop-photos";
import { memoryMatchHaptic } from "@/services/memory-haptics";

const exit = () => router.canGoBack() ? router.back() : router.replace("/pit-stops");
type Run = { photos: Media[]; deck: string[]; pairs: MemoryPairs; uris?: Record<string, string>; dispose?(): void };

export function MemoryMatchScreen() {
  const [pairs, setPairs] = useState<MemoryPairs>(4);
  const [capacity, setCapacity] = useState<number>();
  const [run, setRun] = useState<Run>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [retry, setRetry] = useState(0);
  const preparation = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => run?.dispose?.(), [run]);
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
  useFocusEffect(useCallback(() => () => { request.current++; preparation.current?.abort(); busy.current = false; setLoading(false); }, []));
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
      preparation.current?.abort();
      const controller = new AbortController(); preparation.current = controller;
      const prepared = await preparePitStop("memoryMatch", seed, controller.signal, pairs);
      if (token !== request.current) { prepared.dispose(); return; }
      const photos = prepared.photos;
      const deck = memoryDeck(photos, seed, pairs);
      if (deck.length !== pairs * 2) {
        prepared.dispose();
        if (photos.length >= 4) { setCapacity(photos.length); setPairs(4); }
        throw Error(photos.length >= 4 ? "Standard needs six available photos. Easy is ready to play." : "This Pit Stop needs at least four available photos. Try again when more photos are accessible.");
      }
      await preferenceWrite.current.catch(() => {});
      await pitStopStore.saveMemoryPairs(pairs);
      if (token === request.current) setRun({ ...prepared, photos, deck, pairs });
      else prepared.dispose();
    } catch (e) { if (token === request.current) setError(e instanceof Error ? e.message : "Your photos couldn’t be loaded. Try again."); }
    finally { if (token === request.current) { busy.current = false; setLoading(false); } }
  }
  function restart() { request.current++; preparation.current?.abort(); busy.current = false; setLoading(false); setError(undefined); setRun(undefined); void start(); }
  return <SafeAreaView className="flex-1 bg-background">
    <View className="mx-auto w-full max-w-3xl flex-1 px-4 pb-2">
      {run ? <MemoryBoard deck={run.deck} photos={run.photos} uris={run.uris} pairs={run.pairs} onRestart={restart} onExit={exit} /> : <>
        <MemoryHeader onExit={exit} />
        {loading ? <Loading /> : <ScrollView contentContainerStyle={styles.center}>
          <View className="gap-6 px-4 py-6">
            <View className="h-32 w-40 self-center overflow-hidden rounded-2xl"><Illustration name="memoryMatch" /></View>
            <View className="gap-2"><Text className="text-center text-h2 text-foreground">A little moment to remember.</Text><Text className="text-center text-body text-muted-foreground">Turn two cards. Find the same photograph.</Text></View>
            {capacity === undefined && !error ? <Loading /> : <>
              <View className="flex-row self-center rounded-2xl bg-secondary p-1">
                {([4, 6] as const).map(value => <Pressable key={value} accessibilityRole="radio" accessibilityLabel={`${value === 4 ? "Easy" : "Standard"}, ${value} pairs`} accessibilityState={{ checked: pairs === value, disabled: loading || (capacity ?? 0) < value }}
                  disabled={loading || (capacity ?? 0) < value} onPress={() => choosePairs(value)} className={`min-h-11 min-w-24 items-center justify-center rounded-xl px-5 ${(capacity ?? 0) < value ? "opacity-40" : ""} ${pairs === value ? "bg-card" : ""}`}>
                  <Text className={`text-h6 ${pairs === value ? "text-primary" : "text-muted-foreground"}`}>{value === 4 ? "Easy · 4 pairs" : "Standard · 6 pairs"}</Text>
                </Pressable>)}
              </View>
              {(capacity ?? 0) < 4 ? <Text className="text-center text-body text-muted-foreground">Choose at least four photographs in Home to play.</Text> : <Button disabled={loading} onPress={() => void start()}>{loading ? "Preparing your photos…" : "Let’s play"}</Button>}
            </>}
            {!!error && <View className="gap-3"><Text accessibilityLiveRegion="polite" className="text-center text-body text-muted-foreground">{error}</Text>{capacity === undefined && <Button secondary onPress={() => setRetry(value => value + 1)}>Try again</Button>}</View>}
          </View>
        </ScrollView>}
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

export function MemoryBoard({ deck, photos, uris, pairs, onRestart, onExit }: Run & { onRestart(): void; onExit(): void }) {
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
    {state.phase === "complete" ? <MemoryCompletion pairs={pairs} moves={state.moves} ids={[...new Set(deck.map(cardPhoto))]} reduced={reduced} onRestart={() => stop(onRestart)} onExit={() => stop(onExit)} /> : <>
      <Text accessibilityLiveRegion="polite" className="pb-3 pt-1 text-center text-body text-muted-foreground">{failed ? "A photo couldn’t load. Try a new set." : !ready ? "Preparing your photographs…" : "Turn two cards. Find the pair."}</Text>
      <View className="min-h-0 flex-1" onLayout={event => { const { width, height } = event.nativeEvent.layout; setArea(old => old.width === width && old.height === height ? old : { width, height }); }}>
        {area.width > 0 && <ScrollView contentContainerStyle={styles.board} showsVerticalScrollIndicator={false}>
          <View style={[styles.grid, { gap: frame.gap }]}>
            {deck.map((card, index) => {
              const matched = state.matched.includes(card), open = matched || state.open.includes(card);
              return <MemoryCard key={card} index={index} photoNumber={[...new Set(deck.map(cardPhoto))].indexOf(cardPhoto(card)) + 1}
                photo={photos.find(photo => photo.id === cardPhoto(card))} uri={uris?.[cardPhoto(card)]} open={open} matched={matched} celebrating={state.phase === "matching" && state.open.includes(card)}
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
export function MemoryCompletion({ pairs, moves = 0, reduced, onRestart, onExit }: { pairs: MemoryPairs; moves?: number; ids: string[]; reduced: boolean; onRestart(): void; onExit(): void }) {
  return <ScrollView contentContainerStyle={styles.center}>
    <Animated.View entering={FadeIn.duration(reduced ? 0 : 300).reduceMotion(ReduceMotion.System)}>
      <View className="gap-6 px-5 py-6">
        <View className="h-20 w-20 items-center justify-center self-center rounded-full bg-accent"><Icon name="Check" size={32} strokeWidth={1.5} className="text-primary" /></View>
        <View className="gap-2"><Text accessibilityRole="header" className="text-center text-h1 text-foreground">Perfect Match!</Text><Text className="text-center text-body text-muted-foreground">{pairs} pairs found · {moves} moves</Text></View>
        <Button onPress={onRestart}>Play Again</Button>
        <Button secondary onPress={onExit}>Done</Button>
      </View>
    </Animated.View>
  </ScrollView>;
}

const styles = StyleSheet.create({ center: { flexGrow: 1, justifyContent: "center" }, board: { flexGrow: 1, justifyContent: "center", paddingVertical: 4 }, grid: { flexDirection: "row", flexWrap: "wrap" } });
