import { ScreenHeader } from "./navigation-header";
import { useEffect, useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeInDown, ReduceMotion } from "react-native-reanimated";
import { AdventureHeader } from "./adventure-art";
import { Button, Icon, Text } from "./ui";
import { AdventureRating } from "./adventure-rating";
import { BadgeArt } from "./badge-art";
import { usePictopia } from "./provider";
import type { Adventure } from "@/lib/pictopia/adventures";
import { adventureLabel } from "@/lib/pictopia/catalog";
import { BADGES, ROMAN, type BadgeFamily } from "@/lib/pictopia/badges";
import { explorationPercent } from "@/lib/pictopia/library-progress";
import { plural } from "@/lib/pictopia/text";
import { adventureStore, type AdventureFeedback } from "@/services/adventures";
import { badgeStore } from "@/services/badges";
import { dailyStore } from "@/services/daily";
import { serialize, storage } from "@/services/repository";

/** Completion: what was gained, counted honestly. "Marked" is waiting and reversible; nothing
 * here says deleted. Celebrations (badges, the streak day) sit inline, never on their own screen. */
export function AdventureFinish({
  adventure,
  title,
  photoIds,
  explored,
  marked,
  unavailable,
  libraryBefore: _libraryBefore,
  canUndo,
  pending,
  onReview,
  onDone,
  onUndo,
  onPrevious,
  headlineOverride,
  art,
  more,
}: {
  adventure?: Adventure;
  /** Collections: their own headline ("October 2016, fully explored"). */
  headlineOverride?: string;
  /** Collections: their own artwork in place of an adventure's. */
  art?: ReactNode;
  /** Collections with photos left: the next stretch. */
  more?: { label: string; busy?: boolean; onPress(): void };
  /** Collections use their own title in place of an adventure's. */
  title?: string;
  photoIds?: string[];
  explored: number;
  /** Marked for deletion in this adventure and still waiting. */
  marked: number;
  unavailable: number;
  /** Library explored percentage when this review opened, for the "+N%" figure. */
  libraryBefore?: number;
  canUndo: boolean;
  pending: boolean;
  onReview(): void;
  onDone(): void;
  onUndo(): void;
  onPrevious(): void;
}) {
  const app = usePictopia();
  const [ask, setAsk] = useState(false), [like, setLike] = useState<boolean>();
  const [feedback, setFeedback] = useState<AdventureFeedback>();
  const [extras, setExtras] = useState<{ streak?: number; best?: boolean; badges: { family: BadgeFamily; tier: number }[]; percent?: number }>({ badges: [] });
  const id = adventure?.id;
  useEffect(() => {
    let alive = true;
    if (id) {
      void adventureStore.finish(id).then(r => alive && setAsk(r.ask)).catch(() => {});
      void adventureStore.feedback(id).then(f => alive && setFeedback(f)).catch(() => {});
    }
    // Finishing is a natural break: badges are evaluated here, never per photo.
    void Promise.all([
      dailyStore.streak().catch(() => undefined),
      badgeStore.evaluate().catch(() => undefined),
      app.libraryReliable ? serialize(() => storage.progress()).catch(() => undefined) : Promise.resolve(undefined),
    ]).then(([streak, badges, progress]) => {
      if (!alive) return;
      setExtras({
        streak: streak?.todayDone ? streak.current : undefined,
        best: !!streak?.todayDone && streak.current > 1 && streak.current >= streak.best,
        badges: badges?.newlyEarned ?? [],
        percent: progress ? explorationPercent(progress.accessibleExplored, progress.accessible) : undefined,
      });
    });
    return () => { alive = false; };
  }, [id, app.libraryReliable]);
  function answer(value: boolean) {
    if (!adventure) return;
    setLike(value);
    void adventureStore.setFeedback(adventure, { like: value }).catch(() => {});
  }
  const name = title ?? (adventure ? adventureLabel(adventure) : "Adventure");
  const headline = headlineOverride ?? adventure?.closing ?? (marked ? `${plural(explored, "item")} reviewed` : `${plural(explored, "item")} reviewed`);
  return (
    // Every edge is safe: the artwork sits below the status bar and Dynamic Island, and the
    // actions stay above the home indicator, on every screen size.
    <SafeAreaView edges={["top", "bottom", "left", "right"]} className="flex-1 bg-background">
      <View className="mx-auto w-full max-w-md px-5"><ScreenHeader title={name} onBack={onDone} /></View>
      <ScrollView contentContainerStyle={styles.fill}>
        <Animated.View entering={FadeInDown.duration(320).reduceMotion(ReduceMotion.System)} style={styles.header}>
          {art ?? <AdventureHeader kind={adventure?.kind} ids={photoIds} />}
        </Animated.View>
        <View className="mx-auto w-full max-w-md px-6">
          <Text className="mt-5 text-caption uppercase tracking-widest text-muted-foreground">{`${name} · Complete`}</Text>
          <Text accessibilityRole="header" className="mt-1 text-display leading-[36px] text-foreground">{headline}</Text>
          <View accessible accessibilityLabel={`${plural(explored, "item")} reviewed in this review, ${marked} marked for deletion`} className="mt-5 flex-row rounded-[22px] bg-card py-4">
            <Stat value={String(explored)} label="reviewed" />
            <Stat value={String(marked)} label="marked" />

          </View>
          {unavailable > 0 && <Text className="mt-2 text-caption text-muted-foreground">{`${plural(unavailable, "item")} didn’t load in time and ${unavailable === 1 ? "isn’t" : "aren’t"} counted.`}</Text>}
          <View className="mt-4">
            {extras.badges.map(b => {
              const def = BADGES.find(d => d.family === b.family);
              return def ? <Earned key={b.family} art={<BadgeArt family={b.family} tier={b.tier} size={48} />} title={`New badge · ${def.name} ${ROMAN[b.tier] ?? ""}`} detail={def.unit(def.tiers[b.tier - 1] ?? 0)} /> : null;
            })}
            {extras.streak !== undefined && <Earned art={<View className="h-12 w-12 items-center justify-center rounded-full bg-sun-soft"><Icon name="Flame" size={24} className="text-tomato" /></View>} title={`Day ${extras.streak}`} detail={extras.best ? "Your best streak yet" : "Today counts toward your streak"} />}
          </View>
          {marked > 0 && <Text className="mt-4 text-caption leading-5 text-muted-foreground">{`Nothing has been deleted yet. ${marked === 1 ? "Your marked photo stays" : "Marked photos stay"} in your library until you confirm.`}</Text>}
          {/* The actions follow the recap directly, so it reads as one card-like moment. */}
          <View className="mt-6 gap-1">
            {marked > 0 && <Button onPress={onReview}>{`Review ${plural(marked, "marked photo")}`}</Button>}
            {more && <Button secondary={marked > 0} disabled={more.busy} onPress={more.onPress}>{more.busy ? "Opening…" : more.label}</Button>}
            {marked > 0 || more ? <Pressable accessibilityRole="button" onPress={onDone} className="min-h-12 items-center justify-center"><Text className="text-button text-foreground">Done</Text></Pressable> : <Button onPress={onDone}>Done</Button>}
          </View>
          {ask && (
            <View className="mt-6 flex-row items-center justify-between rounded-[22px] bg-card px-5 py-3">
              <Text className="text-body text-foreground">{like === undefined ? "More like this?" : "Thanks. Noted for next time."}</Text>
              {like === undefined && <View className="flex-row gap-2">
                <Thumb icon="ThumbsUp" label="Yes, more like this" onPress={() => answer(true)} />
                <Thumb icon="ThumbsDown" label="No, fewer like this" onPress={() => answer(false)} />
              </View>}
            </View>
          )}
          {adventure?.lab && (
            <View className="mt-6 rounded-[22px] bg-card p-5">
              <Text className="text-h5 text-foreground">Rate this experiment</Text>
              <Text className="mb-4 mt-1 text-caption text-muted-foreground">Optional. 1 is low, 5 is high.</Text>
              <AdventureRating adventure={adventure} initial={feedback} onSaved={setFeedback} />
            </View>
          )}
          <View className="mt-4 flex-row flex-wrap justify-center gap-x-6">
            {canUndo && <Quiet label="Undo last mark" disabled={pending} onPress={onUndo} />}
            <Quiet label="Back to the photos" disabled={pending} onPress={onPrevious} />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
function Stat({ value, label, tone }: { value: string; label: string; tone?: "grass" }) {
  return <View className="flex-1 items-center">
    <Text className={`text-mark leading-[44px] ${tone === "grass" ? "text-grass" : "text-foreground"}`} style={styles.numbers}>{value}</Text>
    <Text className="text-caption text-muted-foreground">{label}</Text>
  </View>;
}
function Earned({ art, title, detail }: { art: ReactNode; title: string; detail: string }) {
  return <View className="flex-row items-center gap-3.5 border-b border-border py-3">
    {art}
    <View className="flex-1">
      <Text className="text-headline text-foreground">{title}</Text>
      <Text className="text-caption text-muted-foreground">{detail}</Text>
    </View>
  </View>;
}
function Quiet({ label, onPress, disabled }: { label: string; onPress(): void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} className="min-h-12 justify-center">
    <Text className="text-body text-muted-foreground underline">{label}</Text>
  </Pressable>;
}
function Thumb({ icon, label, onPress }: { icon: "ThumbsUp" | "ThumbsDown"; label: string; onPress(): void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} className="h-11 w-11 items-center justify-center rounded-full bg-secondary active:opacity-70">
    <Icon name={icon} size={18} className="text-foreground" />
  </Pressable>;
}
const styles = StyleSheet.create({
  fill: { flexGrow: 1, justifyContent: "center", paddingTop: 8, paddingBottom: 24 },
  header: { alignSelf: "stretch", alignItems: "center", marginVertical: 12 },
  numbers: { fontVariant: ["tabular-nums"] },
});
