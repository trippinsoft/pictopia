import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import Animated, { FadeInDown, ReduceMotion } from "react-native-reanimated";
import { AdventureHeader } from "./adventure-art";
import { Button, Icon, Text } from "./ui";
import { AdventureRating } from "./adventure-rating";
import type { Adventure } from "@/lib/pictopia/adventures";
import { plural } from "@/lib/pictopia/text";
import { adventureStore, type AdventureFeedback } from "@/services/adventures";

/** The end of an Adventure: one line, one number pair, one obvious way on. */
export function AdventureFinish({
  adventure,
  photoIds,
  explored,
  setAside,
  unavailable,
  canUndo,
  pending,
  onReview,
  onUndo,
  onPrevious,
}: {
  adventure?: Adventure;
  photoIds?: string[];
  explored: number;
  setAside: number;
  unavailable: number;
  canUndo: boolean;
  pending: boolean;
  onReview(): void;
  onUndo(): void;
  onPrevious(): void;
}) {
  const [ask, setAsk] = useState(false),
    [like, setLike] = useState<boolean>();
  const [feedback, setFeedback] = useState<AdventureFeedback>();
  const id = adventure?.id;
  useEffect(() => {
    if (!id) return;
    let alive = true;
    void adventureStore
      .finish(id)
      .then((r) => alive && setAsk(r.ask))
      .catch(() => {});
    void adventureStore
      .feedback(id)
      .then((f) => alive && setFeedback(f))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [id]);
  function answer(value: boolean) {
    if (!adventure) return;
    setLike(value);
    void adventureStore.setFeedback(adventure, { like: value }).catch(() => {});
  }
  const home = () => router.replace("/(tabs)/home");
  const [primary, go] = adventure?.lab
    ? ["Back to the Lab", () => (router.canGoBack() ? router.back() : router.replace("/adventure-lab"))]
    : ["Start another adventure", () => router.replace("/(tabs)/explore")];
  return (
    <ScrollView contentContainerStyle={styles.fill}>
      <View className="mx-auto w-full max-w-md px-3">
        <View className="mb-7 items-center">
          <Animated.View entering={FadeInDown.duration(320).reduceMotion(ReduceMotion.System)} style={styles.header}>
            <AdventureHeader kind={adventure?.kind} ids={photoIds} />
          </Animated.View>
        </View>
        <Text
          accessibilityRole="header"
          className="text-center text-h1 leading-[38px] text-foreground"
        >
          {adventure?.closing ?? "Adventure complete."}
        </Text>
        <View accessible accessibilityLabel={`${plural(explored, "photo")} explored · ${setAside} set aside`} className="mt-7 flex-row">
          <View className="flex-1 items-center border-r border-border px-2">
            <Text className="text-h1 text-foreground">{explored}</Text>
            <Text className="mt-1 text-caption text-muted-foreground">{explored === 1 ? "photo explored" : "photos explored"}</Text>
          </View>
          <View className="flex-1 items-center px-2">
            <Text className="text-h1 text-foreground">{setAside}</Text>
            <Text className="mt-1 text-caption text-muted-foreground">set aside</Text>
          </View>
        </View>
        {unavailable > 0 && (
          <Text className="mt-2 text-caption text-muted-foreground">
            {plural(unavailable, "photo")} didn’t load in time and isn’t counted.
          </Text>
        )}
        <View className="mt-10 gap-3">
          <Button onPress={go}>{primary}</Button>
          <Button secondary onPress={home}>Back to Home</Button>
        </View>
        {ask && (
          <View className="mt-10 flex-row items-center justify-between rounded-3xl border border-border bg-card px-5 py-4">
            <Text className="text-body text-foreground">
              {like === undefined ? "More like this?" : "Thanks. Noted for next time."}
            </Text>
            {like === undefined && (
              <View className="flex-row gap-2">
                <Thumb icon="ThumbsUp" label="Yes, more like this" onPress={() => answer(true)} />
                <Thumb icon="ThumbsDown" label="No, fewer like this" onPress={() => answer(false)} />
              </View>
            )}
          </View>
        )}
        {adventure?.lab && (
          <View className="mt-10 rounded-3xl border border-border bg-card p-5">
            <Text className="text-h5 text-foreground">Rate this experiment</Text>
            <Text className="mb-4 mt-1 text-caption text-muted-foreground">
              Optional. 1 is low, 5 is high.
            </Text>
            <AdventureRating adventure={adventure} initial={feedback} onSaved={setFeedback} />
          </View>
        )}
        <View className="mt-7 flex-row flex-wrap justify-center gap-x-6">
          {setAside > 0 && <Quiet label="Review set aside" onPress={onReview} />}
          {canUndo && <Quiet label="Undo last" disabled={pending} onPress={onUndo} />}
          <Quiet label="Previous photo" disabled={pending} onPress={onPrevious} />
        </View>
        <Text className="mt-4 text-center text-caption leading-5 text-muted-foreground">
          Nothing was deleted. Set-aside photos stay in your library until you decide.
        </Text>
      </View>
    </ScrollView>
  );
}
function Quiet({ label, onPress, disabled }: { label: string; onPress(): void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      className="min-h-12 justify-center"
    >
      <Text className="text-body text-muted-foreground underline">{label}</Text>
    </Pressable>
  );
}
function Thumb({
  icon,
  label,
  onPress,
}: {
  icon: "ThumbsUp" | "ThumbsDown";
  label: string;
  onPress(): void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="h-11 w-11 items-center justify-center rounded-full bg-secondary active:opacity-70"
    >
      <Icon name={icon} size={18} className="text-foreground" />
    </Pressable>
  );
}
const styles = StyleSheet.create({
  fill: { flexGrow: 1, justifyContent: "center", paddingVertical: 24 },
  header: { alignSelf: "stretch", alignItems: "center" },
});
