import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Pressable,
  useWindowDimensions,
  AccessibilityInfo,
  StyleSheet,
  Platform,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Image as ExpoImage } from "expo-image";
import { useSharedValue } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Page, Text, Icon, Button, Empty, Loading } from "@/components/pictopia/ui";
import { MediaImage } from "@/components/pictopia/media-image";
import { SwipeCard, SwipeCardHandle } from "@/components/pictopia/swipe-card";
import { usePictopia } from "@/components/pictopia/provider";
import { useSessionTally } from "@/components/pictopia/use-session-tally";
import { useSwipeDeck } from "@/components/pictopia/use-swipe-deck";
import { useReviewClock } from "@/components/pictopia/use-review-clock";
import { storage } from "@/services/repository";
import { Media, Collection, Decision } from "@/lib/pictopia/types";
import { sessionTitle, remainingSeconds, milestone } from "@/lib/pictopia/sessions";
import { decisionDirection } from "@/lib/pictopia/swipe-physics";
import { plural } from "@/lib/pictopia/text";
import { SCAN_VERSION, bytes } from "@/lib/pictopia/logic";
export default function Swipe() {
  const app = usePictopia();
  const params = useLocalSearchParams<{ collection?: string }>();
  const [reduced, setReduced] = useState(false),
    [keeper, setKeeper] = useState<Media>(),
    [sessionSavings, setSessionSavings] = useState<number | undefined>(),
    [acting, setActing] = useState(false),
    [enter, setEnter] = useState<{ id: string; from: 1 | -1 }>(),
    [deckWidth, setDeckWidth] = useState(0);
  const { width: windowWidth } = useWindowDimensions();
  const width = deckWidth || Math.min(windowWidth - 40, 576);
  const drag = useSharedValue(0);
  const card = useRef<SwipeCardHandle>(null);
  const actionLock = useRef(false);
  const session = app.session;
  const reversed = app.prefs.reverseSwipe;
  const tally = useSessionTally(session, app.revision);
  const haptic = useCallback(
    (d: Decision) => {
      if (!app.prefs.haptics || Platform.OS === "web") return;
      void (
        d === "keep"
          ? Haptics.selectionAsync()
          : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      ).catch(() => {});
    },
    [app.prefs.haptics],
  );
  const onError = useCallback((message: string) => app.setError(message), [app.setError]);
  const deck = useSwipeDeck({
    session,
    revision: app.revision,
    decide: app.decide,
    onError,
    onCommitted: haptic,
  });
  const timed = !!session && (!!session.minutes || session.collection === "quick");
  const elapsedMs = useReviewClock({
    sessionId: session?.id,
    enabled: timed && !session?.complete && !!session && remainingSeconds(session) > 0,
    ready: deck.reviewing,
    persistedMs: session?.elapsedMs ?? 0,
    save: app.addSessionTime,
    onError,
  });
  const seconds = session ? remainingSeconds({ ...session, elapsedMs }) : 0;
  const item = deck.topRecord;
  const group = app.pro ? session?.groups?.find((g) => g.ids.includes(deck.top ?? "")) : undefined;
  const validGroup =
    group &&
    item &&
    keeper?.active &&
    keeper.scan?.version === `${SCAN_VERSION}:${keeper.modified}` &&
    item.scan?.version === `${SCAN_VERSION}:${item.modified}`;
  useEffect(() => {
    let mounted = true;
    setKeeper(undefined);
    if (group)
      void storage
        .get(group.best)
        .then((m) => {
          if (mounted) setKeeper(m);
        })
        .catch((e) => app.setError(e.message));
    return () => {
      mounted = false;
    };
  }, [group?.id, app.revision]);
  useEffect(() => {
    let mounted = true;
    const ids = session?.history.filter((h) => h.decision === "delete").map((h) => h.id) ?? [];
    void storage
      .query({ ids: Array.from(new Set(ids)), limit: 200, decision: "delete" })
      .then((rows) => {
        if (mounted)
          setSessionSavings(
            rows.length && rows.every((m) => m.size !== undefined)
              ? rows.reduce((n, m) => n + (m.size ?? 0), 0)
              : undefined,
          );
      })
      .catch((e) => app.setError(e.message));
    return () => {
      mounted = false;
    };
  }, [session?.id, session?.complete, app.revision]);
  // Warm the photo after the one waiting underneath so two swipes ahead are always ready.
  useEffect(() => {
    if (Platform.OS === "web" || !session || !deck.below) return;
    const after = session.ids[session.ids.indexOf(deck.below) + 1];
    if (!after) return;
    void storage
      .get(after)
      .then((m) => {
        if (m?.active && m.type === "photo") return ExpoImage.prefetch(m.uri, "memory");
      })
      .catch(() => {
        /* Prefetching is best-effort. */
      });
  }, [deck.below, session?.id]);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
    const s = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => s.remove();
  }, []);
  useEffect(() => {
    if (params.collection && app.ready) {
      void app.start(params.collection as Collection).catch((e) => app.setError(e.message));
    }
  }, [params.collection, app.ready]);
  async function runAction(action: () => Promise<void>) {
    if (actionLock.current || !deck.idle) return;
    actionLock.current = true;
    setActing(true);
    try {
      await action();
    } catch (e) {
      app.setError((e as Error).message);
    } finally {
      actionLock.current = false;
      setActing(false);
    }
  }
  function undo() {
    const last = session?.history.at(-1);
    void runAction(async () => {
      if (last) setEnter({ id: last.id, from: decisionDirection(last.decision, reversed) });
      await app.undo();
    });
  }
  function press(decision: Decision) {
    if (acting) return;
    if (deck.commit(decision)) card.current?.fling(decisionDirection(decision, reversed));
  }
  const onCommit = useCallback(
    (decision: Decision) => !actionLock.current && deck.commit(decision),
    [deck.commit],
  );
  const openSessionPhotos = (show: Decision) =>
    router.push({ pathname: "/session-review", params: { show } });
  const canDecide = deck.canDecide && !acting;
  const unavailable = !!deck.top && item === null;
  if (!app.ready)
    return (
      <Page compactHeader title="One memory at a time">
        <Loading />
      </Page>
    );
  if (!app.stats.total)
    return (
      <Page compactHeader title="One memory at a time">
        <Empty
          title="Let’s meet your camera roll"
          description="Connect your photos to start. Every decision is saved, and nothing is deleted while you swipe."
          action={<Button onPress={() => router.push("/onboarding")}>Connect your photos</Button>}
        />
      </Page>
    );
  if (!session)
    return (
      <Page compactHeader title="One memory at a time">
        <Empty
          title="Ready for a little reset?"
          description="Start with a small batch of unreviewed memories. You can stop and pick up where you left off."
          action={<Button onPress={() => void app.start("quick")}>Start a 5-minute clean</Button>}
        />
      </Page>
    );
  if (session.complete) {
    // The headline reflects that the user reviewed; the numbers reflect current decisions, so a
    // restored photo drops out of the counts without implying the batch was empty.
    const didReview = session.reviewed > 0;
    const reviewed = tally?.reviewed ?? 0;
    return (
      <Page compactHeader title={sessionTitle(session.collection)}>
        <View className="mx-auto w-full max-w-lg gap-4">
          <View className="items-center rounded-3xl border border-border bg-card px-6 py-9">
            <View className="mb-5 h-16 w-16 items-center justify-center rounded-full bg-primary">
              <Icon
                name={didReview ? "Check" : "Images"}
                size={30}
                className="text-primary-foreground"
              />
            </View>
            <Text accessibilityRole="header" className="text-h2 text-center text-foreground">
              {didReview
                ? "That’s progress worth keeping."
                : session.collection === "best"
                  ? "Find your bunch first"
                  : "You’re all caught up."}
            </Text>
            <Text className="mt-3 max-w-sm text-center text-body leading-6 text-muted-foreground">
              {didReview
                ? reviewed
                  ? `You reviewed ${plural(reviewed, "memory", "memories")}. Nothing has been deleted.`
                  : "Your choices are saved. Nothing has been deleted."
                : session.collection === "best"
                  ? app.pro && app.scan.status === "complete"
                    ? "No unreviewed matching shots in your current scan. Try Quick Wins for a different kind of reset."
                    : "This session uses duplicate and similar-photo groups from Smart Clean. Run a Pro scan to find your matches, or try a free Quick Wins session."
                  : "No unreviewed items in this collection. Try another session or add more photos."}
            </Text>
            {didReview && (
              <View className="mt-6 w-full flex-row gap-3">
                <StatTile
                  value={tally?.kept ?? 0}
                  label="Kept"
                  onPress={() => openSessionPhotos("keep")}
                />
                <StatTile
                  value={tally?.setAside ?? 0}
                  label="Set aside"
                  onPress={() => openSessionPhotos("delete")}
                />
              </View>
            )}
            {!!reviewed && sessionSavings !== undefined && (
              <Text className="mt-4 text-caption text-primary">
                About {bytes(sessionSavings)} could be freed, estimated
              </Text>
            )}
          </View>
          {!!tally?.setAside && (
            <Button icon="ArrowRight" onPress={() => router.push("/queue")}>
              {`Review ${plural(tally.setAside, "item")} set aside`}
            </Button>
          )}
          {session.collection === "best" && !session.ids.length && (
            <Button secondary onPress={() => router.push("/(tabs)/smart")}>
              Find similar shots
            </Button>
          )}
          <Button secondary={!!tally?.setAside} onPress={() => router.push("/(tabs)/home")}>
            {didReview ? "Done for now" : "Choose another session"}
          </Button>
          {!!session.history.length && (
            <Pressable
              accessibilityRole="button"
              disabled={acting}
              onPress={undo}
              className="min-h-12 flex-row items-center justify-center gap-2"
            >
              <Icon name="Undo2" size={17} className="text-muted-foreground" />
              <Text className="text-body text-muted-foreground">Undo last decision</Text>
            </Pressable>
          )}
        </View>
      </Page>
    );
  }
  return (
    <Page compactHeader scroll={false} title={sessionTitle(session.collection)}>
      <View className="mx-auto w-full max-w-xl flex-1">
        <View className="mb-3 flex-row items-center justify-between">
          <Text className="text-body text-muted-foreground">
            {Math.min(session.position + 1, session.ids.length)} of {session.ids.length}
          </Text>
          {timed && (
            <View
              accessibilityLabel={`${Math.ceil(seconds / 60)} minutes left`}
              className="flex-row items-center gap-1.5 rounded-full bg-accent px-3 py-1"
            >
              <Icon name="Timer" size={15} className="text-primary" />
              <Text className="text-h6 text-primary">
                {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
              </Text>
            </View>
          )}
        </View>
        <View
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: session.ids.length, now: session.position }}
          className="mb-4 h-1.5 overflow-hidden rounded-full bg-border"
        >
          <View
            className="h-full rounded-full bg-primary"
            style={{ width: `${(session.position / Math.max(1, session.ids.length)) * 100}%` }}
          />
        </View>
        {timed && seconds === 0 && (
          <View className="mb-3 flex-row items-center gap-3 rounded-2xl bg-accent p-3">
            <Text className="flex-1 text-body text-primary">
              Time well spent. Finish here, or keep going.
            </Text>
            <Button disabled={acting} onPress={() => void runAction(app.finishSession)}>
              Finish
            </Button>
          </View>
        )}
        {validGroup && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Preview suggested keeper"
            onPress={() => router.push({ pathname: "/preview", params: { id: keeper.id } })}
            className="mb-3 flex-row items-center gap-3 rounded-2xl bg-accent p-3"
          >
            <MediaImage media={keeper} style={styles.keeper} />
            <View className="flex-1">
              <Text className="text-h6 text-primary">
                {deck.top === keeper.id ? "Suggested keeper" : "Compare with the suggested keeper"}
              </Text>
              <Text className="mt-1 text-caption text-muted-foreground">
                {group.kind === "exact" ? "Identical original files" : "Similar shots"}. The choice
                is yours.
              </Text>
            </View>
            <Icon name="ChevronRight" size={18} className="text-primary" />
          </Pressable>
        )}
        <View style={styles.deck} onLayout={(e) => setDeckWidth(e.nativeEvent.layout.width)}>
          {deck.below && (
            <SwipeCard
              key={deck.below}
              media={deck.belowRecord}
              isTop={false}
              interactive={false}
              committing={false}
              width={width}
              reduced={reduced}
              reversed={reversed}
              drag={drag}
              onCommit={() => false}
              onAnimated={() => {}}
              onSettled={() => deck.settled(deck.below!)}
              onOpen={() => {}}
            />
          )}
          {deck.top && (
            <SwipeCard
              key={deck.top}
              ref={card}
              media={item}
              isTop
              interactive={canDecide}
              committing={deck.state.committing?.id === deck.top}
              width={width}
              reduced={reduced}
              reversed={reversed}
              drag={drag}
              enterFrom={enter?.id === deck.top ? enter.from : undefined}
              onCommit={onCommit}
              onAnimated={() => deck.animated(deck.top!)}
              onSettled={() => deck.settled(deck.top!)}
              onOpen={() => item && router.push({ pathname: "/preview", params: { id: item.id } })}
            />
          )}
        </View>
        <Text className="mt-3 text-caption text-center text-muted-foreground">
          {item
            ? `${new Date(item.created).toLocaleDateString(undefined, {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}${item.size ? ` • ${bytes(item.size)}` : ""}${item.type === "video" ? " • Video" : ""}`
            : unavailable
              ? "Keep and Set aside need a photo you can see."
              : " "}
        </Text>
        <View className="mt-3 flex-row items-center gap-3">
          <View className="flex-1">
            <Button
              large
              danger
              icon="X"
              disabled={unavailable}
              quiet={!canDecide}
              onPress={() => press("delete")}
            >
              Set aside
            </Button>
          </View>
          <View className="flex-1">
            <Button
              large
              icon="Check"
              disabled={unavailable}
              quiet={!canDecide}
              onPress={() => press("keep")}
            >
              Keep
            </Button>
          </View>
        </View>
        <View className="mt-1 flex-row items-center justify-between">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Undo last decision"
            disabled={acting || !deck.idle || !session.history.length}
            onPress={undo}
            className={`min-h-12 flex-row items-center gap-1.5 px-2 ${session.history.length ? "" : "opacity-40"}`}
          >
            <Icon name="Undo2" size={17} className="text-muted-foreground" />
            <Text className="text-body text-muted-foreground">Undo</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Photos from this session"
            onPress={() => openSessionPhotos(tally?.setAside ? "delete" : "keep")}
            disabled={!tally?.reviewed}
            className="min-h-12 items-center justify-center px-2"
          >
            <Text
              className={`text-body ${tally?.reviewed ? "text-primary" : "text-muted-foreground"}`}
            >
              {tally?.kept ?? 0} kept • {tally?.setAside ?? 0} set aside
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={acting || !deck.idle}
            onPress={() => void runAction(() => app.skip(deck.top))}
            className="min-h-12 flex-row items-center gap-1.5 px-2"
          >
            <Text className={`text-body ${unavailable ? "text-primary" : "text-muted-foreground"}`}>
              Skip
            </Text>
            <Icon
              name="SkipForward"
              size={17}
              className={unavailable ? "text-primary" : "text-muted-foreground"}
            />
          </Pressable>
        </View>
        <View className="flex-row items-center justify-between">
          <Text
            accessibilityLiveRegion="polite"
            className="flex-1 text-caption text-muted-foreground"
          >
            {milestone(session.reviewed) ?? "Saved as you go. Nothing is deleted yet."}
          </Text>
          {(!timed || seconds > 0) && (
            <Pressable
              accessibilityRole="button"
              disabled={acting || !deck.idle}
              onPress={() => void runAction(app.finishSession)}
              className="min-h-11 justify-center pl-3"
            >
              <Text className="text-h6 text-primary">Finish session</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Page>
  );
}
function StatTile({
  value,
  label,
  onPress,
}: {
  value: number;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}. Show these photos`}
      onPress={onPress}
      className="flex-1 rounded-2xl bg-accent p-4 active:opacity-75"
    >
      <Text className="text-h1 text-foreground">{value}</Text>
      <View className="mt-1 flex-row items-center justify-between">
        <Text className="text-body text-muted-foreground">{label}</Text>
        <Icon name="ChevronRight" size={16} className="text-primary" />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  keeper: { width: 48, height: 48, borderRadius: 10 },
  deck: { flex: 1, minHeight: 240 },
});
