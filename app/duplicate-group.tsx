import { NavigationBack } from "@/components/pictopia/navigation-header";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { AdventureTheme } from "@/components/pictopia/adventure-theme";
import { Button, Icon, Loading, Text } from "@/components/pictopia/ui";
import { MediaImage } from "@/components/pictopia/media-image";
import { ZoomPhoto } from "@/components/pictopia/zoom-photo";
import { resetZoom, useZoomState, type ZoomState } from "@/components/pictopia/zoom-state";
import { DiscardLabels } from "@/components/pictopia/discard-label";
import { usePictopia } from "@/components/pictopia/provider";
import { ReviewActions } from "@/components/pictopia/review-actions";
import { ReviewTrash, type ReviewTrashHandle } from "@/components/pictopia/review-trash";
import { DiscardTray } from "@/components/pictopia/discard-tray";
import { useDiscardFlights } from "@/components/pictopia/discard-flight";
import { SwipeGesture } from "@/components/pictopia/swipe-gesture";
import { groupLabel } from "@/lib/pictopia/lookalikes";
import { marksEverything } from "@/lib/pictopia/features";
import { displayMediaSize, knownMediaSize } from "@/lib/pictopia/storage-size";
import { bytes } from "@/lib/pictopia/logic";
import type { Media } from "@/lib/pictopia/types";
import { repository } from "@/services/repository";
import { lookalikeStore, type GroupView } from "@/services/lookalikes";

const FADE_MS = 170;
const SPRING = { damping: 18, stiffness: 220, mass: 0.7 };

/** One Duplicate Hunt set. The big photo crossfades to whichever thumbnail is tapped, so
 * differences stand out; swiping it sideways discards it into the trash exactly like every
 * review, with Restore, Undo, Favorite and Share. Discards go to the same Discarded list. */
export default function DuplicateGroup() {
  const { group: groupId } = useLocalSearchParams<{ group: string }>();
  const app = usePictopia();
  const reduced = useReducedMotion();
  const [view, setView] = useState<GroupView | null>();
  const [items, setItems] = useState<Media[]>([]);
  const [selected, setSelected] = useState<string>();
  const [previous, setPrevious] = useState<string>();
  const [leaving, setLeaving] = useState<string>();
  // The swiped photo stays put until its flying copy has taken over, then steps aside.
  const [held, setHeld] = useState<string>();
  const [history, setHistory] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<string>();
  const [tray, setTray] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [next, setNext] = useState<string | null>();
  const x = useSharedValue(0), y = useSharedValue(0), handing = useSharedValue(false);
  // One zoom for the whole set: switching photos keeps the same close-up to compare details.
  const zoom = useZoomState();
  const [zoomed, setZoomed] = useState(false);
  const trash = useRef<ReviewTrashHandle>(null), stage = useRef<View>(null), strip = useRef<ScrollView>(null);
  const frames = useRef<{ stage?: { x: number; y: number }; photo?: { x: number; y: number; width: number; height: number }; trash?: { x: number; y: number } }>({});

  useEffect(() => { if (app.ready && !app.pro) router.replace({ pathname: "/paywall", params: { entry: "Duplicates" } }); }, [app.ready, app.pro]);
  useEffect(() => {
    if (!groupId) return;
    let alive = true;
    void lookalikeStore.group(groupId).then(async found => {
      if (!alive) return;
      setView(found ?? null);
      if (!found) return;
      setItems(found.items); setSelected(old => old ?? (found.items.find(m => m.decision !== "delete") ?? found.items[0]).id);
      // Opening a set counts as reviewing it: it shows a check in the batch and makes way
      // for a new set next visit. Then the next unreviewed set in the same batch.
      await lookalikeStore.markReviewed(found.group).catch(() => {});
      const following = await lookalikeStore.nextInBatch(found.group.id).catch(() => undefined);
      if (alive) setNext(following ?? null);
    }).catch(() => { if (alive) setView(null); });
    return () => { alive = false; };
  }, [groupId]);

  const byId = useMemo(() => Object.fromEntries(items.map(m => [m.id, m])), [items]);
  const current = selected ? byId[selected] : undefined;
  const marked = items.filter(m => m.decision === "delete").map(m => m.id);
  const landed = marked.filter(id => id !== leaving);
  const trashBytes = landed.reduce((n, id) => n + displayMediaSize(byId[id]), 0);
  const index = current ? items.indexOf(current) : -1;
  const discardedNow = !!current && current.decision === "delete" && current.id !== leaving;

  // Crossfade: the newly chosen photo fades in over the one already showing, then that one rests.
  const choose = useCallback((id: string) => {
    if (id === selected || leaving) return;
    x.value = 0; y.value = 0;
    setPrevious(selected);
    setSelected(id);
  }, [selected, leaving, x, y]);
  useEffect(() => {
    if (!previous) return;
    const timer = setTimeout(() => setPrevious(undefined), FADE_MS + 40);
    return () => clearTimeout(timer);
  }, [previous, selected]);
  useEffect(() => {
    if (index >= 0) strip.current?.scrollTo({ x: Math.max(0, index * THUMB_STEP - THUMB_STEP * 1.5), animated: !reduced });
  }, [index, reduced]);

  const measureStage = useCallback(() => { stage.current?.measureInWindow((sx, sy) => { frames.current.stage = { x: sx, y: sy }; }); }, []);
  const geometry = useCallback(() => {
    const { stage: origin, photo: frame, trash: can } = frames.current;
    if (!frame) return {};
    return { frame, target: can && origin ? { x: can.x - origin.x, y: can.y - origin.y } : { x: frame.x + frame.width - 40, y: frame.y + 20 } };
  }, []);
  const { flight, layer, flying } = useDiscardFlights({ geometry, reduced, onArrive: () => trash.current?.bounce() });

  const save = async (id: string, decision: "delete" | undefined) => {
    setError(undefined);
    await repository.setDecision(id, decision);
    setItems(old => old.map(m => (m.id === id ? { ...m, decision } : m)));
    void app.refresh();
  };
  const nextUndiscarded = (from: string, without: string) => {
    const at = items.findIndex(m => m.id === from);
    for (let step = 1; step <= items.length; step++) {
      const m = items[(at + step) % items.length];
      if (m.id !== without && m.decision !== "delete") return m.id;
    }
    return from;
  };
  /** Sends the shown photo to the trash from wherever the finger let go. */
  const discard = (direction: "left" | "right", velocity: number) => {
    const target = current;
    if (!target || busy || leaving) return;
    setBusy(true); setLeaving(target.id); setHeld(target.id); handing.value = true;
    const launch = flight.launch({ id: target.id, media: target, offset: { x: x.value, y: y.value }, direction, velocity });
    const saving = save(target.id, "delete");
    void launch.handoff.then(() => {
      x.value = 0; y.value = 0; handing.value = false;
      resetZoom(zoom, false);
      setHeld(undefined);
      setPrevious(undefined);
      setSelected(nextUndiscarded(target.id, target.id));
    });
    void Promise.all([saving, launch.landed]).then(() => setHistory(old => [...old, target.id]))
      .catch(e => { flight.cancel(target.id); setSelected(target.id); setError(e instanceof Error ? e.message : "That couldn’t be saved. Please try again."); })
      .finally(() => { setLeaving(undefined); setBusy(false); });
  };
  const commit = (direction: 1 | -1) => {
    if (!current) return;
    if (marksEverything(items.map(m => m.id), new Set(marked), current.id)) {
      x.value = withSpring(0, SPRING); y.value = withSpring(0, SPRING);
      setConfirm(current.id);
      return;
    }
    discard(direction === 1 ? "right" : "left", 1400);
  };
  const springBack = () => { x.value = withSpring(0, SPRING); y.value = withSpring(0, SPRING); };
  /** Restore flies the photo back out of the trash, then shows it again. */
  const restore = (id: string) => {
    const item = byId[id];
    if (!item || busy) return;
    setBusy(true);
    setPrevious(undefined); setSelected(id);
    void flight.reclaim({ id, media: item }).landed
      .then(() => save(id, undefined))
      .then(() => setHistory(old => old.filter(other => other !== id)))
      .catch(e => setError(e instanceof Error ? e.message : "That couldn’t be restored. Please try again."))
      .finally(() => setBusy(false));
  };
  const undo = () => { const last = history[history.length - 1]; if (last) restore(last); };
  const exit = () => (router.canGoBack() ? router.back() : router.replace("/duplicate-hunt"));

  // A few photos either side of the shown one stay mounted, already loaded, so taps are instant.
  const mounted = useMemo(() => {
    const keep = new Set<string>();
    // Display-size photos are large: only the shown one and its two neighbours stay loaded.
    items.forEach((m, i) => { if (Math.abs(i - index) <= 1) keep.add(m.id); });
    if (previous) keep.add(previous);
    if (held) keep.add(held);
    return items.filter(m => keep.has(m.id));
  }, [items, index, previous, held]);
  const card = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { translateY: y.value }, { rotate: `${x.value / 24}deg` }] }));

  const sorted = marked.length > 0 && marked.length >= items.length - 1;
  const title = view ? groupLabel(view.group.kind, items.length) : "Duplicate Hunt";
  if (view === undefined || !app.pro) return <Shell><Loading /></Shell>;
  if (view === null || !items.length) return <Shell>
    <View className="px-4"><NavigationBack onPress={exit} /></View>
    <View className="flex-1 items-center justify-center gap-3 px-8">
      <Text accessibilityRole="header" className="text-center text-display text-foreground">This set has moved on</Text>
      <Text className="text-center text-body leading-6 text-muted-foreground">Its photos were deleted or changed since Pictopia last looked. Your other sets are waiting.</Text>
      <View className="mt-2 w-full max-w-xs"><Button onPress={exit}>Back to Duplicate Hunt</Button></View>
    </View>
  </Shell>;
  return <Shell>
    <View ref={stage} onLayout={measureStage} className="mx-auto w-full max-w-3xl flex-1">
      <View className="flex-row items-center justify-between px-4 pb-3 pt-1">
        <NavigationBack label="Back to Duplicate Hunt" onPress={exit} />
        <View className="min-w-0 flex-1 items-center px-2">
          <Text numberOfLines={1} accessibilityRole="header" className="text-center text-headline text-foreground">{title}</Text>
          <Text className="text-caption text-muted-foreground" style={tabular}>{current ? `${index + 1} of ${items.length} · ${dayLabel(current.created)}` : ""}</Text>
        </View>
        <ReviewTrash ref={trash} count={landed.length} bytes={trashBytes} unknownSizes={0} onMeasure={centre => { frames.current.trash = centre; }} onPress={() => setTray(true)} />
      </View>

      <View className="min-h-0 flex-1" onLayout={e => { frames.current.photo = e.nativeEvent.layout; measureStage(); }}>
        <SwipeGesture x={x} y={y} enabled={!!current && !discardedNow && !busy && !zoomed && flying === 0} threshold={110} onCommit={commit} onCancel={springBack}>
          <Animated.View collapsable={false} style={[styles.fill, card]}>
            {mounted.map(m => <Layer key={m.id} media={m} reduced={reduced} zoom={zoom} onZoomChange={setZoomed}
              state={m.id === held ? "shown" : m.id === selected ? "front" : m.id === previous ? "shown" : "hidden"}
              dimmed={m.decision === "delete" && m.id !== leaving} />)}
          </Animated.View>
        </SwipeGesture>
        <DiscardLabels x={x} hidden={handing} />
        {current && current.id === view.group.best && !discardedNow ? <View pointerEvents="none" className="absolute left-3 top-2 flex-row items-center gap-1 rounded-[9px] bg-black/50 px-2.5 py-1">
          <Icon name="Sparkles" size={13} className="text-sun" /><Text className="text-caption text-white">Pictopia’s pick</Text>
        </View> : null}
        {discardedNow ? <View pointerEvents="none" className="absolute inset-0 items-center justify-center"><View className="flex-row items-center gap-1.5 rounded-full bg-black/60 px-4 py-2"><Icon name="Trash2" size={16} className="text-white" /><Text className="text-button text-white">Discarded</Text></View></View> : null}
        {!!error && <Text accessibilityRole="alert" className="absolute left-4 right-4 top-12 rounded-2xl bg-card/95 px-4 py-2 text-body text-foreground">{error}</Text>}
      </View>

      {current ? <Text numberOfLines={1} className="px-4 pt-2 text-center text-caption text-muted-foreground" style={tabular}>{details(current)}</Text> : null}
      <ScrollView ref={strip} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={stripStyle} className="grow-0">
        {items.map((m, i) => {
          const on = m.id === selected, gone = m.decision === "delete" && m.id !== leaving;
          return <Pressable key={m.id} accessibilityRole="button" accessibilityState={{ selected: on }}
            accessibilityLabel={`Photo ${i + 1} of ${items.length}${gone ? ", discarded" : ""}${m.id === view.group.best ? ", Pictopia’s pick" : ""}`}
            onPress={() => choose(m.id)} style={thumb} className={`overflow-hidden rounded-[12px] border-[2.5px] active:opacity-80 ${on ? "border-sun" : "border-transparent"}`}>
            <MediaImage media={m} thumbnail className={`flex-1 ${gone ? "opacity-35" : ""}`} />
            {gone ? <View pointerEvents="none" className="absolute inset-0 items-center justify-center"><View className="h-6 w-6 items-center justify-center rounded-full bg-black/60"><Icon name="Trash2" size={13} className="text-white" /></View></View> : null}
            {m.id === view.group.best && !gone ? <View pointerEvents="none" className="absolute right-1 top-1 h-4 w-4 items-center justify-center rounded-full bg-sun"><Icon name="Star" size={9} className="text-primary-foreground" /></View> : null}
          </Pressable>;
        })}
      </ScrollView>

      <View className="flex-row items-center justify-between px-4 pb-2 pt-1">
        <Pressable accessibilityRole="button" accessibilityLabel={history.length ? "Undo the last discard and bring that photo back" : "Undo, nothing to undo yet"} accessibilityState={{ disabled: !history.length || busy }} disabled={!history.length || busy} onPress={undo}
          className={`h-12 flex-row items-center gap-2 rounded-full bg-card/90 px-4 active:opacity-70 ${history.length ? "" : "opacity-45"}`}>
          <Icon name="Undo2" size={20} className="text-sun" />
          <Text className="text-button text-sun">Undo</Text>
        </Pressable>
        {sorted && next ? <Pressable accessibilityRole="button" accessibilityLabel="Next set of look-alikes" onPress={() => router.replace({ pathname: "/duplicate-group", params: { group: next } })} className="h-12 flex-row items-center gap-1.5 rounded-full bg-sun px-4 active:opacity-80">
          <Text className="text-button text-primary-foreground">Next set</Text><Icon name="ChevronRight" size={18} className="text-primary-foreground" />
        </Pressable> : <ReviewActions media={current} disabled={busy} queued={discardedNow} legacy={false} highlighted={false} onRestore={() => current && restore(current.id)} onUsed={() => {}} />}
      </View>
      {layer}
    </View>

    <DiscardTray visible={tray} ids={marked} media={byId} busy={busy} onRestore={id => { setTray(false); restore(id); }} onClose={() => setTray(false)} onReview={() => { setTray(false); router.push("/queue"); }} />
    <Modal visible={!!confirm} transparent animationType="fade" onRequestClose={() => setConfirm(undefined)}>
      <AdventureTheme enabled><View className="flex-1 items-center justify-center bg-black/70 px-6">
        <View className="w-full max-w-sm rounded-[24px] bg-card p-6">
          <Text className="text-display text-foreground">{`Discard all ${items.length}?`}</Text>
          <Text className="my-3 text-body leading-6 text-muted-foreground">None of this set would be left once you delete. They stay in your library until you delete them from Discarded.</Text>
          <Button danger onPress={() => { const id = confirm; setConfirm(undefined); if (id) discard("right", 0); }}>Discard all</Button>
          <Pressable accessibilityRole="button" onPress={() => setConfirm(undefined)} className="mt-1 min-h-12 items-center justify-center"><Text className="text-button text-foreground">Keep this one</Text></Pressable>
        </View>
      </View></AdventureTheme>
    </Modal>
  </Shell>;
}

function Shell({ children }: { children: ReactNode }) {
  return <AdventureTheme enabled><SafeAreaView className="flex-1 bg-background">
    <StatusBar style="light" />
    <Stack.Screen options={{ title: "Duplicate Hunt", headerShown: false, gestureEnabled: false }} />
    {children}
  </SafeAreaView></AdventureTheme>;
}

/** One photo of the set, stacked over the others. "front" fades in on top; "shown" stays
 * fully visible underneath for the length of the fade; "hidden" rests invisible (and loaded). */
function Layer({ media, state, dimmed, reduced, zoom, onZoomChange }: { media: Media; state: "front" | "shown" | "hidden"; dimmed: boolean; reduced: boolean; zoom: ZoomState; onZoomChange(zoomed: boolean): void }) {
  const opacity = useSharedValue(state === "hidden" ? 0 : 1);
  useEffect(() => {
    opacity.value = state === "front" ? withTiming(1, { duration: reduced ? 0 : FADE_MS }) : state === "shown" ? 1 : 0;
  }, [state, reduced, opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const active = state !== "hidden";
  return <Animated.View pointerEvents={state === "front" ? "auto" : "none"} style={[StyleSheet.absoluteFill, state === "front" ? styles.front : state === "shown" ? styles.under : styles.rest, style]}>
    <ZoomPhoto media={media} active={state === "front"} zoom={zoom} onZoomChange={onZoomChange}
      imageProps={{ className: `flex-1 ${dimmed ? "opacity-35" : ""}`, showLoading: state === "front", active: state === "front", network: true, quietFailure: !active, allowRetry: state === "front" }} />
  </Animated.View>;
}

function dayLabel(created: number) {
  return new Date(created).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
/** Capture time to the second, resolution and size: the facts that tell look-alikes apart. */
function details(m: Media) {
  const time = new Date(m.created).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" });
  const size = displayMediaSize(m);
  return [time, m.width && m.height ? `${m.width} × ${m.height}` : undefined, size ? `${knownMediaSize(m) === undefined ? "≈ " : ""}${bytes(size)}` : undefined].filter(Boolean).join("  ·  ");
}
const THUMB = 64, THUMB_STEP = THUMB + 8;
const thumb = { width: THUMB, height: THUMB };
const stripStyle = { gap: 8, paddingHorizontal: 16, paddingVertical: 10 };
const tabular = { fontVariant: ["tabular-nums" as const] };
const styles = StyleSheet.create({ fill: { flex: 1 }, front: { zIndex: 2 }, under: { zIndex: 1 }, rest: { zIndex: 0 } });
