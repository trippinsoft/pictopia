import { useState } from "react";
import { homeSpacing } from "@/lib/pictopia/home-spacing";
import { Platform, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { HomeTip } from "./home-tip";
import { AdventureCover } from "./adventure-art";
import { Button, Icon, Loading, Text } from "./ui";
import { OrBadge, Postcard, Sticker, TabHeader, Ticket, WaitingPill, useLift } from "./playful";
import type { AdventureKind } from "@/lib/pictopia/adventures";
import type { StreakState } from "@/lib/pictopia/daily";
import type { Media } from "@/lib/pictopia/types";
import { adventureName } from "@/lib/pictopia/catalog";

export interface HomeFeature {
  id: string;
  kind: AdventureKind;
  hint: string;
  ids: string[];
}
export interface HomeResume {
  title: string;
  detail: string;
  kind?: AdventureKind;
  media?: Media;
}
export interface HomeContentProps {
  percent?: number;
  explored?: { done: number; total: number };
  streak?: StreakState;
  pending: number;
  ready: boolean;
  hasPhotos: boolean;
  busy: boolean;
  connecting: boolean;
  resume?: HomeResume;
  features?: HomeFeature[];
  error?: string;
  adventureError?: string;
  onConnect(): void;
  onResume(): void;
  onAdventure(id: string): void;
  onShuffle(): void;
  /** A gentle note, e.g. when a shuffle found nothing new. */
  notice?: string;
  /** Only an in-progress shuffle or opening holds the shuffle button, never a library sync. */
  shuffling?: boolean;
  onStreak(): void;
  onProgress(): void;
  onPending(): void;
  onRetry(): void;
}
const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

function StreakSticker({ streak, onPress }: { streak?: StreakState; onPress(): void }) {
  const count = streak?.current ?? 0;
  const label = streak ? `${count}-day streak${streak.todayDone ? ", today done" : ", today not yet explored"}` : "Streak";
  return (
    <Sticker rotate={-1.5} onPress={onPress} label={label} className="flex-[1.35] gap-2">
      <View className="flex-row items-center gap-1.5">
        <Icon name="Flame" size={20} className={streak?.todayDone ? "text-sun" : "text-muted-foreground"} fill={streak?.todayDone ? "currentColor" : "none"} />
        <Text className="text-h2 text-foreground">{count}</Text>
        <Text className="text-h6 text-foreground">day streak</Text>
      </View>
      <View className="flex-row justify-between">
        {(streak?.week ?? []).map((d) => {
          const letter = DAY_LETTERS[new Date(`${d.date}T12:00:00`).getDay()];
          const style = d.state === "done" ? "bg-sun" : d.state === "restored" ? "border-2 border-dashed border-sun bg-sun-soft" : d.state === "today" ? "border-2 border-foreground bg-card" : "bg-foreground/5";
          return (
            <View key={d.date} className="items-center gap-0.5">
              <View className={`h-5 w-5 items-center justify-center rounded-full ${style}`}>
                {(d.state === "done" || d.state === "restored") && <Icon name="Flame" size={11} className="text-foreground" />}
              </View>
              <Text className="text-[10px] text-muted-foreground" style={letterStyle}>{letter}</Text>
            </View>
          );
        })}
      </View>
    </Sticker>
  );
}

function ProgressSticker({ percent, onPress }: { percent?: number; onPress(): void }) {
  return (
    <Sticker rotate={1.5} onPress={onPress} label={percent === undefined ? "Library progress" : `${percent}% of your library explored`} className="flex-1 justify-between gap-1.5">
      <Text className="text-h2 text-foreground">{percent === undefined ? "—" : `${percent}%`}</Text>
      <Text className="text-h6 leading-4 text-foreground">of your library explored</Text>
      <View className="h-2 overflow-hidden rounded-full bg-foreground/10">
        <View className="h-full rounded-full bg-grass" style={{ width: `${Math.min(100, percent ?? 0)}%` }} />
      </View>
    </Sticker>
  );
}

function RestoreCard({ streak, onPress }: { streak: StreakState; onPress(): void }) {
  const lift = useLift();
  const restore = streak.restore!;
  const deadline = new Date(`${restore.deadline}T12:00:00`).toLocaleDateString(undefined, { weekday: "long" });
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={lift} className="mt-3.5 flex-row items-center gap-3 rounded-[18px] bg-card px-4 py-3 active:opacity-80">
      <Icon name="Flame" size={22} className="text-sun" />
      <View className="flex-1">
        <Text className="text-h5 text-foreground">Your {restore.streakBefore}-day streak missed a day</Text>
        <Text className="text-caption text-muted-foreground">Restore it once, free · until the end of {deadline}</Text>
      </View>
      <Icon name="ChevronRight" size={18} className="text-muted-foreground" />
    </Pressable>
  );
}

/** Presentation only. Existing stores and review routes own every action. */
export function HomeContent(props: HomeContentProps) {
  const { ready, hasPhotos, busy, connecting, resume, features, error, adventureError, streak } = props;
  const [viewport, setViewport] = useState(0), [intrinsic, setIntrinsic] = useState(0);
  const spacing = homeSpacing(Math.max(0, viewport - 8), intrinsic, !!resume, props.pending > 0);
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
      <ScrollView onLayout={event => setViewport(event.nativeEvent.layout.height)} contentContainerClassName="mx-auto w-full max-w-lg grow px-[18px] pt-2">
        <View style={{ paddingBottom: spacing.bottom }} onLayout={event => {
          if (ready && hasPhotos) {
            const measured = Math.max(0, event.nativeEvent.layout.height - spacing.total);
            setIntrinsic(previous => Math.abs(previous - measured) > 1 ? measured : previous);
          }
        }}>
        <TabHeader />
        {!ready ? (
          <View className="py-12"><Loading /></View>
        ) : !hasPhotos ? (
          <View className="mt-6 overflow-hidden rounded-[22px] bg-card">
            <View className="h-48 overflow-hidden"><AdventureCover kind="detour" /></View>
            <View className="gap-4 p-5">
              <Text className="text-h2 text-foreground">There’s a story in there.</Text>
              <Text className="text-body leading-6 text-muted-foreground">
                {Platform.OS === "web" ? "Choose photos from this device to begin rediscovering them. Nothing is uploaded." : "Let your library surprise you. Your photos stay on your phone."}
              </Text>
              <Button disabled={connecting} onPress={props.onConnect}>{connecting ? "Opening your library…" : Platform.OS === "web" ? "Choose photos" : "Allow photo access"}</Button>
              {!!error && <Text accessibilityRole="alert" className="text-body text-destructive">{error}</Text>}
            </View>
          </View>
        ) : (
          <>
            <View style={{ marginTop: spacing.stats }} className="flex-row items-stretch gap-2.5">
              <StreakSticker streak={streak} onPress={props.onStreak} />
              <ProgressSticker percent={props.percent} onPress={props.onProgress} />
            </View>
            {streak?.restore && <RestoreCard streak={streak} onPress={props.onStreak} />}
            {resume && (
              <View style={{ marginTop: spacing.resume }}>
                <Ticket kind={resume.kind} media={resume.media} eyebrow={busy ? "Opening…" : resume.detail} title={resume.title} onPress={props.onResume} />
              </View>
            )}
            {/* Measured gaps tighten only when the full page would otherwise overflow. */}
            <View style={{ height: spacing.adventure }} />
            <View style={{ marginBottom: spacing.postcards }} className="flex-row items-center justify-between">
              <Text accessibilityRole="header" className="text-display text-foreground">Where to today?</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Shuffle two more adventures" accessibilityState={{ busy: props.shuffling }} disabled={props.shuffling} onPress={props.onShuffle} className={`h-11 w-11 items-center justify-center rounded-full bg-card active:opacity-70 ${props.shuffling ? "opacity-50" : ""}`}>
                <Icon name="Shuffle" size={18} className="text-foreground" />
              </Pressable>
            </View>
            {features?.length ? (
              <View className="relative flex-row items-start gap-2.5">
                <Postcard kind={features[0].kind} ids={features[0].ids} title={adventureName(features[0].kind)} hint={features[0].hint} rotate={-3} onPress={() => props.onAdventure(features[0].id)} />
                {features[1] && <OrBadge />}
                {features[1] && <Postcard kind={features[1].kind} ids={features[1].ids} title={adventureName(features[1].kind)} hint={features[1].hint} rotate={3} offset={10} onPress={() => props.onAdventure(features[1].id)} />}
              </View>
            ) : features ? (
              <Text className="text-body leading-6 text-muted-foreground">You’re caught up on these adventures. Explore has more ways in.</Text>
            ) : (
              !adventureError && (
                <View className="flex-row gap-2.5">
                  {[0, 1].map((i) => <View key={i} accessibilityLabel="Preparing an adventure" className="h-64 flex-1 rounded-[22px] bg-card/60" />)}
                </View>
              )
            )}
            {!!adventureError && (
              <Pressable accessibilityRole="button" onPress={props.onRetry} className="mt-3 min-h-12 justify-center">
                <Text className="text-body text-destructive">{adventureError} Tap to retry.</Text>
              </Pressable>
            )}
            {!!props.notice && <Text accessibilityLiveRegion="polite" className="mt-3 text-center text-body text-muted-foreground">{props.notice}</Text>}
            {!!error && <Text accessibilityRole="alert" className="mt-3 text-body text-destructive">{error}</Text>}
            <View style={{ paddingTop: spacing.note }}><HomeTip spacing={0} /></View>
            {props.pending > 0 && <><View style={{ height: spacing.pending }} /><WaitingPill count={props.pending} onPress={props.onPending} /></>}
          </>
        )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
const letterStyle = { fontFamily: "Inter_600SemiBold" };
