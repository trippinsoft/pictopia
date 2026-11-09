import { NavigationBack } from "./navigation-header";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from "react";
import { adventureLabel } from "@/lib/pictopia/catalog";
import { Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, Stack, useNavigation } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useReducedMotion } from "react-native-reanimated";
import { AdventureTheme } from "./adventure-theme";
import { AdventureFinish } from "./adventure-finish";
import { Button, Icon, Loading, Text } from "./ui";
import { ExploreFeed, type ExploreFeedHandle } from "./explore-feed";
import { usePhotoEncounter } from "./use-photo-encounter";
import { useExplore } from "./use-explore";
import { ReviewActions } from "./review-actions";
import { ReviewHint, useReviewGuidance } from "./review-hint";
import { ReviewTrash, type ReviewTrashHandle } from "./review-trash";
import { DiscardTray } from "./discard-tray";
import { useDiscardFlights } from "./discard-flight";
import { useAllowance } from "./use-allowance";
import { exploreCounts, exploreFeed, lastExploreDiscard, type ExploreAction } from "@/lib/pictopia/explore";
import { limitCopy, monthYear, reviewProgressLabel } from "@/lib/pictopia/review-flow";
import { explorationPercent } from "@/lib/pictopia/library-progress";
import { displayMediaSize } from "@/lib/pictopia/storage-size";
import { plural } from "@/lib/pictopia/text";
import { mediaService } from "@/services/media";
import { repository, serialize, storage } from "@/services/repository";
import type { Adventure } from "@/lib/pictopia/adventures";
import type { Media } from "@/lib/pictopia/types";
import { adventureSessionKey, adventureStore } from "@/services/adventures";

/** The shared review for adventures and collections: one feed, one trash, one Undo. ✕ (or
 * Android Back) flushes the visible slot and returns; passing the final boundary completes a segment. */
export interface FinishActions {
  onUndo(): void; onPreviousPhoto(): void; onReview(): void; onDone(): void;
  onBackToPhotos(): void; onDeleteNow(): void;
  canUndo: boolean; canReview: boolean; pending: boolean;
  explored: number; marked: number; unavailable: number; libraryBefore?: number;
  photoIds: string[]; discarded: Media[];
}
export function AdventureReview({ id, collection, finishContent, onContinue: _onContinue }: {
  id: string;
  /** Collections: their session, title and, for the header, explored progress when opened. */
  collection?: { sessionKey: string; title: string; progress?: { explored: number; total: number } };
  finishContent?: (actions: FinishActions) => ReactNode;
  /** Collections keep going past a batch: the end card offers the next photos. */
  onContinue?: () => void;
}) {
  const sessionKey = collection?.sessionKey ?? adventureSessionKey(id);
  const { app, session, media, pending, error, change, getSession, reload } = useExplore(sessionKey);
  const [adventure, setAdventure] = useState<Adventure>(), [valid, setValid] = useState<boolean>(), [loadError, setLoadError] = useState<string>();
  const [metadataRetry, setMetadataRetry] = useState(0);
  const [selected, setSelected] = useState<string>(), [busy, setBusy] = useState(false), [available, setAvailable] = useState(false), [tray, setTray] = useState(false), [transitionError, setTransitionError] = useState<string>();
  // The pager is on the end card (or the daily-limit page): past the last photograph, which
  // is never a saved place. Photo controls and the date hide there.
  const [atEnd, setAtEnd] = useState(false);
  const finishing = useRef(false);
  const feed = useRef<ExploreFeedHandle>(null), stage = useRef<View>(null), trash = useRef<ReviewTrashHandle>(null), line = useRef<ProgressLineHandle>(null);
  const reduced = useReducedMotion();
  const navigation = useNavigation();
  const photo = selected ?? session?.activeId ?? undefined;
  const current = photo ? media[photo] : undefined;
  const queued = !!(photo && session?.records[photo]?.queued), legacy = !!(photo && session?.records[photo]?.discarded && !queued);
  const complete = !!session?.finished;
  const canUndo = !!session && !!lastExploreDiscard(session);
  const guidance = useReviewGuidance(app.ready && !!session && !complete);
  const title = (adventure ? adventureLabel(adventure) : undefined) ?? collection?.title ?? "Adventure";
  useEffect(() => {
    if (collection) { setValid(true); return; }
    let alive = true;
    void Promise.all([adventureStore.get(id), adventureStore.validPhotoOffer(id, app.pro)]).then(([value, valid]) => { if (alive) { setAdventure(value); setValid(valid); } }).catch(() => { if (alive) setLoadError("This adventure couldn’t be loaded. Return to Explore and try again."); });
    return () => { alive = false; };
  }, [id, collection?.sessionKey, app.pro, metadataRetry]);
  // What this visit started from, so leaving can say what it added.
  const opened = useRef<{ encountered: Set<string>; queued: Set<string>; finished: boolean }>(undefined);
  if (session && !opened.current) opened.current = {
    encountered: new Set(session.ids.filter(target => session.records[target]?.encountered)),
    queued: new Set(session.ids.filter(target => session.records[target]?.queued)),
    finished: !!session.finished,
  };
  // Reopening a finished review shows its photos again from the top, discarded ones faded,
  // so marks can be changed; reaching the end shows completion again.
  const revisited = useRef(false);
  const [reopening, setReopening] = useState(false);
  useEffect(() => {
    if (revisited.current || !session || valid !== true || !opened.current?.finished || !session.finished) return;
    revisited.current = true;
    setReopening(true);
    void change({ type: "revisit" }).catch(() => {}).finally(() => setReopening(false));
  }, [session, valid, change]);
  const awaitingReopen = reopening || (valid === true && !!opened.current?.finished && !revisited.current);
  const libraryBefore = useRef<number>(undefined);
  useEffect(() => {
    if (!app.libraryReliable) return;
    void serialize(() => storage.progress()).then(p => { if (libraryBefore.current === undefined) libraryBefore.current = explorationPercent(p.accessibleExplored, p.accessible); }).catch(() => {});
  }, [app.libraryReliable]);
  useEffect(() => navigation.addListener("beforeRemove", () => { feed.current?.flush(); }), [navigation]);
  // The photograph's frame and the trash's centre, both in this screen's own coordinates, so
  // a discarded photograph can fly from exactly where it sits to exactly where the can is.
  const frames = useRef<{ stage?: { x: number; y: number }; feed?: { x: number; y: number; width: number; height: number }; trash?: { x: number; y: number } }>({});
  const measureStage = useCallback(() => { stage.current?.measureInWindow((x, y) => { frames.current.stage = { x, y }; }); }, []);
  const geometry = useCallback(() => {
    const { stage: origin, feed: frame, trash: can } = frames.current;
    if (!frame) return {};
    const target = can && origin ? { x: can.x - origin.x, y: can.y - origin.y } : { x: frame.x + frame.width - 40, y: frame.y + 20 };
    return { frame, target };
  }, []);
  const arrived = useCallback(() => {
    trash.current?.bounce();
  }, []);
  const { flight, layer, flying, flyingIds } = useDiscardFlights({ geometry, reduced, onArrive: arrived });
  const apply = (action: ExploreAction) => {
    setTransitionError(undefined);
    if (feed.current) feed.current.action(action);
    else void change(action).catch(() => {});
  };
  // Restore plays a reverse flight: a miniature flies back out of the trash into the slot, and
  // the real card is revealed the moment it lands, so the photograph returns the way it left.
  // Reduced motion, a missing frame, or an already-returning photo falls straight through to
  // the instant restore.
  const restore = (target: string) => {
    const item = media[target];
    if (item) {
      flight.reclaim({ id: target, media: item }).landed.then(() => apply({ type: "restore", id: target }));
    } else {
      apply({ type: "restore", id: target });
    }
  };
  const undo = () => {
    if (!canUndo) return;
    setTransitionError(undefined);
    if (feed.current) void feed.current.undo();
    else void change({ type: "undo" }).catch(() => {});
  };
  const exit = () => { feed.current?.flush(); router.canGoBack() ? router.back() : router.replace("/(tabs)/home"); };
  const counts = session ? exploreCounts(session) : { explored: 0, discarded: 0, unavailable: 0 };
  // What is still in the sequence, and what is waiting in the trash. The queue decision on
  // each photograph is the one source for both.
  const sequence = session ? exploreFeed(session) : [];
  const marked = session ? session.ids.filter(target => session.records[target]?.queued) : [];
  const discardedMedia = marked.flatMap(target => media[target] ? [media[target]] : []);
  // Photographs still in the air are counted when they land, so the number arrives with them.
  const landedIds = marked.filter(target => !flyingIds.has(target));
  const trashCount = landedIds.length;
  const [resolvedSizes, setResolvedSizes] = useState<Record<string, number>>({});
  const sizeAttempts = useRef(new Set<string>());
  // Read local size metadata only; never download or hash originals for this counter.
  const markedKey = marked.join("\n");
  // Gated on `flying === 0`: any native PhotoKit size request and its React state write
  // would otherwise fight the discard flight for the JS thread, causing a visible hesitation
  // on the exact action the user performs most. We also kick off work only when the browser
  // tab is idle (no requestIdleCallback on native, so a 0 ms setTimeout is used there).
  useEffect(() => {
    if (flying > 0) return;
    let alive = true;
    const run = () => { void (async () => {
      for (const target of markedKey.split("\n").filter(Boolean)) {
        if (!alive) break;
        const item = media[target];
        if (!item || item.size !== undefined || item.scan?.size !== undefined) continue;
        const key = `${target}:${item.modified}`;
        if (sizeAttempts.current.has(key)) continue;
        try {
          const result = { size: await mediaService.size(item) };
          if (!alive) break;
          sizeAttempts.current.add(key);
          if (result.size !== undefined && Number.isFinite(result.size) && result.size >= 0) {
            const size = result.size;
            setResolvedSizes(previous => ({ ...previous, [target]: size }));
            await repository.update(target, latest => latest.modified === item.modified ? { ...latest, size } : latest);
          }
        } catch { if (alive) sizeAttempts.current.add(key); }
      }
    })(); };
    const handle = setTimeout(run, 0);
    return () => { alive = false; clearTimeout(handle); };
  }, [markedKey, media, flying]);
  // Measured where the platform reports it, estimated otherwise: the trash always shows a size.
  let trashBytes = 0;
  for (const target of landedIds) {
    const item = media[target];
    trashBytes += item ? displayMediaSize(item, resolvedSizes[target]) : resolvedSizes[target] ?? 0;
  }
  const empty = !!session && !complete && !session.ids.length;
  const allowance = useAllowance(session, sequence, valid && !complete ? photo : undefined, app.pro, available);
  const encounter = useCallback((displayedAt: number) => photo ? change({ type: "seen", id: photo, displayedAt }) : Promise.resolve(), [photo, change]);
  usePhotoEncounter(photo, !!photo && allowance.canReview(photo) && available && valid === true && !!session?.review && photo === session.activeId && !!current?.active && !current.deletedAt && !session.records[photo]?.encountered && !complete && !busy && !tray, undefined, encounter, app.setError);

  // From the review or its end: just this adventure's discards, everything else one tap away.
  const reviewMarked = () => router.push({ pathname: "/queue", params: { session: sessionKey, from: "review", only: "1" } });
  const deleteNow = () => router.push({ pathname: "/queue", params: { session: sessionKey, from: "review", only: "1", auto: "1" } });
  const backToPhotos = () => { setSelected(undefined); setAtEnd(false); void change({ type: "revisit", toId: session?.ids.at(-1) }).catch(() => {}); };
  const limit = limitCopy(allowance.limit ?? 150);
  // The daily limit pauses the review where it is. It is never a finish.
  const limitPage = <View className="flex-1 items-center justify-center gap-3 px-8">
    <View className="h-16 w-16 items-center justify-center rounded-full bg-sun"><Icon name="Sparkles" size={28} className="text-primary-foreground" /></View>
    <Text accessibilityRole="header" className="text-center text-display text-foreground">{limit.title}</Text>
    <Text className="mb-2 text-center text-body leading-6 text-muted-foreground">{limit.body}</Text>
    <View className="w-full max-w-xs gap-2">
      <Button onPress={() => router.push("/paywall")}>Unlock unlimited with Pictopia+</Button>
      {marked.length > 0 && <Button secondary icon="Trash2" onPress={reviewMarked}>{"See discarded photos"}</Button>}
      <Pressable accessibilityRole="button" onPress={exit} className="min-h-12 items-center justify-center"><Text className="text-button text-foreground">Continue tomorrow</Text></Pressable>
    </View>
  </View>;
  const finishState = useRef({ session, change }); finishState.current = { session, change };
  const finish = useCallback(() => {
    const snapshot = finishState.current.session;
    if (finishing.current || !snapshot || snapshot.finished || !feed.current?.isAtEnd()) return;
    const endpoint = snapshot.ids.at(-1);
    if (!endpoint) return;
    finishing.current = true; setTransitionError(undefined);
    void finishState.current.change(saved => feed.current && !feed.current.isAtEnd()
      ? { type: "page", id: saved.activeId, revision: saved.revision, toId: saved.activeId, availableIds: [] }
      : { type: "finish", boundary: { startedAt: snapshot.startedAt, endpoint } })
      .catch(() => setTransitionError("Couldn’t save this review. Try again or finish for now."))
      .finally(() => { finishing.current = false; });
  }, []);
  // Keep the feed mounted for the final flight, including when every item is marked.
  // Reopening an all-marked review reaches the same completion destination.
  useEffect(() => {
    if (valid === true && session?.ids.length && !complete && !sequence.length && !busy && flying === 0) finish();
  }, [valid, session?.ids.length, complete, sequence.length, busy, flying, finish]);
  const endPage = <View className="flex-1 items-center justify-center px-8">
    {transitionError ? <View className="w-full max-w-xs gap-3">
      <Text className="text-center text-body text-foreground">{transitionError}</Text>
      <Button onPress={finish}>Try again</Button>
      <Button secondary onPress={exit}>Finish for Now</Button>
    </View> : <Loading />}
  </View>;
  const originalPlace = photo && session ? session.ids.indexOf(photo) : -1;
  useEffect(() => {
    if (atEnd && !allowance.stopBefore && session) line.current?.setPosition(session.ids.length - 1);
    else if (originalPlace >= 0) line.current?.setPosition(originalPlace);
  }, [originalPlace, atEnd, allowance.stopBefore, session?.ids.length]);
  const contextProgress = reviewProgressLabel(atEnd ? (session?.ids.length ?? 1) - 1 : originalPlace, session?.ids.length ?? 0);
  const label = current ? monthYear(current.created) : undefined;
  if (!session || valid === undefined || (!collection && !adventure) || (complete && awaitingReopen)) return <AdventureTheme enabled><SafeAreaView className="flex-1 bg-background">
    <Stack.Screen options={{ title: "Photo review", headerShown: false }} />
    <View className="px-4"><NavigationBack onPress={exit} /></View>
    <View className="flex-1 justify-center gap-4 px-6">{loadError || error ? <><Text className="text-center text-body text-foreground">{loadError || error}</Text><Button onPress={() => { setLoadError(undefined); setMetadataRetry(n => n + 1); void reload(); }}>Try again</Button></> : <Loading />}</View>
  </SafeAreaView></AdventureTheme>;
  if (complete && session && !awaitingReopen) {
    return <>
      <Stack.Screen options={{ title, headerShown: false }} />
      {finishContent?.({ onUndo: () => { setSelected(undefined); undo(); }, onPreviousPhoto: () => { setSelected(undefined); apply({ type: "back" }); }, onReview: reviewMarked, onDone: exit, onBackToPhotos: backToPhotos, onDeleteNow: deleteNow, canUndo, canReview: sequence.length > 0, pending, explored: counts.explored, marked: marked.length, unavailable: counts.unavailable, libraryBefore: opened.current?.finished ? undefined : libraryBefore.current, photoIds: session.ids, discarded: discardedMedia }) ??
        <AdventureFinish onContinueSegment={next => { setSelected(undefined); setAtEnd(false); opened.current = undefined; void reload().then(() => setAdventure(next)); }} adventure={adventure} photoIds={session.ids} explored={counts.explored} marked={marked.length} unavailable={counts.unavailable} libraryBefore={opened.current?.finished ? undefined : libraryBefore.current} canUndo={canUndo} pending={pending}
          discarded={discardedMedia} onBackToPhotos={backToPhotos} onDeleteNow={deleteNow}
          onReview={reviewMarked} onDone={exit} onUndo={() => { setSelected(undefined); void change({ type: "undo" }).catch(() => {}); }} onPrevious={() => { setSelected(undefined); void change({ type: "back" }).catch(() => {}); }} />}
    </>;
  }
  return <AdventureTheme enabled><SafeAreaView className="flex-1 bg-background">
    <StatusBar style="light" /><Stack.Screen options={{ title, headerShown: false }} />
    <View ref={stage} onLayout={measureStage} className="mx-auto w-full max-w-3xl flex-1">
      <View className="gap-2 px-4 pb-2 pt-1">
        <View className="flex-row items-center justify-between pb-6">
          <NavigationBack label="Back" onPress={exit} />
          <View className="min-w-0 flex-1 items-center px-2">
            <Text numberOfLines={collection && id.startsWith("album:") ? undefined : 1} accessibilityRole="header" className="text-center text-headline text-foreground">{title}</Text>
            <Text className="text-caption text-muted-foreground" style={{ fontVariant: ["tabular-nums"] }}>{contextProgress}</Text>
          </View>
          {valid && session ? <ReviewTrash ref={trash} count={trashCount} bytes={trashBytes} unknownSizes={0} onMeasure={centre => { frames.current.trash = centre; }} onPress={() => setTray(true)} /> : <View className="h-12 w-12" />}
        </View>
        {session && <ProgressLine ref={line} total={session.ids.length} initial={Math.max(0, originalPlace)} />}
        {/* On This Day states its window, including when it widened beyond today's date. */}
        {adventure?.kind === "day" && <Text numberOfLines={1} className="text-center text-caption text-muted-foreground">{adventure.hint.detail}</Text>}
      </View>
      {valid === false ? <View className="flex-1 justify-center gap-4 px-6"><Text className="text-display text-foreground">Choose a fresh adventure</Text><Text className="text-body text-muted-foreground">This older adventure is no longer available. Your previous progress and marked photos are kept.</Text><Button onPress={() => router.replace("/(tabs)/explore")}>Explore adventures</Button></View> : !session || valid === undefined ? <Loading /> : <>
        <View className="min-h-0 flex-1" onLayout={event => { frames.current.feed = event.nativeEvent.layout; measureStage(); }}>
          {empty ? <View className="flex-1 items-center justify-center gap-3 px-8">
            <View className="h-16 w-16 items-center justify-center rounded-full bg-card"><Icon name="Trash2" size={28} className="text-foreground" /></View>
            <Text accessibilityRole="header" className="text-center text-display text-foreground">Everything here is discarded</Text>
            <Text className="mb-2 text-center text-body text-muted-foreground">{`${plural(marked.length, "item")} discarded, all still in your library. Undo or open Discarded to bring any back.`}</Text>
            <View className="w-full max-w-xs gap-2">
              <Button disabled={pending || busy || flying > 0} onPress={finish}>Finish</Button>
              <Button secondary icon="Trash2" onPress={() => setTray(true)}>Open Discarded</Button>
            </View>
          </View> : allowance.error ? <View className="flex-1 items-center justify-center gap-4 px-8"><Text className="text-center text-body text-foreground">Couldn’t check your daily free reviews. Your saved review is safe.</Text><Button onPress={() => void allowance.reload()}>Try again</Button></View> : !allowance.ready ? <Loading /> : <ExploreFeed ref={feed} session={session} media={media} change={change} getSession={getSession} flight={flight} canReview={allowance.canReview} stopBefore={allowance.stopBefore} limitPage={limitPage} endPage={endPage} onEnd={finish}
            onPage={(index, total) => { setAtEnd(index >= total); if (index < total) setSelected(session.ids[index]); }} onScrollPosition={position => line.current?.setPosition(position)} onScrollActive={(target, ready) => { setSelected(target); setAvailable(ready); }} onBusy={setBusy} onAvailability={setAvailable} onError={setTransitionError} onRestore={restore}
            onBrowse={() => guidance.complete("browse")} onDiscard={() => guidance.complete("discard")} />}
          {!!label && !empty && !atEnd && <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" className="absolute right-3 top-2 rounded-[9px] bg-black/50 px-2.5 py-1"><Text className="text-caption text-white">{label}</Text></View>}
          {/* Over the photos, never above them: inserting it would resize every page mid-scroll. */}
          {!!(error || loadError || transitionError) && <Pressable accessibilityRole="button" accessibilityLabel="Retry loading saved review" onPress={() => { setTransitionError(undefined); void reload(); }} className="absolute left-4 right-4 top-12 rounded-2xl bg-card/95 px-4 py-2"><Text accessibilityRole="alert" className="text-body text-foreground">{error || loadError || transitionError}</Text></Pressable>}
          <ReviewHint step={guidance.step} onNext={guidance.complete} onSkip={guidance.skip} />
        </View>
        <View className="flex-row items-center justify-between px-4 pb-2 pt-2">
          <Pressable accessibilityRole="button" accessibilityLabel={canUndo ? "Undo the last discard and bring that photo back" : "Undo, nothing to undo yet"} accessibilityState={{ disabled: !canUndo || busy }} disabled={!canUndo || busy} onPress={undo}
            className={`h-12 flex-row items-center gap-2 rounded-full bg-card/90 px-4 active:opacity-70 ${canUndo ? "" : "opacity-45"}`}>
            <Icon name="Undo2" size={20} className="text-sun" />
            <Text className="text-button text-sun">Undo</Text>
          </Pressable>
          {!atEnd && !empty && <ReviewActions media={current} disabled={busy} queued={queued} legacy={legacy} highlighted={false} onRestore={() => photo && restore(photo)} onUsed={() => {}} />}
        </View>
      </>}
      {layer}
    </View>
    <DiscardTray visible={tray} ids={marked} media={media} busy={busy} onRestore={restore} onClose={() => setTray(false)} onReview={() => { setTray(false); reviewMarked(); }} />
  </SafeAreaView></AdventureTheme>;
}

interface ProgressLineHandle { setPosition(position: number): void }
/** The thin progress line under the header. It follows scrolling directly, without
 * re-rendering the review. */
const ProgressLine = forwardRef<ProgressLineHandle, { total: number; initial: number }>(function ProgressLine({ total, initial }, ref) {
  const [position, setPosition] = useState(initial);
  useImperativeHandle(ref, () => ({ setPosition: (p: number) => setPosition(Math.round(p)) }), []);
  const fraction = total ? Math.min(1, Math.max(0, (position + 1) / total)) : 0;
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" className="h-[3px] overflow-hidden rounded-full bg-white/20">
    <View className="h-full rounded-full bg-sun" style={{ width: `${fraction * 100}%` }} />
  </View>;
});
