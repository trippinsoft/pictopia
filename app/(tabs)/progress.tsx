import { useState } from "react";
import { Modal, Platform, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Button, Icon, Text } from "@/components/pictopia/ui";
import { BadgeDetail } from "@/components/pictopia/badge-detail";
import { BadgeArt } from "@/components/pictopia/badge-art";
import { PitStopMenu } from "@/components/pictopia/pit-stop-menu";
import { SectionTitle, Sticker, TabHeader, WaitingPill, useLift } from "@/components/pictopia/playful";
import { useLibraryProgress } from "@/components/pictopia/use-library-progress";
import { usePictopia } from "@/components/pictopia/provider";
import { progressResource } from "@/services/progress";
import { dailyStore } from "@/services/daily";
import { BADGES, ROMAN, badgeView, type BadgeDefinition } from "@/lib/pictopia/badges";
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

function HeadlineTile({ icon, value, caption, onPress, label }: { icon: "Flame" | "Compass" | "HardDrive"; value: string; caption: string; onPress?: () => void; label: string }) {
  return (
    <Sticker className="flex-1 items-center gap-1.5 py-4" rotate={0} onPress={onPress} label={label}>
      <Icon name={icon} size={22} className={icon === "Flame" ? "text-sun" : icon === "HardDrive" ? "text-grass" : "text-tertiary"} />
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} className="text-h1 leading-9 text-foreground">{value}</Text>
      <Text numberOfLines={2} className="h-8 text-center text-caption leading-4 text-muted-foreground">{caption}</Text>
    </Sticker>
  );
}

/** Progress: three headlines, Discarded link, streak calendar w/ restore, badges, Take a break. */
export default function Progress() {
  const app = usePictopia();
  const lift = useLift();
  const { progress, percent, error, snapshot, refreshing } = useLibraryProgress();
  const streak = snapshot?.streak;
  const activity = snapshot?.activity;
  const restoredDays = new Set(snapshot?.restores.map(x => x.date) ?? []);
  const badges = snapshot?.badges;
  const [detail, setDetail] = useState<BadgeDefinition>();
  const [restoring, setRestoring] = useState(false);
  const [history, setHistory] = useState(false);
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
  const calendar = today
    ? Array.from({ length: 5 }, (_, w) => {
        const monday = addDays(today, -((new Date(`${today}T12:00:00`).getDay() + 6) % 7) - (4 - w) * 7);
        return Array.from({ length: 7 }, (_, i) => {
          const date = addDays(monday, i);
          const day = activity?.days[date];
          const done = qualifies(day);
          const state = date > today ? "future" : done ? "done" : restoredDays.has(date) ? "restored" : date === today ? "today" : "missed";
          return { date, state } as const;
        });
      })
    : [];
  const earnedCount = badges ? BADGES.filter((d) => (badges.state.earned[d.family]?.tier ?? 0) > 0).length : 0;
  const streakValue = streak ? `${streak.current}` : "—";
  const percentValue = percent === undefined ? "—" : `${percent}%`;
  const clearedValue = progress ? (progress.deletedBytes > 0 ? bytes(progress.deletedBytes) : progress.deleted > 0 ? "—" : "0 B") : "—";
  const clearedCaption = progress ? (progress.deleted > 0 ? `${progress.deleted.toLocaleString()} ${progress.deleted === 1 ? "photo" : "photos"} cleared` : "nothing deleted yet") : "cleared";
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
      <ScrollView contentContainerClassName="mx-auto w-full max-w-lg px-[18px] pb-10 pt-2">
        <TabHeader title="Progress" />
        {error && <View className="mt-3 gap-2"><Text accessibilityRole="alert" className="text-body text-destructive">{snapshot ? "Couldn’t refresh progress. Showing your last saved statistics." : "Couldn’t load progress."}</Text><Button secondary onPress={() => void progressResource.refresh()}>Retry progress</Button></View>}
        {!!message && <Text accessibilityRole="alert" className="mt-3 text-body text-destructive">{message}</Text>}
        {snapshot && (refreshing || !app.libraryReliable) && <Text className="mt-2 text-caption text-muted-foreground">Showing saved progress while your library updates.</Text>}

        {/* Three headline numbers */}
        <View className="mt-4 flex-row items-stretch gap-2.5">
          <HeadlineTile icon="Flame" value={streakValue} caption="day streak" label={`${streakValue} day streak`} />
          <HeadlineTile icon="Compass" value={percentValue} caption="reviewed" onPress={() => router.push("/(tabs)/timeline")} label={`${percentValue} of your library reviewed`} />
          <HeadlineTile icon="HardDrive" value={clearedValue} caption={clearedCaption} label={`${clearedValue} cleared`} />
        </View>

        {/* Discarded link — size always shown when any marked items had a known size */}
        {!!snapshot?.stats.pending && (
          <View className="mt-4 gap-2">
            <WaitingPill
              count={snapshot.stats.pending}
              size={snapshot.stats.pendingBytes > 0 ? bytes(snapshot.stats.pendingBytes) : undefined}
              onPress={() => router.push("/queue")}
            />
            <Text className="text-center text-caption text-muted-foreground">Marked items are not deleted yet. Confirm deletion from Discarded.</Text>
          </View>
        )}

        {/* Streak calendar + Restore streak */}
        <Sticker className="mt-5 gap-3.5 p-4">
          <View className="flex-row items-center gap-3">
            <View className="h-14 w-14 items-center justify-center rounded-full bg-sun"><Icon name="Flame" size={28} className="text-foreground" /></View>
            <View className="flex-1">
              <Text className="text-h2 leading-8 text-foreground">{streak?.current ?? "…"} day streak</Text>
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
          {/* This week by default; History expands into a 5-week calendar. */}
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
            <Pressable accessibilityRole="button" accessibilityLabel={history ? "Show this week only" : "Show the last five weeks"} onPress={() => setHistory(h => !h)} className="min-h-11 justify-center pl-3">
              <Text className="text-h5 text-tertiary">{history ? "This week" : "History"}</Text>
            </Pressable>
          </View>
        </Sticker>

        {/* Badges */}
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
                <Text className="text-[11px] text-muted-foreground">{!badges ? "…" : v.maxed ? "Top tier" : `${v.value.toLocaleString()} / ${v.next?.toLocaleString()}`}</Text>
                {needsVerification && <Text className="text-center text-[11px] text-muted-foreground">Needs verification</Text>}
              </Pressable>
            );
          })}
        </View>

        {/* Cleanup footnote — explains the headline number honestly */}
        {progress && progress.deleted > 0 && (
          <Text className="mt-4 px-1 text-caption leading-5 text-muted-foreground">
            Cleared from known file sizes of deletions your phone confirmed{progress.unknownSizes ? `; ${progress.unknownSizes} without a known size` : ""}. {Platform.OS === "ios" ? "iOS frees the space once Recently Deleted is emptied." : "Your phone may keep deleted items in its trash for a while."}
          </Text>
        )}

        {/* Take a break — Pit Stops live here as a reward */}
        <SectionTitle>Take a break</SectionTitle>
        <Text className="mb-3 text-body leading-6 text-muted-foreground">A playful pause from cleanup. Pit Stops reuse your photos without changing anything.</Text>
        <PitStopMenu compact />
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
