import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Pressable,
  useWindowDimensions,
  AccessibilityInfo,
  StyleSheet,
  AppState,
  Platform,
} from "react-native";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import { Image as ExpoImage } from "expo-image";
import { mediaService } from "@/services/media";
import { SwipeGesture } from "@/components/pictopia/swipe-gesture";
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Page, Text, Icon, Button, Empty, Loading } from "@/components/pictopia/ui";
import { MediaImage } from "@/components/pictopia/media-image";
import { usePictopia } from "@/components/pictopia/provider";
import { useSessionTally } from "@/components/pictopia/use-session-tally";
import { storage } from "@/services/repository";
import { Media, Collection } from "@/lib/pictopia/types";
import {
  sessionTitle,
  remainingSeconds,
  milestone,
  countsAsReviewTime,
} from "@/lib/pictopia/sessions";
import { SCAN_VERSION, bytes } from "@/lib/pictopia/logic";
export default function Swipe() {
  const app = usePictopia();
  const params = useLocalSearchParams<{ collection?: string }>();
  const [item, setItem] = useState<Media>(),
    [loading, setLoading] = useState(false),
    [acting, setActing] = useState(false),
    [imageReady, setImageReady] = useState(false),
    [reduced, setReduced] = useState(false),
    [keeper, setKeeper] = useState<Media>(),
    [sessionSavings, setSessionSavings] = useState<number | undefined>();
  const { height } = useWindowDimensions();
  const x = useSharedValue(0),
    y = useSharedValue(0);
  const actionLock = useRef(false);
  const reverse = app.prefs.reverseSwipe;
  const tally = useSessionTally(app.session, app.revision);
  const current = app.session?.ids[app.session.position];
  const seconds = app.session ? remainingSeconds(app.session) : 300;
  const timed = !!app.session && (!!app.session.minutes || app.session.collection === "quick");
  const group = app.pro
    ? app.session?.groups?.find((g) => g.ids.includes(current ?? ""))
    : undefined;
  const validGroup =
    group &&
    item &&
    keeper?.active &&
    keeper.scan?.version === `${SCAN_VERSION}:${keeper.modified}` &&
    item?.scan?.version === `${SCAN_VERSION}:${item.modified}`;
  const clockRef = useRef({ add: app.addSessionTime, ready: false });
  clockRef.current = { add: app.addSessionTime, ready: imageReady && !loading && !!item?.active };
  useFocusEffect(
    useCallback(() => {
      if (!app.session || app.session.complete || !timed || remainingSeconds(app.session) === 0)
        return;
      const id = app.session.id;
      let last = Date.now();
      let active = AppState.currentState === "active";
      const tick = () => {
        const now = Date.now();
        const delta = now - last;
        last = now;
        const visible =
          Platform.OS !== "web" ||
          typeof document === "undefined" ||
          globalThis.document.visibilityState === "visible";
        if (countsAsReviewTime({ active, visible, ready: clockRef.current.ready, delta }))
          void clockRef.current.add(id, delta).catch((e) => app.setError(e.message));
      };
      const subscription = AppState.addEventListener("change", (state) => {
        active = state === "active";
        last = Date.now();
      });
      const onVisibility = () => {
        last = Date.now();
      };
      if (Platform.OS === "web" && typeof document !== "undefined")
        globalThis.document.addEventListener("visibilitychange", onVisibility);
      const timer = setInterval(tick, 1000);
      return () => {
        tick();
        clearInterval(timer);
        subscription.remove();
        if (Platform.OS === "web" && typeof document !== "undefined")
          globalThis.document.removeEventListener("visibilitychange", onVisibility);
      };
    }, [app.session?.id, app.session?.complete, timed, seconds === 0]),
  );
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
    const ids = app.session?.history.filter((h) => h.decision === "delete").map((h) => h.id) ?? [];
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
  }, [app.session?.id, app.session?.marked, app.revision]);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      const next = app.session?.ids[(app.session?.position ?? 0) + 1];
      if (next && !app.session?.complete)
        void storage
          .get(next)
          .then(async (m) => {
            if (
              !active ||
              !m?.active ||
              m.type !== "photo" ||
              m.width * m.height > 16000000 ||
              (m.size ?? 0) > 20000000
            )
              return;
            const source = await mediaService.resolve(m);
            if (active) await ExpoImage.prefetch(source.uri, "memory");
          })
          .catch(() => {
            /* Inaccessible adjacent media is handled when it becomes current. */
          });
      return () => {
        active = false;
      };
    }, [current, app.session?.id, app.session?.complete]),
  );
  async function runAction(action: () => Promise<void>) {
    if (actionLock.current) return;
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
  async function finish() {
    await runAction(app.finishSession);
  }
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
  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setItem(undefined);
    setImageReady(false);
    x.value = 0;
    y.value = 0;
    if (current)
      void storage
        .get(current)
        .then((m) => {
          if (mounted) setItem(m);
        })
        .catch((e) => {
          if (mounted) app.setError(e.message);
        })
        .finally(() => {
          if (mounted) setLoading(false);
        });
    else setLoading(false);
    return () => {
      mounted = false;
    };
  }, [current, app.revision]);
  async function decide(d: "keep" | "delete") {
    // The loaded item can lag the session for a frame; never decide on one not yet shown.
    if (actionLock.current || !item || !imageReady || item.id !== current) return;
    actionLock.current = true;
    setActing(true);
    try {
      await app.decide(d, item.id);
      if (app.prefs.haptics && !reduced)
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    } catch {
      /* The provider shows the save error; leave the item in place. */
    } finally {
      x.value = reduced ? 0 : withSpring(0);
      actionLock.current = false;
      setActing(false);
    }
  }
  function release(offset: number) {
    if (Math.abs(offset) < 85) {
      x.value = reduced ? 0 : withSpring(0);
      y.value = reduced ? 0 : withSpring(0);
      return;
    }
    const right = offset > 0;
    void decide(right !== app.prefs.reverseSwipe ? "keep" : "delete");
  }
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value },
      { translateY: y.value },
      { rotate: `${reduced ? 0 : x.value / 22}deg` },
    ],
  }));
  const keepStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0, (reverse ? -x.value : x.value) / 75)),
  }));
  const deleteStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0, (reverse ? x.value : -x.value) / 75)),
  }));
  return (
    <Page
      compactHeader
      title={app.session ? sessionTitle(app.session.collection) : "One memory at a time"}
      subtitle="Keep what matters. Set the rest aside."
    >
      {!app.ready || loading ? (
        <Loading />
      ) : !app.stats.total ? (
        <Empty
          title="Let’s meet your camera roll"
          description="Connect your photos to start. Every decision is saved, and nothing is deleted while you swipe."
          action={<Button onPress={() => router.push("/onboarding")}>Connect your photos</Button>}
        />
      ) : !app.session ? (
        <Empty
          title="Ready for a little reset?"
          description="Start with a small batch of unreviewed memories. You can stop and pick up where you left off."
          action={<Button onPress={() => void app.start("quick")}>Start a 5-minute clean</Button>}
        />
      ) : app.session.complete ? (
        <View className="mx-auto w-full max-w-lg gap-4">
          <Empty
            icon={app.session.ids.length ? "CircleCheck" : "Images"}
            title={
              app.session.reviewed
                ? "That’s progress worth keeping."
                : app.session.collection === "best"
                  ? "Find your bunch first"
                  : "You’re all caught up."
            }
            description={
              app.session.reviewed
                ? "Your choices are saved. Nothing has been deleted. Every small session adds up."
                : app.session.collection === "best"
                  ? app.pro && app.scan.status === "complete"
                    ? "No unreviewed matching shots in your current scan. Try Quick Wins for a different kind of reset."
                    : "This session uses duplicate and similar-photo groups from Smart Clean. Run a Pro scan to find your matches, or try a free Quick Wins session."
                  : "No unreviewed items in this collection. Try another session or add more photos."
            }
          />
          {!!tally?.reviewed && (
            <View className="rounded-3xl bg-accent p-6">
              <Text accessibilityLiveRegion="polite" className="mb-4 text-h3 text-primary">
                {tally.reviewed} {tally.reviewed === 1 ? "memory" : "memories"} reviewed
              </Text>
              <View className="flex-row gap-5">
                <View className="flex-1">
                  <Text className="text-h2 text-foreground">{tally.kept}</Text>
                  <Text className="text-body text-muted-foreground">Kept</Text>
                </View>
                <View className="flex-1">
                  <Text className="text-h2 text-foreground">{tally.setAside}</Text>
                  <Text className="text-body text-muted-foreground">Set aside</Text>
                </View>
              </View>
              {sessionSavings !== undefined && (
                <Text className="mt-4 text-body text-primary">
                  {bytes(sessionSavings)} potentially recoverable, estimated
                </Text>
              )}
            </View>
          )}
          {!!tally?.setAside && (
            <Button onPress={() => router.push("/queue")}>Review set-aside items</Button>
          )}
          {app.session.collection === "best" && !app.session.ids.length && (
            <Button secondary onPress={() => router.push("/(tabs)/smart")}>
              Find similar shots
            </Button>
          )}
          <Button onPress={() => router.push("/(tabs)/home")}>
            {app.session.reviewed ? "Done for now" : "Choose another session"}
          </Button>
          {!!app.session.history.length && (
            <Button secondary onPress={() => void runAction(app.undo)}>
              Undo last decision
            </Button>
          )}
          <Text className="text-body text-center leading-6 text-muted-foreground">
            Any unreviewed photos stay ready for your next session.
          </Text>
        </View>
      ) : (
        <View className="mx-auto w-full max-w-xl">
          <View className="mb-4 flex-row items-center justify-between">
            <Text className="text-body text-muted-foreground">
              {app.session.position + 1} of {app.session.ids.length} in this batch
            </Text>
            {timed && (
              <View className="flex-row items-center gap-2">
                <Icon name="Timer" size={16} className="text-primary" />
                <Text className="text-h6 text-primary">
                  {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
                </Text>
              </View>
            )}
          </View>
          <View
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: app.session.ids.length, now: app.session.position }}
            className="mb-5 h-1.5 overflow-hidden rounded-full bg-border"
          >
            <View
              className="h-full rounded-full bg-primary"
              style={{
                width: `${(app.session.position / Math.max(1, app.session.ids.length)) * 100}%`,
              }}
            />
          </View>
          {timed && seconds === 0 && (
            <View className="mb-4 rounded-2xl bg-accent p-4">
              <Text className="mb-3 text-body text-primary">
                Time well spent. Finish here, or keep going at your own pace.
              </Text>
              <Button onPress={() => void finish()} disabled={acting}>
                Finish session
              </Button>
            </View>
          )}
          {validGroup && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Preview suggested keeper"
              onPress={() => router.push({ pathname: "/preview", params: { id: keeper.id } })}
              className="mb-4 flex-row items-center gap-3 rounded-2xl bg-accent p-3"
            >
              <MediaImage media={keeper} style={styles.keeper} />
              <View className="flex-1">
                <Text className="text-h6 text-primary">
                  {current === keeper.id ? "Suggested keeper" : "Compare with the suggested keeper"}
                </Text>
                <Text className="mt-1 text-caption text-muted-foreground">
                  {group.kind === "exact" ? "Identical original files" : "Similar shots"}. The
                  choice is yours.
                </Text>
              </View>
              <Icon name="ChevronRight" size={18} className="text-primary" />
            </Pressable>
          )}
          {item ? (
            <SwipeGesture x={x} y={y} enabled={!!item && !acting && imageReady} onRelease={release}>
              <Animated.View collapsable={false} style={[animatedStyle, styles.card]}>
                <Pressable
                  accessibilityLabel="Open full-screen media preview"
                  onPress={() => router.push({ pathname: "/preview", params: { id: item.id } })}
                >
                  <MediaImage
                    key={item.id}
                    onReady={() => setImageReady(true)}
                    media={item}
                    fit="contain"
                    style={[
                      styles.media,
                      { height: Math.min(height * (validGroup ? 0.39 : 0.49), 500) },
                    ]}
                  />
                  <Animated.View
                    style={[keepStyle, styles.keepLabel]}
                    pointerEvents="none"
                    className="absolute left-5 top-5 rounded-2xl border-2 border-primary bg-card px-5 py-3"
                  >
                    <Text className="text-h2 text-primary">Keep</Text>
                  </Animated.View>
                  <Animated.View
                    style={[deleteStyle, styles.deleteLabel]}
                    pointerEvents="none"
                    className="absolute right-5 top-5 rounded-2xl border-2 border-destructive bg-card px-5 py-3"
                  >
                    <Text className="text-h2 text-destructive">Set aside</Text>
                  </Animated.View>
                  {item.type === "video" && (
                    <View className="absolute bottom-4 right-4 flex-row items-center gap-2 rounded-full bg-card px-4 py-2">
                      <Icon name="Play" size={16} className="text-foreground" />
                      <Text className="text-caption text-foreground">Play video</Text>
                    </View>
                  )}
                </Pressable>
              </Animated.View>
            </SwipeGesture>
          ) : (
            <Empty
              icon="CloudOff"
              title="This item is unavailable"
              description="It may have moved or photo access may have changed. Skip it to continue."
            />
          )}
          <View className="my-4 flex-row items-center justify-between">
            <Text className="text-caption text-muted-foreground">
              {item
                ? new Date(item.created).toLocaleDateString(undefined, {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })
                : "Unavailable"}
              {item?.size ? ` • ${bytes(item.size)}` : ""}
            </Text>
            <Text className="text-caption text-muted-foreground">
              {item?.type === "video" ? "Video" : "Photo"}
            </Text>
          </View>
          <View className="flex-row items-center gap-4">
            <View className="flex-1">
              <Button
                danger
                disabled={acting || !item || !imageReady}
                icon="X"
                onPress={() => void decide("delete")}
              >
                Set aside
              </Button>
            </View>
            <View className="flex-1">
              <Button
                disabled={acting || !item || !imageReady}
                icon="Check"
                onPress={() => void decide("keep")}
              >
                Keep
              </Button>
            </View>
          </View>
          <View className="mt-3 flex-row justify-center gap-8">
            <Pressable
              accessibilityLabel="Undo last decision"
              disabled={acting || !app.session.history.length}
              onPress={() => void runAction(app.undo)}
              className="flex-row items-center gap-2 p-4"
            >
              <Icon name="Undo2" size={18} className="text-muted-foreground" />
              <Text className="text-body text-muted-foreground">Undo</Text>
            </Pressable>
            <Pressable
              disabled={acting}
              onPress={() => void runAction(() => app.skip(current))}
              className="flex-row items-center gap-2 p-4"
            >
              <Text className="text-body text-muted-foreground">Skip</Text>
              <Icon name="SkipForward" size={18} className="text-muted-foreground" />
            </Pressable>
          </View>
          <Text className="text-body text-center text-muted-foreground">
            {tally?.kept ?? 0} kept • {tally?.setAside ?? 0} set aside
          </Text>
          <Text
            accessibilityLiveRegion="polite"
            className="mt-2 text-caption text-center text-primary"
          >
            {milestone(app.session.reviewed) ?? "Saved as you go. Originals stay untouched."}
          </Text>
          {(!timed || seconds > 0) && (
            <Pressable
              accessibilityRole="button"
              disabled={acting}
              onPress={() => void finish()}
              className="min-h-12 items-center justify-center p-3"
            >
              <Text className="text-h6 text-muted-foreground">Finish session</Text>
            </Pressable>
          )}
        </View>
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  media: { minHeight: 220 },
  keeper: { width: 48, height: 48, borderRadius: 10 },
  card: { overflow: "hidden", borderRadius: 28 },
  keepLabel: { position: "absolute", left: 20, top: 20 },
  deleteLabel: { position: "absolute", right: 20, top: 20 },
});
