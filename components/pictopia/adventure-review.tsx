import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useReducedMotion } from "react-native-reanimated";
import { AdventureTheme } from "./adventure-theme";
import { AdventureFinish } from "./adventure-finish";
import { Button, Icon, Loading, Text } from "./ui";
import { ExploreFeed, type ExploreFeedHandle } from "./explore-feed";
import { useExplore } from "./use-explore";
import { ReviewActions } from "./review-actions";
import { ReviewHint, useReviewGuidance } from "./review-hint";
import { ReviewTrash, type ReviewTrashHandle } from "./review-trash";
import { DiscardTray } from "./discard-tray";
import { ReviewProgressRail, type ReviewProgressRailHandle } from "./review-progress-rail";
import { useDiscardFlights } from "./discard-flight";
import { exploreCounts, exploreFeed, type ExploreAction } from "@/lib/pictopia/explore";
import { plural } from "@/lib/pictopia/text";
import type { Adventure } from "@/lib/pictopia/adventures";
import { adventureSessionKey, adventureStore } from "@/services/adventures";

export function AdventureReview({ id }: { id: string }) {
  const { app, session, media, pending, error, change, getSession, reload } = useExplore(adventureSessionKey(id));
  const [adventure, setAdventure] = useState<Adventure>(), [valid, setValid] = useState<boolean>(), [loadError, setLoadError] = useState<string>();
  const [selected, setSelected] = useState<string>(), [busy, setBusy] = useState(false), [available, setAvailable] = useState(false), [tray, setTray] = useState(false), [transitionError, setTransitionError] = useState<string>();
  const finishing = useRef(false);
  const [undoAt, setUndoAt] = useState(0), [undoVisible, setUndoVisible] = useState(false);
  const feed = useRef<ExploreFeedHandle>(null), stage = useRef<View>(null), trash = useRef<ReviewTrashHandle>(null), rail = useRef<ReviewProgressRailHandle>(null);
  const reduced = useReducedMotion();
  const photo = selected ?? session?.activeId ?? undefined;
  const current = photo ? media[photo] : undefined;
  const queued = !!(photo && session?.records[photo]?.queued), legacy = !!(photo && session?.records[photo]?.discarded && !queued);
  const complete = !!session?.finished;
  const guidance = useReviewGuidance(app.ready && !!session && !complete);
  useEffect(() => {
    let alive = true;
    void Promise.all([adventureStore.get(id), adventureStore.validPhotoOffer(id)]).then(([value, valid]) => { if (alive) { setAdventure(value); setValid(valid); } }).catch(() => { if (alive) setLoadError("This adventure couldn’t be loaded. Return to Explore and try again."); });
    return () => { alive = false; };
  }, [id]);
  const seen = useRef(new Set<string>());
  useEffect(() => {
    if (!photo || !available || !session?.review || session.records[photo]?.encountered || seen.current.has(photo)) return;
    seen.current.add(photo);
    void change({ type: "seen", id: photo }).then(saved => { if (!saved.records[photo]?.encountered) seen.current.delete(photo); }).catch(() => seen.current.delete(photo));
  }, [photo, available, session, change]);
  // The photograph's frame and the trash's centre, both in this screen's own coordinates, so
  // a discarded photograph can fly from exactly where it sits to exactly where the can is.
  const frames = useRef<{ stage?: { x: number; y: number }; feed?: { x: number; y: number; width: number; height: number }; trash?: { x: number; y: number } }>({});
  const measureStage = useCallback(() => { stage.current?.measureInWindow((x, y) => { frames.current.stage = { x, y }; }); }, []);
  const geometry = useCallback(() => {
    const { stage: origin, feed: frame, trash: can } = frames.current;
    if (!frame) return {};
    const target = can && origin ? { x: can.x - origin.x, y: can.y - origin.y } : { x: frame.x + frame.width - 40, y: frame.y + frame.height - 20 };
    return { frame, target };
  }, []);
  const arrived = useCallback(() => {
    trash.current?.bounce();
  }, []);
  const { flight, layer, flying } = useDiscardFlights({ geometry, reduced, onArrive: arrived });
  useEffect(() => {
    if (!undoAt) return;
    setUndoVisible(true);
    const timer = setTimeout(() => setUndoVisible(false), 4500);
    return () => clearTimeout(timer);
  }, [undoAt]);
  const apply = (action: ExploreAction) => {
    setTransitionError(undefined);
    if (feed.current) feed.current.action(action);
    else void change(action).catch(() => {});
  };
  const restore = (target: string) => { guidance.complete("restore"); apply({ type: "restore", id: target }); };
  const undo = () => {
    setTransitionError(undefined);
    if (feed.current) void feed.current.undo().then(restored => { if (restored) setUndoVisible(false); });
    else void change({ type: "undo" }).then(() => setUndoVisible(false)).catch(() => {});
  };
  const openTray = () => { guidance.complete("trash"); setUndoVisible(false); setTray(true); };
  const exit = () => router.canGoBack() ? router.back() : router.replace("/(tabs)/home");
  const counts = session ? exploreCounts(session) : { explored: 0, discarded: 0, unavailable: 0 };
  // What is still in the sequence, and what is waiting in the trash. The queue decision on
  // each photograph is the one source for both.
  const sequence = session ? exploreFeed(session) : [];
  const marked = session ? session.ids.filter(target => session.records[target]?.queued) : [];
  // Photographs still in the air are counted when they land, so the number arrives with them.
  const trashCount = Math.max(0, marked.length - flying);
  const empty = !!session && !complete && !sequence.length;
  const originalPlace = photo && session ? session.ids.indexOf(photo) : -1;
  const railQueued = new Set(marked);
  const finish = useCallback(() => {
    if (finishing.current || !session || session.finished) return;
    finishing.current = true;
    void change({ type: "finish" }).catch(() => { finishing.current = false; setTransitionError("Couldn’t finish this adventure. Please try again."); });
  }, [change, session]);
  useEffect(() => {
    if (session?.finished) finishing.current = false;
    if (empty && session?.ids.length && !busy && !pending && flying === 0) finish();
  }, [session?.finished, empty, busy, pending, flying, finish, session?.ids.length]);
  useEffect(() => { if (originalPlace >= 0) rail.current?.setPosition(originalPlace); }, [originalPlace]);
  return <AdventureTheme enabled={!complete}><SafeAreaView className="flex-1 bg-background">
    <StatusBar style={complete ? "auto" : "light"} /><Stack.Screen options={{ title: adventure?.hint.title ?? "Photo review", headerShown: false }} />
    <View ref={stage} onLayout={measureStage} className="mx-auto w-full max-w-3xl flex-1">
      <View className="min-h-14 items-center justify-center px-14">
        <Pressable accessibilityRole="button" accessibilityLabel="Exit photo review" onPress={exit} className="absolute left-2 top-1 h-11 w-11 items-center justify-center"><Icon name="ChevronLeft" size={22} className="text-foreground" /></Pressable>
        {!complete && session && originalPlace >= 0 && <Text accessibilityLabel={`Photograph ${originalPlace + 1} of ${session.ids.length}`} className="text-h3 text-foreground">{originalPlace + 1} of {session.ids.length}</Text>}
        <Text numberOfLines={1} className="text-caption text-muted-foreground">{adventure?.hint.title ?? "Adventure"}</Text>
      </View>
      {!!(error || loadError || transitionError) && <Pressable accessibilityRole="button" accessibilityLabel="Retry loading saved review" onPress={() => void reload()} className="px-4 py-2"><Text accessibilityRole="alert" className="text-body text-foreground">{error || loadError || transitionError}</Text></Pressable>}
      {valid === false ? <View className="flex-1 justify-center gap-4 px-6"><Text className="text-h2 text-foreground">Choose a fresh photo adventure</Text><Text className="text-body text-muted-foreground">This older adventure is no longer available. Your previous progress and set-aside photos are preserved.</Text><Button onPress={() => router.replace("/(tabs)/explore")}>Explore adventures</Button></View> : !session || valid === undefined ? <Loading /> : complete ?
        <AdventureFinish adventure={adventure} photoIds={session.ids} explored={counts.explored} setAside={counts.discarded} unavailable={counts.unavailable} canUndo={!!session.history.length} pending={pending}
          onReview={() => router.push("/set-aside")} onUndo={() => { setSelected(undefined); void change({ type: "undo" }).catch(() => {}); }} onPrevious={() => { setSelected(undefined); void change({ type: "back" }).catch(() => {}); }} /> : <>
        <View className="min-h-0 flex-1" onLayout={event => { frames.current.feed = event.nativeEvent.layout; measureStage(); }}>
          {empty ? <View className="flex-1 items-center justify-center gap-3 px-8">
            <Icon name="Trash2" size={30} className="text-muted-foreground" />
            <Text accessibilityRole="header" className="text-center text-h3 text-foreground">Everything here is in the trash</Text>
            <Text className="text-center text-body text-muted-foreground">{plural(marked.length, "photograph")} marked for deletion, all still in your library. Your adventure is finishing.</Text>
            <Button secondary icon="Trash2" onPress={openTray}>Open the trash</Button>
          </View> : <ExploreFeed ref={feed} session={session} media={media} change={change} getSession={getSession} flight={flight}
            onPage={(index, total) => { if (index < total) setSelected(session.ids[index]); }} onEnd={finish} onScrollPosition={position => rail.current?.setPosition(position)} onScrollActive={id => setSelected(id)} onBusy={setBusy} onAvailability={setAvailable} onError={setTransitionError}
            onBrowse={() => guidance.complete("browse")} onDiscard={() => { guidance.complete("discard"); setUndoAt(Date.now()); }} />}
          {!empty && <ReviewProgressRail ref={rail} ids={session.ids} queued={railQueued} initialPosition={Math.max(0, originalPlace)} />}
          {undoVisible && !tray && (undoAt > 0 || !!session.history.length) && <View className="absolute bottom-3 left-3">
            <Pressable accessibilityRole="button" accessibilityLabel="Undo the last discard and bring that photograph back" onPress={undo} className="min-h-11 flex-row items-center gap-2 rounded-full bg-card/95 px-4 py-2">
              <Icon name="Undo2" size={17} className="text-foreground" /><Text className="text-caption text-foreground">Undo</Text>
            </Pressable>
          </View>}
        </View>
        <ReviewHint step={guidance.step} onNext={guidance.complete} onSkip={guidance.skip} />
        <View className="px-3 pb-3 pt-1">
          <ReviewActions media={current} disabled={busy} queued={queued} legacy={legacy} highlighted={guidance.step === "actions"} onRestore={() => photo && restore(photo)} onUsed={() => guidance.complete("actions")}
            trailing={<ReviewTrash ref={trash} count={trashCount} highlighted={guidance.step === "trash"} onMeasure={centre => { frames.current.trash = centre; }} onPress={openTray} />} />
        </View>
      </>}
      {layer}
    </View>
    <DiscardTray visible={tray && !complete} ids={marked} media={media} busy={busy} onRestore={restore} onClose={() => setTray(false)} />
  </SafeAreaView></AdventureTheme>;
}

