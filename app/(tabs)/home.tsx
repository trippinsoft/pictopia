import { useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import Animated, { FadeIn, FadeInDown, FadeOut, ReduceMotion } from "react-native-reanimated";
import { Button, Icon, Text } from "@/components/pictopia/ui";
import { Illustration } from "@/components/pictopia/illustration";
import { AdventureCover } from "@/components/pictopia/adventure-art";
import { useAdventures } from "@/components/pictopia/use-adventures";
import { adventurePlace } from "@/lib/pictopia/adventures";
import { adventureStore, type AdventureSlot } from "@/services/adventures";

/** Pictopia chooses: an invitation and two illustrated possibilities, not a dashboard.
 * Choosing for yourself lives in Explore. */
export default function Home() {
  const { app, slots, progress, error, hasPhotos, reload, refresh } = useAdventures();
  const [opening, setOpening] = useState<string>(),
    [openError, setOpenError] = useState<string>();
  const [refreshing, setRefreshing] = useState(false),
    [refreshNote, setRefreshNote] = useState<string>();
  async function open(id: string) {
    if (opening || refreshing) return;
    setOpening(id);
    setOpenError(undefined);
    try {
      await adventureStore.open(id);
      router.push({ pathname: "/vertical-explore", params: { adventure: id } });
    } catch {
      setOpenError("That adventure couldn’t be opened. Please try again.");
    } finally {
      setOpening(undefined);
    }
  }
  async function more() {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshNote(undefined);
    const fresh = await refresh();
    if (fresh === "unchanged") setRefreshNote("No new pair just now. Explore these, or add more photos.");
    setRefreshing(false);
  }
  const started = slots?.filter((s) => s.adventure.startedAt).length ?? 0;
  const [headline, question] = !app.ready
    ? ["", ""]
    : !hasPhotos
      ? [
          "Every library holds a few surprises.",
          Platform.OS === "web"
            ? "Choose photos from this device to find your first adventures. Nothing is uploaded."
            : "Allow access to your photos to find your first adventures. Nothing leaves your phone.",
        ]
      : slots && !slots.length
        ? ["Your library is a little quiet.", "Choose an adventure in Explore, or add more photos for a surprise here."]
        : started === 2
          ? ["Your adventures await.", "Pick up where you left off."]
          : started === 1
            ? ["Your adventure awaits.", slots!.length > 1 ? "Continue, or try something new." : ""]
            : slots?.length === 1
              ? ["An adventure is waiting.", "Where will you go?"]
              : ["Two adventures are waiting.", "Where will you go?"];
  const share = app.stats.photos ? Math.min(1, progress.explored / app.stats.photos) : 0;
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.fill}>
        <View className="mx-auto w-full max-w-md flex-1 px-3 pb-6 pt-6">
          <Text
            accessibilityRole="header"
            accessibilityLabel="Pictopia"
            className="text-center text-display text-foreground"
          >
            pictopia
          </Text>
          {!!headline && (
            <Text className="mt-2 text-center text-headline text-foreground">{headline}</Text>
          )}
          {!!question && (
            <Text className="mt-1.5 text-center text-body text-muted-foreground">{question}</Text>
          )}
          <View className={`flex-1 pb-4 pt-5 ${hasPhotos ? "justify-center" : "justify-start"}`}>
            {!hasPhotos && app.ready ? (
              <View className="items-center">
                <View className="h-56 w-48 overflow-hidden rounded-[28px]">
                  <Illustration name="detour" />
                </View>
                <View className="mt-8">
                  <Button disabled={app.busy} onPress={() => void app.connect()}>
                    {app.busy
                      ? "Opening your library…"
                      : Platform.OS === "web"
                        ? "Choose photos"
                        : "Allow photo access"}
                  </Button>
                </View>
                {!!app.error && (
                  <Text className="mt-5 text-center text-body text-muted-foreground">{app.error}</Text>
                )}
              </View>
            ) : (
              <>
                <View className="flex-row gap-2">
                  {slots
                    ? slots.map((slot, i) => (
                        <Choice
                          key={slot.adventure.id}
                          index={i}
                          slot={slot}
                          opening={opening === slot.adventure.id}
                          disabled={!!opening || refreshing}
                          onPress={() => void open(slot.adventure.id)}
                        />
                      ))
                    : hasPhotos &&
                      !error && (
                        <>
                          <Placeholder letter="A" />
                          <Placeholder letter="B" />
                        </>
                      )}
                </View>
                {slots?.length === 0 && (
                  <View className="mt-6 self-center">
                    <Button secondary onPress={() => router.push("/(tabs)/explore")}>Explore your photos</Button>
                  </View>
                )}
                {!!slots?.length && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Show me two more adventures"
                    accessibilityState={{ busy: refreshing }}
                    disabled={refreshing || !!opening}
                    onPress={() => void more()}
                    className="mt-5 min-h-11 flex-row items-center justify-center gap-2 self-center px-4 active:opacity-60"
                  >
                    <Icon name="RefreshCw" size={15} className="text-muted-foreground" />
                    <Text className="text-h6 text-muted-foreground">
                      {refreshing ? "Finding two more…" : "Show me two more"}
                    </Text>
                  </Pressable>
                )}
                {!!refreshNote && (
                  <Text className="mt-1 text-center text-caption text-muted-foreground">{refreshNote}</Text>
                )}
              </>
            )}
            {!!openError && (
              <Text className="mt-6 text-center text-body text-muted-foreground">{openError}</Text>
            )}
            {!!error && (
              <Pressable accessibilityRole="button" onPress={() => void reload()} className="mt-6 py-2">
                <Text className="text-center text-body text-muted-foreground">
                  {error} Tap to try again.
                </Text>
              </Pressable>
            )}
          </View>
          {hasPhotos && (
            <Pressable
              accessibilityRole={progress.setAside ? "button" : "text"}
              accessibilityLabel={`${progress.explored.toLocaleString()} {progress.explored === 1 ? "photo" : "photos"} explored on your Journey${progress.setAside ? `, ${progress.setAside} set aside. Review set-aside photos.` : ""}`}
              disabled={!progress.setAside}
              onPress={() => router.push("/set-aside")}
              className="min-h-12 items-center justify-center px-6"
            >
              <Text className="text-center text-caption text-muted-foreground">
                {progress.explored.toLocaleString()} {progress.explored === 1 ? "photo" : "photos"} explored on your Journey
                {progress.setAside ? ` · ${progress.setAside.toLocaleString()} set aside` : ""}
              </Text>
              <View className="mt-2 h-1 w-40 overflow-hidden rounded-full bg-secondary">
                <View
                  className="h-1 rounded-full bg-primary"
                  style={{ width: `${Math.round(share * 100)}%` }}
                />
              </View>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const enter = (index: number) =>
  FadeInDown.duration(320)
    .delay(index * 70)
    .reduceMotion(ReduceMotion.System);
const leave = FadeOut.duration(160).reduceMotion(ReduceMotion.System);

function Choice({
  index,
  slot,
  opening,
  disabled,
  onPress,
}: {
  index: number;
  slot: AdventureSlot;
  opening: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const letter = index ? "B" : "A";
  const { hint, startedAt, kind } = slot.adventure;
  const place = adventurePlace(slot.session);
  return (
    <Animated.View entering={enter(index)} exiting={leave} style={styles.choice}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Adventure ${letter}. ${hint.title}. ${startedAt ? `${hint.detail}. In progress, ${place.explored} of ${place.total} explored.` : hint.detail}`}
        accessibilityState={{ busy: opening, disabled }}
        disabled={disabled}
        onPress={onPress}
        className="min-w-0 flex-1 overflow-hidden rounded-[28px] border border-border bg-card active:scale-[0.98] active:opacity-90"
      >
        <View className="aspect-[3/5] w-full">
          <AdventureCover kind={kind} ids={slot.session.ids} />
          <View className="absolute left-3 top-3 h-8 w-8 items-center justify-center rounded-full bg-card">
            <Text className="text-h6 text-primary">{letter}</Text>
          </View>
        </View>
        <View className="px-3 pb-3 pt-2">
          <Text className="text-headline leading-6 text-foreground" numberOfLines={3}>
            {hint.title}
          </Text>
          <Text className="mt-1 text-caption leading-[17px] text-muted-foreground" numberOfLines={3}>
            {hint.detail}
          </Text>
          {!!startedAt && (
            <Text className="mt-2 text-caption text-primary">
              Continue · {place.explored} of {place.total}
            </Text>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}
function Placeholder({ letter }: { letter: "A" | "B" }) {
  return (
    <Animated.View
      entering={FadeIn.duration(200).reduceMotion(ReduceMotion.System)}
      accessibilityLabel={`Preparing adventure ${letter}`}
      style={styles.choice}
    >
      <View className="min-h-[300px] flex-1 overflow-hidden rounded-[28px] border border-border bg-card">
      <View className="aspect-[3/5] w-full bg-secondary" />
      <View className="gap-2 p-4">
        <View className="h-4 w-24 rounded-full bg-secondary" />
        <View className="h-3 w-16 rounded-full bg-secondary" />
      </View>
      </View>
    </Animated.View>
  );
}
const styles = StyleSheet.create({ fill: { flexGrow: 1 }, choice: { flex: 1, minWidth: 0 } });
