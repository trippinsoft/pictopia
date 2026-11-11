import { NavigationBack } from "@/components/pictopia/navigation-header";
import { AdventureReview } from "@/components/pictopia/adventure-review";
import { adventureLabel } from "@/lib/pictopia/catalog";
import { useEffect, useRef, useState } from "react";
import { FlatList, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { Button, Icon, Loading, Text } from "@/components/pictopia/ui";
import { MediaImage } from "@/components/pictopia/media-image";
import { ExploreFeed, ExploreFeedHandle } from "@/components/pictopia/explore-feed";
import { useExplore } from "@/components/pictopia/use-explore";
import {
  ExploreAction,
  ExploreDiscard,
  exploreCounts,
  exploreFeed,
} from "@/lib/pictopia/explore";
import { plural } from "@/lib/pictopia/text";
import type { Adventure } from "@/lib/pictopia/adventures";
import { adventureSessionKey, adventureStore } from "@/services/adventures";
import { AdventureFinish } from "@/components/pictopia/adventure-finish";
import { AdventureTheme } from "@/components/pictopia/adventure-theme";
import { StatusBar } from "expo-status-bar";

/** The vertical explorer. With `?adventure=<id>` it explores that Adventure's frozen photos;
 * without, the original 200-photo prototype. Same feed and gestures either way. */
export default function VerticalExplore() {
  const { adventure } = useLocalSearchParams<{ adventure?: string }>();
  const [segment, setSegment] = useState(0);
  return typeof adventure === "string" ? <AdventureReview key={`${adventure}:${segment}`} id={adventure} onContinue={() => setSegment(value => value + 1)} /> : <PrototypeExplore />;
}
function PrototypeExplore() {
  const params = useLocalSearchParams<{ adventure?: string }>();
  const adventureId = typeof params.adventure === "string" ? params.adventure : undefined;
  const { app, session, media, pending, error, start, change, getSession } = useExplore(
    adventureId && adventureSessionKey(adventureId),
  );
  const [adventure, setAdventure] = useState<Adventure>();
  const [photoOfferValid, setPhotoOfferValid] = useState<boolean>();
  useEffect(() => {
    if (!adventureId) return;
    let alive = true;
    setPhotoOfferValid(undefined);
    void Promise.all([adventureStore.get(adventureId), adventureStore.validPhotoOffer(adventureId)])
      .then(([meta, valid]) => { if (alive) { setAdventure(meta); setPhotoOfferValid(valid); } })
      .catch(() => { if (alive) setPhotoOfferValid(false); });
    return () => {
      alive = false;
    };
  }, [adventureId, app.revision]);
  const [collection, setCollection] = useState(false),
    [preview, setPreview] = useState<string>();
  const [confirmation, setConfirmation] = useState<"restart" | "restoreAll">();
  const [available, setAvailable] = useState(false);
  const feed = useRef<ExploreFeedHandle>(null);
  // Feed saves run in the background; only a sideways discard in flight holds the controls.
  const [busy, setBusy] = useState(false);
  const [place, setPlace] = useState<{ index: number; total: number; first: boolean }>();
  // An undo made from the completion screen; the photo slides in once the feed is shown.
  const [entrance, setEntrance] = useState<ExploreDiscard>();
  const [transitionError, setTransitionError] = useState<string>();
  const counts = session
    ? exploreCounts(session)
    : { explored: 0, discarded: 0, untouched: 0, unavailable: 0 };
  const discardedIds = session?.ids.filter((id) => session.records[id]?.discarded) ?? [];
  function apply(action: ExploreAction) {
    setTransitionError(undefined);
    if (feed.current) feed.current.action(action);
    else void change(action).catch(() => {});
  }
  function undo() {
    setTransitionError(undefined);
    if (feed.current) return feed.current.undo();
    let entry: ExploreDiscard | undefined;
    void change((s) => {
      entry = s.history[s.history.length - 1];
      return { type: "undo", id: entry?.id };
    })
      .then((saved) => {
        if (entry && saved.activeId === entry.id) setEntrance(entry);
      })
      .catch(() => {});
  }
  function exit() {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/home");
  }
  const complete = !!session?.ids.length && session.activeId === null;
  const remaining = session ? exploreFeed(session) : [];
  // The photo's place in the whole adventure: discarding never shrinks the total.
  const total = session?.ids.length ?? 0;
  const shown = place ?? {
    index: session?.activeId ? session.ids.indexOf(session.activeId) : total,
    total,
    first: session?.activeId ? remaining.indexOf(session.activeId) <= 0 : !remaining.length,
  };
  const hasPhotos = !!session?.ids.length;
  const title = collection
    ? adventureId
      ? "Set aside"
      : "Discarded Photos"
    : adventureId
      ? ((adventure ? adventureLabel(adventure) : undefined) ?? "Adventure")
      : "Vertical Explore";
  // Adventures open straight into the photos; only the original prototype explains itself.
  const showIntro = !adventureId && !session?.instructionsDismissed;
  function dismissIntro() {
    apply({ type: "dismissInstructions" });
  }

  const dark = !!adventureId;
  return (
    <AdventureTheme enabled={dark}>
    <SafeAreaView className="flex-1 bg-background" edges={["top", "bottom", "left", "right"]}>
      {dark && <StatusBar style="light" />}
      <Stack.Screen
        options={{ title: adventureId ? "Adventure" : "Vertical Explore", headerShown: false }}
      />
      <View className="mx-auto w-full max-w-3xl flex-1 px-4">
        <View className="min-h-14 flex-row items-center justify-between gap-3">
          <NavigationBack label={collection ? "Back to exploration" : "Exit exploration"} onPress={() => (collection ? setCollection(false) : exit())} />
          <Text className="text-caption text-muted-foreground">
            {hasPhotos && !collection && !complete && shown.total > 0
              ? `${Math.min(shown.index, shown.total - 1) + 1} / ${shown.total}`
              : title}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={adventureId ? "Review set-aside photos" : "Review experimental discards"}
            disabled={busy}
            onPress={() => {
              setPlace(undefined);
              setCollection(true);
            }}
            className="min-h-12 flex-row items-center gap-1 px-2"
          >
            <Icon name="Images" size={18} className="text-muted-foreground" />
            <Text className="text-caption text-muted-foreground">{counts.discarded}</Text>
          </Pressable>
        </View>
        {!!(error || transitionError) && (
          <View accessibilityRole="alert" className="mb-3 rounded-xl bg-secondary p-3">
            <Text className="text-body text-foreground">{error || transitionError}</Text>
          </View>
        )}
        {adventureId && photoOfferValid === false ? (
          <View className="flex-1 justify-center gap-5">
            <Text className="text-h2 text-foreground">Choose a fresh photo adventure</Text>
            <Text className="text-body leading-6 text-muted-foreground">This older adventure is no longer available for photo-only exploration. Your previous progress and set-aside photos are preserved.</Text>
            <Button onPress={() => router.replace("/(tabs)/explore")}>Explore adventures</Button>
          </View>
        ) : !app.ready || (adventureId && (!session || photoOfferValid === undefined)) ? (
          <Loading />
        ) : collection ? (
          <>
            <Text className="mb-2 text-h2 text-foreground">{title}</Text>
            <Text className="mb-4 text-body text-muted-foreground">
              {adventureId
                ? "Marks in this adventure only. Every original stays in your library."
                : "Only this experiment’s local marks. Every original stays in your library."}
            </Text>
            {discardedIds.length > 0 ? (
              <>
                <View className="mb-4">
                  <Button
                    secondary
                    disabled={pending}
                    onPress={() => setConfirmation("restoreAll")}
                  >
                    {adventureId ? "Restore All" : "Restore All Discards"}
                  </Button>
                </View>
                <FlatList
                  data={discardedIds}
                  keyExtractor={(id) => id}
                  numColumns={2}
                  columnWrapperStyle={styles.columns}
                  renderItem={({ item: id }) => (
                    <View className="mb-3 flex-1 overflow-hidden rounded-2xl border border-border bg-card">
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="View discarded photo full-screen"
                        onPress={() => setPreview(id)}
                        className="aspect-square"
                      >
                        {media[id] ? (
                          <MediaImage media={media[id]} className="flex-1" />
                        ) : (
                          <View className="flex-1 items-center justify-center p-3">
                            <Text className="text-caption text-muted-foreground">
                              Photo unavailable
                            </Text>
                          </View>
                        )}
                      </Pressable>
                      <Button
                        secondary
                        disabled={pending}
                        onPress={() => apply({ type: "restore", id })}
                      >
                        Restore
                      </Button>
                    </View>
                  )}
                />
              </>
            ) : (
              <View className="flex-1 items-center justify-center">
                <Text className="text-h3 text-foreground">
                  {adventureId ? "Nothing set aside" : "No experimental discards"}
                </Text>
                <Text className="mt-3 text-body text-muted-foreground">
                  All your photographs remain untouched.
                </Text>
              </View>
            )}
            {hasPhotos && (
              <View className="py-3">
                <Button secondary disabled={pending} onPress={() => setConfirmation("restart")}>
                  {adventureId ? "Start over" : "Restart Test"}
                </Button>
              </View>
            )}
          </>
        ) : !hasPhotos ? (
          <ScrollView contentContainerStyle={styles.intro}>
            <Text className="text-caption text-primary">INTERNAL EXPERIMENT · FREE</Text>
            <Text className="mt-4 text-h1 text-foreground">Rediscover what matters.</Text>
            <Text className="mt-4 text-body text-muted-foreground">
              Explore up to 200 real still photographs, newest first. Swipe up to continue. Swipe
              either way sideways to set a photo aside.
            </Text>
            <Text className="mt-4 text-body text-muted-foreground">
              All discards are reversible. This experiment never deletes, copies, or uploads your
              photographs.
            </Text>
            {Platform.OS === "web" && (
              <Text className="mt-4 text-body text-muted-foreground">
                Browser testing uses files you select. Your iPhone photo library is available in the
                native app installed through Publishing.
              </Text>
            )}
            <Text className="mb-6 mt-4 text-caption text-muted-foreground">
              Videos are excluded. Live Photos display their still image. Photos already in the
              standard deletion queue are excluded.
            </Text>
            {session?.ids.length === 0 && (
              <Text className="mb-4 text-body text-foreground">
                No eligible accessible photos were found. Allow more photos or refresh your library,
                then try again.
              </Text>
            )}
            {app.busy && (
              <Text className="mb-4 text-caption text-muted-foreground">
                Preparing your library… {app.syncProgress}
              </Text>
            )}
            {!app.permission?.granted || (Platform.OS === "web" && !app.stats.photos) ? (
              <Button
                disabled={app.busy}
                onPress={() => {
                  void app.connect();
                }}
              >
                Choose Photos
              </Button>
            ) : (
              <Button disabled={pending || app.busy} onPress={() => void start()}>
                {pending ? "Preparing test…" : "Start Vertical Explore"}
              </Button>
            )}
          </ScrollView>
        ) : showIntro ? (
          <ScrollView contentContainerStyle={styles.intro}>
            <Text className="text-h2 text-foreground">
              Swipe up to explore. Swipe sideways to discard.
            </Text>
            <Text className="mt-4 text-body text-muted-foreground">
              No need to choose “keep.” Up simply shows the next photo. Both sideways directions add
              a reversible mark, and nothing is deleted from your device.
            </Text>
            <Text className="mt-4 text-body text-muted-foreground">
              Discarded photos leave the feed. Tap the photo or Undo to bring back your latest
              discard, as many times as you like. Previous revisits a photo without changing its
              marks. Your place is saved after every action.
            </Text>
            <Text className="mt-4 text-body text-muted-foreground">
              Slowly drag up or down to peek at neighboring photographs. Hold to look between pages,
              return your finger to come back, or release to let the feed settle.
            </Text>
            <Text className="mb-6 mt-4 text-body text-muted-foreground">
              {adventureId
                ? `${plural(session?.ids.length ?? 0, "photograph")} in this adventure. Leave whenever you like: your place, marks and undo are kept.`
                : `${plural(session?.ids.length ?? 0, "photograph")} selected from your accessible library${(session?.ids.length ?? 0) < 200 ? " — fewer than 200 were available for this test" : ""}. The same snapshot stays fixed across resumes and restarts.`}
            </Text>
            <Button disabled={pending} onPress={dismissIntro}>
              Let’s explore
            </Button>
          </ScrollView>
        ) : complete && adventureId ? (
          <AdventureFinish
            adventure={adventure}
            explored={counts.explored}
            marked={counts.discarded}
            unavailable={counts.unavailable}
            canUndo={!!session?.history.length}
            pending={pending}
            onReview={() => setCollection(true)}
            onDone={exit}
            onUndo={undo}
            onPrevious={() => apply({ type: "back" })}
          />
        ) : complete ? (
          <ScrollView contentContainerStyle={styles.intro}>
            <Text className="text-h1 text-foreground">
              Exploration complete!
            </Text>
            <Text className="mt-5 text-body text-foreground">
              {plural(counts.explored, "photograph")} explored
            </Text>
            <Text className="mt-2 text-body text-muted-foreground">
              {`${counts.untouched} left untouched · ${counts.discarded} marked for discard`}
            </Text>
            {counts.unavailable > 0 && (
              <Text className="mt-3 text-body text-muted-foreground">
                {plural(counts.unavailable, "photo")} unavailable or advanced past before loading.
                These aren’t counted as explored. Restart or Previous lets you try again.
              </Text>
            )}
            <Text className="mb-6 mt-4 text-body text-muted-foreground">
              No originals were deleted by this experiment.
            </Text>
            <View className="gap-3">
              <Button onPress={() => setCollection(true)}>Review Discards</Button>
              <Button
                secondary
                disabled={pending || !counts.discarded}
                onPress={() => setConfirmation("restoreAll")}
              >
                Restore All Discards
              </Button>
              <Button secondary disabled={pending} onPress={() => setConfirmation("restart")}>
                Restart Test
              </Button>
              <Button
                secondary
                disabled={pending || !session?.history.length}
                onPress={undo}
              >
                Undo last discard
              </Button>
              <Button secondary disabled={pending} onPress={() => apply({ type: "back" })}>
                Previous photograph
              </Button>
              <Button secondary onPress={() => router.replace("/(tabs)/home")}>
                Return Home
              </Button>
            </View>
          </ScrollView>
        ) : (
          <>
            {session && (
              // Bleeds to the screen edges so a dragged photo slides fully off-screen.
              <View className="-mx-4 flex-1">
              <ExploreFeed
                ref={feed}
                session={session}
                media={media}
                getSession={getSession}
                change={change}
                onPage={(index, total, first) => {
                  setPlace({ index, total, first });
                  setEntrance(undefined); // The feed has taken it.
                }}
                onBusy={setBusy}
                onAvailability={setAvailable}
                onError={setTransitionError}
                initialEntrance={entrance}
              />
              </View>
            )}
            <View className="flex-row items-center justify-between py-2">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Revisit previous photograph"
                disabled={busy || shown.first}
                onPress={() => apply({ type: "back" })}
                className={`min-h-12 justify-center px-3 ${shown.first ? "opacity-40" : ""}`}
              >
                <Text className="text-caption text-muted-foreground">Previous</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Undo latest discard"
                accessibilityHint="Brings the photo back to its place in the feed. You can also tap the photo."
                disabled={busy || !session?.history.length}
                onPress={undo}
                className={`min-h-12 flex-row items-center gap-2 px-3 ${!session?.history.length ? "opacity-40" : ""}`}
              >
                <Icon name="Undo2" size={18} className="text-foreground" />
                <Text className="text-button text-foreground">Undo</Text>
              </Pressable>
            </View>
            <View className="mb-2 flex-row gap-3">
              <View className="flex-1">
                <Button
                  secondary
                  quiet={busy}
                  disabled={!available}
                  onPress={() => feed.current?.discard("left")}
                >
                  Discard
                </Button>
              </View>
              <View className="flex-1">
                <Button quiet={busy} onPress={() => feed.current?.next()}>
                  Next ↑
                </Button>
              </View>
            </View>
          </>
        )}
      </View>
      <Modal visible={!!preview} animationType="none" onRequestClose={() => setPreview(undefined)}>
        <AdventureTheme enabled={dark}>
        <SafeAreaView className="flex-1 bg-background">
          <View className="flex-row items-center justify-between px-4">
            <Text className="text-caption text-muted-foreground">
              {adventureId ? "Set aside · Original untouched" : "Experimental discard · Original untouched"}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close full-screen photo"
              onPress={() => setPreview(undefined)}
              className="h-12 w-12 items-center justify-center"
            >
              <Icon name="X" size={22} className="text-foreground" />
            </Pressable>
          </View>
          {preview && media[preview] ? (
            <MediaImage
              key={preview}
              media={media[preview]}
              fit="contain"
              className="flex-1"
              showLoading
            />
          ) : (
            <View className="flex-1 items-center justify-center">
              <Text className="text-body text-muted-foreground">
                Photo unavailable. You can still restore its mark.
              </Text>
            </View>
          )}
          <View className="p-4">
            <Button
              secondary
              disabled={pending}
              onPress={() => {
                if (preview)
                  void change({ type: "restore", id: preview })
                    .then(() => setPreview(undefined))
                    .catch(() => {});
              }}
            >
              Restore
            </Button>
          </View>
        </SafeAreaView>
        </AdventureTheme>
      </Modal>
      <Modal
        visible={!!confirmation}
        transparent
        animationType="none"
        onRequestClose={() => setConfirmation(undefined)}
      >
        <AdventureTheme enabled={dark}>
        <View className="flex-1 justify-center bg-background/90 p-6">
          <View className="rounded-2xl border border-border bg-card p-6">
            <Text className="text-h3 text-foreground">
              {confirmation === "restart"
                ? "Replay the same photos?"
                : adventureId
                  ? "Restore everything set aside here?"
                  : "Restore all experimental discards?"}
            </Text>
            <Text className="mb-6 mt-3 text-body text-muted-foreground">
              {confirmation === "restart" && adventureId
                ? "This clears this adventure’s marks, progress and undo. The same photos return in the same order. Every original stays untouched."
                : confirmation === "restart"
                ? "This clears your experimental marks, explored progress, and undo history. The exact same photo IDs will be replayed, including any that are now unavailable. Every original stays untouched."
                : "This removes every discard mark in this experiment and clears undo history. Your place and explored progress stay saved. Original photographs stay untouched."}
            </Text>
            <View className="gap-3">
              <Button
                disabled={pending}
                onPress={() => {
                  void change({ type: confirmation === "restart" ? "restart" : "restoreAll" })
                    .then(() => {
                      setConfirmation(undefined);
                      if (confirmation === "restart") setCollection(false);
                    })
                    .catch(() => {});
                }}
              >
                {confirmation === "restart" ? (adventureId ? "Start over" : "Restart Test") : "Restore All"}
              </Button>
              <Button secondary disabled={pending} onPress={() => setConfirmation(undefined)}>
                Cancel
              </Button>
            </View>
          </View>
        </View>
        </AdventureTheme>
      </Modal>
    </SafeAreaView>
    </AdventureTheme>
  );
}
const styles = StyleSheet.create({
  intro: { flexGrow: 1, justifyContent: "center", paddingVertical: 24 },
  columns: { gap: 12 },
});
