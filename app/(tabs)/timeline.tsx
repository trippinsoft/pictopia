import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Platform, Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { Button, Icon, Loading, Text } from "@/components/pictopia/ui";
import { MediaImage } from "@/components/pictopia/media-image";
import { TabHeader, useLift } from "@/components/pictopia/playful";
import { usePictopia } from "@/components/pictopia/provider";
import { serialize, storage } from "@/services/repository";
import type { CalendarProgress } from "@/services/storage.types";
import type { Media } from "@/lib/pictopia/types";
import { explorationPercent } from "@/lib/pictopia/library-progress";
import { plural } from "@/lib/pictopia/text";

type MonthData = { key: string; month: CalendarProgress; scope: `month:${string}` | "unknown" };
type Row =
  | { kind: "year"; key: string; year: string; totals: { total: number; explored: number; complete: number; count: number } }
  | { kind: "month"; key: string; data: MonthData };

/** Timeline: every calendar month in one continuous list, newest first, grouped under light
 * year headers. No year-level review — like SwipeWipe and Picnic, reviewing happens one
 * month at a time. Year headers are read-only dividers so scrolling to any month is a
 * single swipe + tap. */
export default function Timeline() {
  const app = usePictopia();
  const lift = useLift();
  const [months, setMonths] = useState<CalendarProgress[]>();
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useFocusEffect(useCallback(() => {
    let alive = true;
    if (!app.ready || !app.libraryReliable) { setMonths(undefined); return; }
    void serialize(async () => {
      const data = await storage.calendarProgress();
      if (alive) { setMonths(data); setError(false); }
    }).catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [app.ready, app.libraryReliable, app.revision, retry]));
  const rows = useMemo<Row[]>(() => {
    if (!months) return [];
    // Group months by year, newest first, interleaving a read-only divider before each year.
    const dated = months.filter(m => m.key !== "unknown").sort((a, b) => b.key.localeCompare(a.key));
    const list: Row[] = [];
    let currentYear: string | undefined;
    const yearTotals = new Map<string, { total: number; explored: number; complete: number; count: number }>();
    for (const m of dated) {
      const year = m.key.slice(0, 4);
      const t = yearTotals.get(year) ?? { total: 0, explored: 0, complete: 0, count: 0 };
      t.total += m.total; t.explored += m.explored; t.count += 1;
      if (m.remaining === 0) t.complete += 1;
      yearTotals.set(year, t);
    }
    for (const m of dated) {
      const year = m.key.slice(0, 4);
      if (year !== currentYear) {
        currentYear = year;
        list.push({ kind: "year", key: `year:${year}`, year, totals: yearTotals.get(year)! });
      }
      list.push({ kind: "month", key: `month:${m.key}`, data: { key: m.key, month: m, scope: `month:${m.key}` } });
    }
    const unknown = months.find(m => m.key === "unknown");
    if (unknown) list.push({ kind: "month", key: "unknown", data: { key: "unknown", month: unknown, scope: "unknown" } });
    return list;
  }, [months]);
  const open = (scope: `month:${string}` | "unknown") => router.push({ pathname: "/collection-review", params: { scope } });
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
      <View className="mx-auto w-full max-w-lg flex-1 px-[18px] pt-2">
        <TabHeader title="Timeline" />
        {!app.ready ? (
          <View className="py-10"><Loading /></View>
        ) : !app.libraryReliable || !months ? (
          error ? (
            <View className="gap-4 pt-6"><Text className="text-body text-destructive">Your timeline couldn’t be loaded.</Text><Button onPress={() => setRetry(n => n + 1)}>Try again</Button></View>
          ) : (
            <View className="gap-3 pt-6"><Loading />{!app.busy && app.ready && <Button onPress={() => void app.connect()}>Connect library</Button>}</View>
          )
        ) : months.length === 0 ? (
          <View className="gap-4 pt-6">
            <Text className="text-body text-muted-foreground">Your years and months will appear here once photos are accessible.</Text>
            <Button onPress={() => void app.connect()}>{Platform.OS === "web" ? "Choose photos" : "Manage photo access"}</Button>
          </View>
        ) : (
          <FlatList
            data={rows}
            keyExtractor={row => row.key}
            showsVerticalScrollIndicator={true}
            contentContainerStyle={listStyle}
            ListHeaderComponent={
              <View className="mb-1 pt-1">
                {Platform.OS === "web" && <Text className="mb-2 text-caption text-muted-foreground">Browser dates are file-modified dates.</Text>}
                {!!app.permission?.limited && <Text className="mb-2 text-caption text-muted-foreground">Showing photos you’ve allowed Pictopia to access.</Text>}
                <Text className="text-body leading-6 text-muted-foreground">Pick any month. Every photo you review counts toward your library progress.</Text>
              </View>
            }
            renderItem={({ item }) => item.kind === "year"
              ? <YearDivider year={item.year} totals={item.totals} />
              : <MonthRow row={item.data} onOpen={() => open(item.data.scope)} lift={lift} />
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}
const listStyle = { paddingBottom: 32 };
const coverStyle = { width: 56, height: 56, borderRadius: 14 };

/** A read-only year header: a quick summary of that year's progress without any tap target. */
function YearDivider({ year, totals }: { year: string; totals: { total: number; explored: number; complete: number; count: number } }) {
  const percent = explorationPercent(totals.explored, totals.total) ?? 0;
  const done = totals.total > 0 && totals.explored === totals.total;
  return (
    <View accessible accessibilityRole="header" accessibilityLabel={`${year}, ${done ? "fully reviewed" : `${percent}% reviewed, ${totals.complete} of ${totals.count} months complete`}`} className="mt-5 mb-1 flex-row items-end justify-between">
      <Text className="text-h2 text-foreground">{year}</Text>
      <Text className="pb-1 text-caption text-muted-foreground">{done ? "Complete" : `${totals.complete} of ${totals.count} months complete`}</Text>
    </View>
  );
}

function MonthRow({ row, onOpen, lift }: { row: MonthData; onOpen: () => void; lift: object }) {
  const [cover, setCover] = useState<Media>();
  useEffect(() => {
    let alive = true;
    const id = row.month.coverId;
    if (id) void storage.get(id).then(value => { if (alive) setCover(value); }).catch(() => {});
    return () => { alive = false; };
  }, [row.month.coverId]);
  const label = row.scope === "unknown" ? "Date unknown" : (() => {
    const [year, month] = row.month.key.split("-").map(Number);
    return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  })();
  const percent = explorationPercent(row.month.explored, row.month.total) ?? 0;
  const complete = row.month.remaining === 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${complete ? "Complete" : `${percent}% reviewed, ${plural(row.month.remaining, "photo")} remaining`}`}
      onPress={onOpen}
      style={lift}
      className="mb-2.5 flex-row items-center gap-3 rounded-[16px] bg-card px-3 py-2.5 active:opacity-80"
    >
      <View style={coverStyle} className="overflow-hidden bg-muted">
        {cover && <MediaImage media={cover} fit="cover" style={StyleSheet.absoluteFill} />}
      </View>
      <View className="flex-1">
        <Text className="text-h5 text-foreground">{label}</Text>
        <Text className="mt-0.5 text-caption text-muted-foreground">{complete ? "Complete" : `${percent}% · ${plural(row.month.remaining, "photo")} left`}</Text>
        <View className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-foreground/10">
          <View className={`h-full rounded-full ${complete ? "bg-grass" : "bg-sun"}`} style={{ width: `${Math.min(100, percent)}%` }} />
        </View>
      </View>
      {complete ? <CompleteBadge /> : <Icon name="ChevronRight" size={20} className="text-muted-foreground" />}
    </Pressable>
  );
}

/** A filled green pill with a bold white check, so "done" reads at a glance next to the
 * much thinner chevron used for navigation. */
function CompleteBadge() {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" className="h-7 w-7 items-center justify-center rounded-full bg-grass">
      <Icon name="Check" size={18} strokeWidth={3} className="text-white" />
    </View>
  );
}
