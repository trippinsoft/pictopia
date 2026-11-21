import { ScreenHeader } from "@/components/pictopia/navigation-header";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import { router, Stack, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Icon, Loading, Text } from "@/components/pictopia/ui";
import { Illustration } from "@/components/pictopia/illustration";
import { MediaImage } from "@/components/pictopia/media-image";
import { useLift } from "@/components/pictopia/playful";
import { usePictopia } from "@/components/pictopia/provider";
import { plural } from "@/lib/pictopia/text";
import { useTheme } from "@/theming/ThemeProvider";
import { BATCH_SIZE, lookalikeStore, type Batch, type GroupView, type LookalikeIndex, type ScanProgress } from "@/services/lookalikes";

/** Duplicate Hunt (Pictopia+): every set of look-alike photos as a card with its count.
 * Tapping a set opens it in the look-alike review. Finding them reads only the small
 * previews already on this phone; nothing is uploaded, downloaded or decided. */
export default function DuplicateHunt() {
  const app = usePictopia();
  const lift = useLift(3);
  const [batch, setBatch] = useState<Batch>();
  const [waiting, setWaiting] = useState(0);
  const [progress, setProgress] = useState<ScanProgress>();
  const [hunting, setHunting] = useState(false);
  const [summary, setSummary] = useState<{ printed: number; unreadable: number }>();
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const [building, setBuilding] = useState(false);
  const latest = useRef<LookalikeIndex>(undefined);
  useEffect(() => { if (app.ready && !app.pro) router.replace({ pathname: "/paywall", params: { entry: "Duplicates" } }); }, [app.ready, app.pro]);

  const build = useCallback(async (index: LookalikeIndex) => {
    const next = await lookalikeStore.batch(index);
    setBatch(next); setWaiting(next.waiting);
  }, []);

  // The batch is built once per visit and then stays exactly where it is. A first hunt shows
  // only its progress; later visits check new photos quietly, and anything new waits for the
  // next visit rather than moving cards around on screen.
  const pro = app.ready && app.pro;
  useEffect(() => {
    if (!pro) return;
    let alive = true;
    const onProgress = (p: ScanProgress) => { if (alive) setProgress(p); };
    void (async () => {
      const saved = await lookalikeStore.saved().catch(() => undefined);
      if (!alive) return;
      if (saved) { latest.current = saved; setSummary(saved); await build(saved).catch(() => setBatch({ views: [], reviewed: new Set(), waiting: 0 })); }
      if (!alive || !lookalikeStore.available) { if (alive && !saved) setBatch({ views: [], reviewed: new Set(), waiting: 0 }); return; }
      if (!saved) setHunting(true);
      setError(undefined);
      try {
        const result = await lookalikeStore.scan(onProgress);
        if (!alive) return;
        latest.current = result.index;
        setSummary(result.index);
        if (!saved) await build(result.index);
      } catch {
        if (alive) { setError("Pictopia couldn’t finish looking. Your photos are untouched."); setBatch(old => old ?? { views: [], reviewed: new Set(), waiting: 0 }); }
      } finally {
        if (alive) { setHunting(false); setProgress(undefined); }
      }
    })();
    return () => { alive = false; lookalikeStore.unlisten(onProgress); };
  }, [pro, attempt, build]);

  // Coming back from a set: same cards, same order; only their photos and checks update.
  const current = useRef(batch); current.current = batch;
  const returned = useRef(false);
  useFocusEffect(useCallback(() => {
    if (!returned.current) { returned.current = true; return; }
    const shown = current.current;
    if (!shown?.views.length) return;
    let alive = true;
    void lookalikeStore.refresh(shown.views).then(fresh => { if (alive) setBatch(fresh); }).catch(() => {});
    return () => { alive = false; };
  }, []));

  const nextBatch = async () => {
    if (!latest.current || building) return;
    setBuilding(true);
    try { await build(latest.current); } finally { setBuilding(false); }
  };
  const views = batch?.views;
  const done = views ? views.filter(v => batch?.reviewed.has(v.group.id)).length : 0;
  const allDone = !!views?.length && done === views.length;
  const subtitle = !views?.length ? undefined
    : allDone ? "All done in this batch."
    : `${done} of ${views.length} sets reviewed${waiting ? ` · ${waiting.toLocaleString()} more after these` : ""}`;
  const data = views ? [...views, ...Array<null>((COLUMNS - (views.length % COLUMNS)) % COLUMNS).fill(null)] : [];
  return <SafeAreaView edges={["top", "left", "right"]} className="flex-1 bg-background">
    <Stack.Screen options={{ title: "Duplicate Hunt", headerShown: false }} />
    <View className="mx-auto w-full max-w-lg flex-1">
      <View className="px-5"><ScreenHeader title="Duplicate Hunt" subtitle={hunting ? undefined : subtitle} fallback="/(tabs)/explore" /></View>
      {!!error && <Pressable accessibilityRole="button" onPress={() => setAttempt(n => n + 1)} className="mx-5 mb-2 min-h-12 justify-center"><Text accessibilityRole="alert" className="text-body text-destructive">{`${error} Tap to try again.`}</Text></Pressable>}
      {!app.pro ? <Loading /> : hunting && !views ? <Hunting progress={progress} /> : !views ? <Loading /> : !views.length ? <EmptyState scanning={hunting} available={lookalikeStore.available} unreadable={summary?.unreadable ?? 0} /> : <FlatList
        data={data}
        keyExtractor={(v, i) => v?.group.id ?? `spacer-${i}`}
        numColumns={COLUMNS}
        columnWrapperStyle={columnStyle}
        contentContainerStyle={listStyle}
        initialNumToRender={18}
        ListHeaderComponent={allDone ? <View style={lift} className="mb-1 items-center gap-2 rounded-[18px] bg-card px-4 py-4">
          <Text className="text-center text-h4 text-foreground">{waiting ? "Nice work — that’s this batch!" : "You’ve been through every set!"}</Text>
          {waiting ? <Button disabled={building} onPress={() => void nextBatch()}>{building ? "Gathering…" : `Show the next ${Math.min(BATCH_SIZE, waiting)} sets`}</Button>
            : <Text className="text-center text-caption text-muted-foreground">New look-alikes show up here as you take more photos.</Text>}
        </View> : null}
        ListFooterComponent={<View className="h-6" />}
        renderItem={({ item }) => item ? <GroupCard view={item} reviewed={!!batch?.reviewed.has(item.group.id)} lift={lift} /> : <View className="flex-1" />}
      />}
    </View>
  </SafeAreaView>;
}

/** The first hunt: one calm screen with honest progress, never a list that keeps changing. */
function Hunting({ progress }: { progress?: ScanProgress }) {
  const began = useRef<{ at: number; done: number }>(undefined);
  if (progress && !began.current && progress.done > 0) began.current = { at: Date.now(), done: progress.done };
  const fraction = progress?.total ? Math.min(1, progress.done / progress.total) : 0;
  let left: string | undefined;
  if (progress && began.current && progress.done > began.current.done) {
    const rate = (progress.done - began.current.done) / Math.max(1, Date.now() - began.current.at);
    const minutes = Math.ceil((progress.total - progress.done) / rate / 60_000);
    left = minutes <= 1 ? "Less than a minute left" : `About ${minutes} minutes left`;
  }
  return <View className="flex-1 items-center justify-center gap-3 px-8 pb-16">
    <View className="h-36 w-36 overflow-hidden rounded-[28px]"><Illustration name="duplicates" square style={fill} /></View>
    <Text accessibilityRole="header" className="mt-2 text-center text-h2 text-foreground">Hunting for look-alikes</Text>
    <Text className="text-center text-body leading-6 text-muted-foreground">Pictopia is comparing small previews of your photos on this device. Your sets appear here all at once when it’s done.</Text>
    <View accessibilityLiveRegion="polite" className="mt-3 w-full max-w-xs gap-2">
      <View className="h-2 overflow-hidden rounded-full bg-card"><View className="h-full rounded-full bg-sun" style={{ width: `${fraction * 100}%` }} /></View>
      <Text className="text-center text-caption text-muted-foreground" style={tabular}>{progress ? `${progress.done.toLocaleString()} of ${progress.total.toLocaleString()} photos${left ? ` · ${left}` : ""}` : "Getting ready…"}</Text>
    </View>
    <Text className="mt-2 text-center text-caption text-muted-foreground">You can leave — the hunt keeps going and picks up where it left off.</Text>
  </View>;
}

function EmptyState({ scanning, available, unreadable }: { scanning: boolean; available: boolean; unreadable: number }) {
  const [title, body] = !available
    ? ["Update Pictopia to hunt", "Duplicate Hunt needs the newest version of the app. Update Pictopia, then come back here."]
    : scanning
      ? ["Checking for look-alikes", "Pictopia is checking your newest photos on this device."]
      : ["No look-alikes found", `Your library has no duplicate or near-identical photos right now.${unreadable ? ` ${plural(unreadable, "photo")} couldn’t be read on this device yet.` : ""}`];
  return <View className="flex-1 items-center justify-center gap-3 px-8 pb-16">
    <View className="h-36 w-36 overflow-hidden rounded-[28px]"><Illustration name="duplicates" square style={fill} /></View>
    <Text accessibilityRole="header" className="mt-2 text-center text-h2 text-foreground">{title}</Text>
    <Text className="text-center text-body leading-6 text-muted-foreground">{body}</Text>
  </View>;
}

/** A set: up to four of its photos as small thumbnails, its count, and how far it's sorted. */
const GroupCard = memo(function GroupCard({ view, reviewed, lift }: { view: GroupView; reviewed: boolean; lift: object }) {
  const { group, items, discarded } = view;
  const best = items.find(m => m.id === group.best) ?? items[0];
  const tiles = [best, ...items.filter(m => m !== best)].slice(0, 4);
  const sorted = reviewed || (discarded > 0 && discarded >= items.length - 1);
  const date = new Date(best.created).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  const kind = group.kind === "copies" ? "Copies" : "Similar";
  // The count/check badge: muted ink by day, black at night so it reads on the sun and grass fills.
  const night = useTheme().theme.name === "dark";
  const ring = night ? "border-black" : "border-muted-foreground", ink = night ? "text-black" : "text-muted-foreground";
  return <Pressable accessibilityRole="button" accessibilityLabel={`${group.kind === "copies" ? "Identical copies" : "Similar shots"}, ${plural(items.length, "photo")}, ${date}${discarded ? `, ${discarded} discarded` : ""}${reviewed ? ", reviewed" : ""}`}
    onPress={() => router.push({ pathname: "/duplicate-group", params: { group: group.id } })} className="flex-1 active:opacity-90">
    <View style={lift} className={`flex-1 overflow-hidden rounded-[16px] bg-card ${reviewed ? "opacity-60" : ""}`}>
      <View className="aspect-square flex-row flex-wrap gap-[3px] p-1">
        {tiles.map(m => <View key={m.id} className={`overflow-hidden rounded-[8px] bg-muted ${tiles.length === 2 ? "h-full w-[48.5%]" : tiles.length === 3 && m === best ? "h-full w-[48.5%]" : "h-[48.5%] w-[48.5%]"}`}>
          <MediaImage media={m} thumbnail className={`flex-1 ${m.decision === "delete" ? "opacity-40" : ""}`} />
        </View>)}
        <View className={`absolute bottom-2 right-2 h-7 min-w-7 items-center justify-center rounded-full border-2 ${ring} px-1.5 ${sorted ? "bg-grass" : "bg-sun"}`}>
          {sorted ? <Icon name="Check" size={14} strokeWidth={3} className={ink} /> : <Text className={`text-[13px] font-bold ${ink}`} style={tabular}>{items.length}</Text>}
        </View>
      </View>
      <View className="px-2 pb-2 pt-0.5">
        <Text numberOfLines={1} className="text-caption font-semibold text-foreground">{date}</Text>
        <Text numberOfLines={1} className="text-[11px] text-muted-foreground">{reviewed ? (discarded ? `Reviewed · ${discarded} discarded` : "Reviewed") : discarded ? `${kind} · ${discarded} discarded` : kind}</Text>
      </View>
    </View>
  </Pressable>;
}, (a, b) => a.reviewed === b.reviewed && a.view.group.id === b.view.group.id && a.view.discarded === b.view.discarded && a.view.items.length === b.view.items.length);
const tabular = { fontVariant: ["tabular-nums" as const] };
const COLUMNS = 3;
const columnStyle = { gap: 10 };
const fill = { flex: 1 };
const listStyle = { paddingHorizontal: 16, paddingBottom: 32, gap: 10 };
