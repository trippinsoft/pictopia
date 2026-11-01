import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, AppState, Platform, Pressable, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { Button, Icon, Text } from "./ui";
import { MediaImage, type MediaSettled } from "./media-image";
import { ZoomChoice } from "./zoom-choice";
import type { GameResult } from "./pit-stop-games";
import type { Media } from "@/lib/pictopia/types";
import type { OrderRound } from "@/lib/pictopia/pitstops";
import { ORDER_GAP, orderPhotoFrames, orderRoundController } from "@/lib/pictopia/order-round";

export function WhichFirstGame({ rounds, photos, onFinish, onExit }: { rounds: OrderRound[]; photos: Media[]; onFinish(result: GameResult): void; onExit(): void }) {
  const [index, setIndex] = useState(0);
  const result = useRef<GameResult>({ correct: 0, total: 0, skipped: 0, ids: [] });
  function next(correct: boolean | undefined, ids: string[]) {
    const previous = result.current;
    result.current = { correct: previous.correct + (correct ? 1 : 0), total: previous.total + (correct === undefined ? 0 : 1), skipped: previous.skipped + (correct === undefined ? 1 : 0), ids: [...new Set([...previous.ids, ...ids])] };
    if (index + 1 === rounds.length) onFinish(result.current);
    else setIndex(index + 1);
  }
  return <View className="flex-1">
    <View className="min-h-12 flex-row items-center gap-2">
      <Pressable accessibilityRole="button" accessibilityLabel="Back to Pit Stops" onPress={onExit} className="h-11 w-11 items-center justify-center"><Icon name="ChevronLeft" size={24} className="text-foreground" /></Pressable>
      <Text accessibilityRole="header" className="flex-1 text-headline text-foreground">Which came first?</Text>
      <Text accessibilityLabel={`Question ${index + 1} of ${rounds.length}`} className="text-caption text-muted-foreground">{index + 1} of {rounds.length}</Text>
    </View>
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: rounds.length, now: index + 1 }} className="mb-1.5 h-1 overflow-hidden rounded-full bg-secondary"><View className="h-1 bg-primary" style={{ width: `${(index + 1) / rounds.length * 100}%` }} /></View>
    <OrderPhotoRound key={index} round={rounds[index]} photos={photos} onNext={next} />
  </View>;
}

export function OrderPhotoRound({ round, photos, onNext }: { round: OrderRound; photos: Media[]; onNext(correct: boolean | undefined, ids: string[]): void }) {
  const [states, setStates] = useState<Record<string, MediaSettled>>({});
  const [selected, setSelected] = useState<string>();
  const [timedOut, setTimedOut] = useState(false);
  const [screenReader, setScreenReader] = useState<boolean>();
  const [active, setActive] = useState(AppState.currentState !== "background" && AppState.currentState !== "inactive");
  const [focused, setFocused] = useState(true);
  const [area, setArea] = useState<{ width: number; height: number }>();
  const submit = useRef(onNext); submit.current = onNext;
  const latestStates = useRef(states); latestStates.current = states;
  const controller = useRef<ReturnType<typeof orderRoundController> | null>(null);
  useEffect(() => {
    const current = orderRoundController(round.ids, round.answer, correct => submit.current(correct, round.ids.filter(id => latestStates.current[id] === "loaded")));
    controller.current = current;
    return () => { current.dispose(); controller.current = null; };
  }, [round]);
  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), 12000);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isScreenReaderEnabled().then(enabled => { if (alive) setScreenReader(enabled); }).catch(() => { if (alive) setScreenReader(true); });
    const reader = AccessibilityInfo.addEventListener("screenReaderChanged", setScreenReader);
    const app = AppState.addEventListener("change", state => setActive(state === "active"));
    const visibility = () => setActive(globalThis.document.visibilityState === "visible");
    if (Platform.OS === "web") globalThis.document.addEventListener("visibilitychange", visibility);
    return () => { alive = false; reader.remove(); app.remove(); if (Platform.OS === "web") globalThis.document.removeEventListener("visibilitychange", visibility); };
  }, []);
  useFocusEffect(useCallback(() => { setFocused(true); return () => { controller.current?.configure(false, false); setFocused(false); }; }, []));
  useEffect(() => { controller.current?.configure(active && focused, screenReader === false); }, [active, focused, screenReader]);
  const ready = round.ids.every(id => states[id] === "loaded");
  const answered = selected !== undefined;
  const failed = round.ids.some(id => states[id] === "failed") || (timedOut && !ready);
  const date = (id: string) => {
    const photo = photos.find(item => item.id === id);
    return photo ? new Date(photo.created).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "Date unavailable";
  };
  function choose(id: string) {
    if (!ready || !controller.current?.select(id)) return;
    setSelected(id);
    if (screenReader) AccessibilityInfo.announceForAccessibility(`${id === round.answer ? "Correct." : "Not quite."} Photo ${round.answer === round.ids[0] ? 1 : 2} was taken first. Photo 1: ${date(round.ids[0])}. Photo 2: ${date(round.ids[1])}.`);
  }
  // Both photos share the space: height one doesn't need goes to the other.
  const frames = area && orderPhotoFrames(area, round.ids.map(id => photos.find(item => item.id === id) ?? { width: 0, height: 0 }));
  return <View className="min-h-0 flex-1">
    <View className="min-h-0 flex-1 items-center justify-center" style={{ gap: ORDER_GAP }} onLayout={event => { const { width, height } = event.nativeEvent.layout; setArea(old => old?.width === width && old.height === height ? old : { width, height }); }}>
      {area && round.ids.map((id, index) => {
        const photo = photos.find(item => item.id === id);
        const frame = frames?.[index] ?? { width: 0, height: 0 };
        const first = answered && id === round.answer;
        return <OrderPhotoCard key={id} number={index + 1} first={first} selected={selected === id} answered={answered} date={date(id)} disabled={!ready || answered} frame={frame} onPress={() => choose(id)}>
          <MediaImage media={photo} className="h-full w-full" fit="contain" showLoading onSettled={status => setStates(old => old[id] === status ? old : { ...old, [id]: status })} />
        </OrderPhotoCard>;
      })}
    </View>
    <View className="min-h-12 justify-center pt-1.5">
      <Text accessibilityLiveRegion="polite" className={`text-center ${!answered ? "text-body text-muted-foreground" : selected === round.answer ? "text-headline text-primary" : "text-headline text-destructive"}`}>
        {answered ? selected === round.answer ? "Correct — well spotted!" : "Not quite — ✓ marks the first." : failed ? "A photo couldn’t load. This round won’t count." : !ready ? "Loading your photographs…" : "Tap the photo taken first · pinch to zoom"}
      </Text>
      {answered && screenReader !== false && <Button secondary onPress={() => controller.current?.advance()}>Next question</Button>}
      {!answered && failed && <Button secondary onPress={() => controller.current?.skip()}>Skip round</Button>}
    </View>
  </View>;
}
/** Each target hugs its photo and zooms inside its own frame; dates and answer feedback overlay it without moving the layout. */
export function OrderPhotoCard({ number, first, selected, answered, date, disabled, frame, onPress, children }: {
  number: number; first: boolean; selected: boolean; answered: boolean; date: string;
  disabled: boolean; frame: { width: number; height: number }; onPress(): void; children: ReactNode;
}) {
  const [pressed, setPressed] = useState(false);
  const wrong = selected && !first, down = pressed && !disabled;
  return <View accessible accessibilityRole="button"
    accessibilityLabel={`Photo ${number}${answered ? `, ${date}${first ? ", taken first" : ""}${selected ? ", your answer" : ""}` : ", choose as the earlier photograph"}`}
    accessibilityState={{ disabled, selected }} accessibilityActions={[{ name: "activate" }]}
    onAccessibilityAction={event => { if (event.nativeEvent.actionName === "activate" && !disabled) onPress(); }}
    onAccessibilityTap={() => { if (!disabled) onPress(); }}
    style={{ width: frame.width, height: frame.height, transform: [{ scale: down ? 0.98 : 1 }] }}
    className={`overflow-hidden rounded-2xl border-[3px] bg-secondary ${down ? "opacity-85" : answered && !first && !selected ? "opacity-60" : "opacity-100"} ${first ? "border-primary" : wrong ? "border-destructive" : selected ? "border-primary" : "border-transparent"}`}>
    <ZoomChoice onSelect={onPress} onPressChange={setPressed}>{children}</ZoomChoice>
    <View pointerEvents="none" className="absolute inset-x-2 bottom-2 flex-row flex-wrap items-center justify-between gap-1">
      <View className={`min-h-7 flex-row items-center gap-1 rounded-full px-2.5 py-1 ${first ? "bg-primary" : "bg-card/90"}`}>
        {first && <Icon name="Check" size={14} className="text-primary-foreground" />}
        <Text className={`text-caption ${first ? "text-primary-foreground" : "text-foreground"}`}>{answered ? `${first ? "First · " : ""}${date}` : `Photo ${number}`}</Text>
      </View>
      {selected && <View className="min-h-7 flex-row items-center gap-1 rounded-full bg-card/90 px-2.5 py-1">
        {wrong && <Icon name="X" size={14} className="text-destructive" />}
        <Text className={`text-caption ${wrong ? "text-destructive" : "text-foreground"}`}>Your pick</Text>
      </View>}
    </View>
  </View>;
}
