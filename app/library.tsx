import { useCallback, useEffect, useState } from "react";
import { router, Stack, useFocusEffect } from "expo-router";
import { FlatList, Platform, Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/pictopia/art-list";
import { Button, Icon, Loading, Text } from "@/components/pictopia/ui";
import { MediaImage } from "@/components/pictopia/media-image";
import { usePictopia } from "@/components/pictopia/provider";
import { storage, serialize } from "@/services/repository";
import { collectionStore, collectionTitle, type PhotoCollection } from "@/services/collections";
import type { CalendarProgress } from "@/services/storage.types";
import type { Media } from "@/lib/pictopia/types";
import { explorationPercent } from "@/lib/pictopia/library-progress";
import { plural } from "@/lib/pictopia/text";

type Row = { kind: "year"; year: string; months: CalendarProgress[] } | { kind: "month"; month: CalendarProgress; scope: PhotoCollection };
export default function Library() {
  const app = usePictopia();
  const [months, setMonths] = useState<CalendarProgress[]>();
  const [saved, setSaved] = useState<string[]>([]), [error, setError] = useState(false), [retry, setRetry] = useState(0);
  useFocusEffect(useCallback(() => {
    let alive = true;
    if (!app.ready || !app.libraryReliable) { setMonths(undefined); return; }
    void serialize(async () => {
      const data = await storage.calendarProgress();
      const resumable = await collectionStore.savedScopes();
      if (alive) { setMonths(data); setSaved(resumable); setError(false); }
    }).catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [app.ready, app.libraryReliable, app.revision, retry]));
  const years = [...new Set((months ?? []).filter(m => m.key !== "unknown").map(m => m.key.slice(0, 4)))].sort().reverse();
  const rows: Row[] = years.flatMap(year => {
    const group = (months ?? []).filter(m => m.key.startsWith(`${year}-`));
    return [{ kind: "year" as const, year, months: group }, ...group.map(month => ({ kind: "month" as const, month, scope: `month:${month.key}` as PhotoCollection }))];
  });
  const unknown = months?.find(m => m.key === "unknown");
  if (unknown) rows.push({ kind: "month", month: unknown, scope: "unknown" });
  const open = (scope: PhotoCollection) => router.push({ pathname: "/collection-review", params: { scope } });
  return <SafeAreaView className="flex-1 bg-background"><Stack.Screen options={{ title: "Months & Years" }} />
    <View className="mx-auto w-full max-w-lg flex-1 px-5">
      <ScreenHeader title="Months & Years" subtitle="Every photo you explore counts here, whichever path you take." fallback="/(tabs)/explore" />
      {Platform.OS === "web" && <Text className="mb-4 text-caption text-muted-foreground">Browser dates are file-modified dates.</Text>}
      {!!app.permission?.limited && <Text className="mb-4 text-caption text-muted-foreground">Showing photos you’ve allowed Pictopia to access.</Text>}
      {error ? <View className="gap-4"><Text className="text-body text-destructive">Your calendar couldn’t be loaded.</Text><Button onPress={() => setRetry(n => n + 1)}>Try again</Button></View> : !months ? <View className="gap-3"><Loading />{!app.busy && app.ready && <Button onPress={() => void app.connect()}>Connect library</Button>}</View> : <FlatList data={rows} keyExtractor={row => row.kind === "year" ? row.year : row.month.key} contentContainerStyle={listStyle} ListEmptyComponent={<View className="gap-4 py-8"><Text className="text-body text-muted-foreground">Your months will appear here when photos are accessible.</Text><Button onPress={() => void app.connect()}>{Platform.OS === "web" ? "Choose photos" : "Manage photo access"}</Button></View>} renderItem={({ item }) => {
        if (item.kind === "year") {
          // Read-only year summary. Reviewing happens one month at a time, like SwipeWipe and
          // Picnic — there is no whole-year review. Pick a month below.
          const total = item.months.reduce((n, m) => n + m.total, 0), explored = item.months.reduce((n, m) => n + m.explored, 0), complete = item.months.filter(m => m.remaining === 0).length;
          return <View accessible accessibilityRole="header" accessibilityLabel={`${item.year}. ${complete} of ${item.months.length} months complete`} className="mb-3 mt-6 flex-row items-center justify-between gap-3"><View className="flex-1"><Text className="text-h2 text-foreground">{item.year}</Text><Text className="mt-1 text-caption text-muted-foreground">{complete} of {item.months.length} months complete · {plural(total - explored, "photo")} remaining</Text></View>{total === explored && <Icon name="Check" className="text-primary" size={22} />}</View>;
        }
        const m = item.month, complete = m.remaining === 0, title = collectionTitle(item.scope);
        return <Pressable accessibilityRole="button" accessibilityLabel={`${title}. ${complete ? "Complete" : `${explorationPercent(m.explored, m.total)}% explored, ${plural(m.remaining, "photo")} remaining`}`} onPress={() => open(item.scope)} className="mb-3 flex-row items-center gap-4 rounded-2xl border border-border bg-card p-3">
          <CalendarPhoto id={m.coverId} />
          <View className="flex-1"><Text className="text-h5 text-foreground">{title}</Text><Text className="mt-1 text-body text-muted-foreground">{complete ? "Complete" : `${explorationPercent(m.explored, m.total)}% explored · ${plural(m.remaining, "photo")} remaining`}</Text>{!complete && saved.includes(item.scope) && <Text className="mt-1 text-caption text-primary">Resume</Text>}</View><Icon name={complete ? "Check" : "ChevronRight"} size={20} className="text-primary" />
        </Pressable>;
      }} />}
    </View>
  </SafeAreaView>;
}
const thumbnailStyle = { width: 64, height: 72, borderRadius: 10 };
const listStyle = { paddingBottom: 32 };

function CalendarPhoto({ id }: { id?: string }) {
  const [photo, setPhoto] = useState<Media>();
  useEffect(() => {
    let alive = true;
    setPhoto(undefined);
    if (id) void storage.get(id).then(value => { if (alive) setPhoto(value); }).catch(() => {});
    return () => { alive = false; };
  }, [id]);
  return <MediaImage media={photo} style={thumbnailStyle} fit="cover" />;
}
