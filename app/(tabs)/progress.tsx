import { useState } from "react";
import { Modal, Platform, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Button, Icon, Text } from "@/components/pictopia/ui";
import { ProgressRing } from "@/components/pictopia/progress-ring";
import { BadgeDetail } from "@/components/pictopia/badge-detail";
import { BadgeArt } from "@/components/pictopia/badge-art";
import { SectionTitle, Sticker, TabHeader, WaitingPill, useLift } from "@/components/pictopia/playful";
import { useLibraryProgress } from "@/components/pictopia/use-library-progress";
import { usePictopia } from "@/components/pictopia/provider";
import { progressResource } from "@/services/progress";
import { dailyStore } from "@/services/daily";
import { BADGES, ROMAN, badgeView, calendarValues, type BadgeDefinition } from "@/lib/pictopia/badges";
import { addDays, qualifies } from "@/lib/pictopia/daily";
import { bytes } from "@/lib/pictopia/logic";

const weekday = (date: string, style: "narrow" | "long" = "narrow") => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: style });

function Dot({ state, size = 22 }: { state: "done" | "restored" | "missed" | "today" | "future"; size?: number }) {
  const cls = state === "done" ? "bg-sun" : state === "restored" ? "border-2 border-dashed border-sun bg-sun-soft" : state === "today" ? "border-2 border-foreground bg-card" : state === "future" ? "border border-dashed border-foreground/20" : "bg-foreground/5";
  return (
    <View style={{ width: size, height: size }} className={`items-center justify-center rounded-full ${cls}`}>
      {(state === "done" || state === "restored") && <Icon name="Flame" size={size / 2} className="text-foreground" />}
    </View>
  );
}

/** Progress: streak and history, library exploration, badges and honest cleanup numbers. */
export default function Progress() {
  const app = usePictopia();
  const lift = useLift();
  const { progress, percent, error, snapshot, refreshing } = useLibraryProgress();
  const streak = snapshot?.streak;
  const activity = snapshot?.activity;
  const restoredDays = new Set(snapshot?.restores.map(x => x.date) ?? []);
  const months = snapshot ? calendarValues(snapshot.months).months : undefined;
  const videos = snapshot?.videos;
  const badges = snapshot?.badges;
  const [detail, setDetail] = useState<BadgeDefinition>();
  const [history, setHistory] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [message, setMessage] = useState<string>();
  async function restore() {
    try {
      await dailyStore.restore();
      await progressResource.refresh();
      setRestoring(false);
    } catch (e) {
      setMessage((e as Error).message);
      setRestoring(false);
    }
  }
  const today = streak?.week[6]?.date;
  // Five weeks, Monday-start rows ending this week.
  const restored = restoredDays;
  const calendar = today
    ? Array.from({ length: 5 }, (_, w) => {
        const monday = addDays(today, -((new Date(`${today}T12:00:00`).getDay() + 6) % 7) - (4 - w) * 7);
        return Array.from({ length: 7 }, (_, i) => {
          const date = addDays(monday, i);
          const day = activity?.days[date];
          const done = qualifies(day);
          const state = date > today ? "future" : done ? "done" : restored.has(date) ? "restored" : date === today ? "today" : "missed";
          return { date, state } as const;
        });
      })
    : [];
  const earnedCount = badges ? BADGES.filter((d) => (badges.state.earned[d.family]?.tier ?? 0) > 0).length : 0;
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
      <ScrollView contentContainerClassName="mx-auto w-full max-w-lg px-[18px] pb-10 pt-2">
        <TabHeader title="Progress" />
        {error && <Text accessibilityRole="alert" className="mt-3 text-body text-destructive">{snapshot ? "Couldn’t refresh progress. Showing your last saved statistics." : "Couldn’t load progress."}</Text>}
        {error && <Button secondary onPress={() => void progressResource.refresh()}>Retry progress</Button>}
        {!!message && <Text accessibilityRole="alert" className="mt-3 text-body text-destructive">{message}</Text>}

        {snapshot && (refreshing || !app.libraryReliable) && <Text className="mt-2 text-caption text-muted-foreground">Showing saved progress while your library updates.</Text>}
        <Sticker className="mt-4 gap-3.5 p-4">
          <View className="flex-row items-center gap-3">
            <View className="h-14 w-14 items-center justify-center rounded-full bg-sun"><Icon name="Flame" size={28} className="text-foreground" /></View>
            <View className="flex-1">
              <Text className="text-h1 leading-8 text-foreground">{streak?.current ?? "…"} day streak</Text>
              <Text className="text-caption text-muted-foreground">Best {streak?.best ?? "…"} · {streak?.activeDays ?? "…"} active days</Text>
            </View>
          </View>
          {streak?.restore && (
            <Pressable accessibilityRole="button" onPress={() => setRestoring(true)} className="flex-row items-center gap-3 rounded-[14px] bg-sun-soft px-3.5 py-3 active:opacity-80">
              <Icon name="Flame" size={20} className="text-foreground" />
              <View className="flex-1">
                <Text className="text-h5 text-foreground">Restore your {streak.restore.streakBefore}-day streak</Text>
                <Text className="text-caption text-muted-foreground">Free, once · until the end of {weekday(streak.restore.deadline, "long")}</Text>
              </View>
              <Icon name="ChevronRight" size={18} className="text-foreground" />
            </Pressable>
          )}
          {history ? (
            <View className="gap-2">
              <View className="flex-row justify-between">{["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <Text key={i} className="w-[30px] text-center text-[11px] text-muted-foreground">{d}</Text>)}</View>
              {calendar.map((row, i) => <View key={i} className="flex-row justify-between">{row.map((d) => <Dot key={d.date} state={d.state} size={30} />)}</View>)}
            </View>
          ) : (
            <View className="flex-row justify-between">
              {(streak?.week ?? []).map((d) => (
                <View key={d.date} className="items-center gap-1">
                  <Dot state={d.state} />
                  <Text className="text-[11px] text-muted-foreground">{weekday(d.date)}</Text>
                </View>
              ))}
            </View>
          )}
          <View className="flex-row items-center justify-between">
            <Text className="flex-1 text-caption text-muted-foreground">
              {streak?.todayDone ? "Today counts. See you tomorrow." : "Explore 10 photos or videos, or confirm a deletion today."}
              {streak?.nextRestoreFrom && Date.now() < streak.nextRestoreFrom ? ` Next free restore from ${new Date(streak.nextRestoreFrom).toLocaleDateString()}.` : ""}
            </Text>
            <Pressable accessibilityRole="button" onPress={() => setHistory((h) => !h)} className="min-h-11 justify-center pl-3">
              <Text className="text-h5 text-tertiary">{history ? "This week" : "History"}</Text>
            </Pressable>
          </View>
        </Sticker>

        <View className="mt-3.5 flex-row items-stretch gap-2.5">
          <Sticker rotate={-1.2} className="flex-1 items-center gap-1.5 py-4" onPress={() => router.push("/library")} label={percent === undefined ? "Library progress" : `${percent}% of your library explored`}>
            <ProgressRing percent={percent} size={96} />
            <Text className="text-center text-h6 leading-4 text-foreground">of your library explored</Text>
            <Text className="text-caption text-muted-foreground">{progress ? `${progress.accessibleExplored.toLocaleString()} of ${progress.accessible.toLocaleString()}` : error ? "Couldn’t load" : "…"}</Text>
          </Sticker>
          <View className="flex-1 gap-2.5">
            <Sticker rotate={1.2} className="flex-1 justify-center">
              <Text className="text-h2 text-foreground">{progress ? progress.explored.toLocaleString() : "—"}</Text>
              <Text className="text-h6 leading-4 text-foreground">photos explored all-time</Text>
            </Sticker>
            <Sticker rotate={-0.8} className="flex-1 justify-center" onPress={() => router.push("/library")} label="Months fully explored. Open Months and Years">
              <Text className="text-h2 text-foreground">{months ?? "—"}</Text>
              <Text className="text-h6 leading-4 text-foreground">months fully explored</Text>
            </Sticker>
          </View>
        </View>
        {!!videos?.total && <Text className="mt-2.5 px-1 text-caption text-muted-foreground">Videos in accessible library: {videos.explored.toLocaleString()} of {videos.total.toLocaleString()} explored (kept separate from photo progress)</Text>}

        <SectionTitle>Badges</SectionTitle>
        <Text className="-mt-2 mb-3 text-caption text-muted-foreground">{badges ? `${earnedCount} of ${BADGES.length} badge families earned` : "Loading badges…"}</Text>
        <View className="flex-row flex-wrap justify-between gap-y-2.5">
          {BADGES.map((def) => {
            const v = badgeView(def, badges?.state, badges?.values[def.family] ?? 0);
            const needsVerification = (badges?.state.legacy?.[def.family]?.tier ?? 0) > v.tier;
            return (
              <Pressable key={def.family} accessibilityRole="button" onPress={() => setDetail(def)} style={lift} accessibilityLabel={`${def.name}${v.earned ? `, tier ${v.tier}` : ", not yet earned"}. ${v.label}.${v.next ? ` Next at ${v.next.toLocaleString()}.` : ""}`} className="w-[31.5%] items-center gap-1 rounded-[18px] bg-card px-1.5 pb-2.5 pt-3">
                <View>
                  <BadgeArt family={def.family} tier={v.tier} />
                  {v.earned && <View className="absolute -bottom-0.5 -right-1 rounded-full bg-primary px-1.5"><Text className="text-[12px] text-primary-foreground">{ROMAN[v.tier]}</Text></View>}
                </View>
                <Text numberOfLines={2} className="text-center text-h6 leading-4 text-foreground">{def.name}</Text>
                <View className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
                  <View className={`h-full rounded-full ${v.earned ? "bg-grass" : "bg-foreground/30"}`} style={{ width: `${Math.round(v.progress * 100)}%` }} />
                </View>
                <Text className="text-[11px] text-muted-foreground">{badges ? v.earned ? `Level ${ROMAN[v.tier]} earned` : "Locked" : "Loading…"}</Text>
                <Text className="text-[11px] text-muted-foreground">{!badges ? "…" : v.maxed ? "Top tier" : `${v.value.toLocaleString()} / ${v.next?.toLocaleString()}`}</Text>
                {needsVerification && <Text className="text-center text-[11px] text-muted-foreground">Needs verification</Text>}
                {!v.maxed && badges && <Text className="text-[11px] text-muted-foreground">{`Toward level ${ROMAN[v.tier + 1]}`}</Text>}
              </Pressable>
            );
          })}
        </View>

        <SectionTitle>Confirmed cleanup</SectionTitle>
        <View style={lift} className="overflow-hidden rounded-[20px] bg-card">
          <View className="flex-row px-4 py-4">
            <View className="flex-1"><Text className="text-h2 text-foreground">{progress ? progress.deleted.toLocaleString() : "—"}</Text><Text className="text-caption text-muted-foreground">photos deleted</Text></View>
            <View className="flex-1"><Text className="text-h2 text-foreground">{progress ? progress.deletedBytes > 0 ? bytes(progress.deletedBytes) : progress.deleted > 0 && progress.unknownSizes > 0 ? "Not estimated" : "0 B" : "—"}</Text><Text className="text-caption text-muted-foreground">confirmed deletions (estimate)</Text></View>
          </View>
        </View>
        {!!snapshot?.stats.pending && <View className="mt-3.5 gap-2"><WaitingPill count={snapshot.stats.pending} onPress={() => router.push("/queue")} /><Text className="text-caption text-muted-foreground">{snapshot.stats.pendingBytes > 0 ? `${bytes(snapshot.stats.pendingBytes)} in marked items (known sizes only). Not deleted yet.` : "Marked items are not deleted yet. Confirm deletion to record cleanup."}</Text></View>}
        <Text className="mt-2.5 px-1 text-caption leading-5 text-muted-foreground">
          From known file sizes of deletions your phone confirmed{progress?.unknownSizes ? `; ${progress.unknownSizes} without a known size` : ""}. {Platform.OS === "ios" ? "iOS frees the space once Recently Deleted is emptied." : "Your phone may keep deleted items in its trash for a while."}
        </Text>
        <Pressable accessibilityRole="button" onPress={() => router.push("/library")} style={lift} className="mt-5 min-h-14 flex-row items-center gap-3 rounded-[18px] bg-card px-4 active:opacity-80">
          <Icon name="CalendarDays" size={20} className="text-foreground" />
          <Text className="flex-1 text-h4 text-foreground">Months & Years</Text>
          <Icon name="ChevronRight" size={18} className="text-muted-foreground" />
        </Pressable>
      </ScrollView>

      {detail && <BadgeDetail key={detail.family} definition={detail} badges={badges} onClose={() => setDetail(undefined)} />}

      <Modal visible={restoring} transparent animationType="slide" onRequestClose={() => setRestoring(false)}>
        <Pressable accessibilityLabel="Close" onPress={() => setRestoring(false)} className="flex-1 bg-black/30" />
        {streak?.restore && (
          <SafeAreaView edges={["bottom"]} className="rounded-t-[28px] bg-background px-6 pb-4 pt-3">
            <View className="mb-4 h-1.5 w-10 self-center rounded-full bg-foreground/20" />
            <Text accessibilityRole="header" className="text-h2 text-foreground">Restore your streak?</Text>
            <View className="my-4 flex-row justify-between">
              {streak.week.map((d) => <View key={d.date} className="items-center gap-1"><Dot state={d.date === streak.restore?.date ? "restored" : d.state} /><Text className="text-[11px] text-muted-foreground">{weekday(d.date)}</Text></View>)}
            </View>
            <Text className="text-body leading-6 text-foreground">
              Restoring fills {weekday(streak.restore.date, "long")} so your {streak.restore.streakBefore} days continue. It’s free, and you can restore once every 30 days.
            </Text>
            <View className="mt-5 gap-2.5">
              <Button onPress={() => void restore()}>Restore my streak</Button>
              <Button secondary onPress={() => setRestoring(false)}>Not now</Button>
            </View>
          </SafeAreaView>
        )}
      </Modal>
    </SafeAreaView>
  );
}
