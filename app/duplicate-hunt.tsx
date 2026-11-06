import { NavigationBack } from "@/components/pictopia/navigation-header";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Modal, Pressable, View } from "react-native";
import { router, Stack, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { AdventureTheme } from "@/components/pictopia/adventure-theme";
import { Button, Icon, Loading, Text } from "@/components/pictopia/ui";
import { MediaImage } from "@/components/pictopia/media-image";
import { usePictopia } from "@/components/pictopia/provider";
import { keeperTags, marksEverything } from "@/lib/pictopia/features";
import { sizeText } from "@/lib/pictopia/review-flow";
import { plural } from "@/lib/pictopia/text";
import type { Group, Media } from "@/lib/pictopia/types";
import { repository, storage } from "@/services/repository";

interface Page { group: Group; items: Media[] }

/** Duplicate Hunt (Pro): one page per group of identical or similar photos, side by side with
 * date, resolution and size. The "Sharpest"/"Largest" tag is advice; nothing is pre-marked.
 * Marks go to the same deletion queue and Ready to delete as every review. */
export default function DuplicateHunt() {
  const app = usePictopia();
  const [pages, setPages] = useState<Page[]>();
  const [height, setHeight] = useState(0);
  const [index, setIndex] = useState(0);
  const [history, setHistory] = useState<string[]>([]);
  const [viewing, setViewing] = useState<Media>();
  const [confirm, setConfirm] = useState<{ page: Page; id: string }>();
  const [error, setError] = useState<string>();
  const load = useCallback(async () => {
    const groups = (await storage.getValue<Group[]>("groups")) ?? [];
    const out: Page[] = [];
    for (const group of groups) {
      const items = (await Promise.all(group.ids.slice(0, 4).map(id => storage.get(id)))).filter((m): m is Media => !!m?.active && !m.deletedAt);
      if (items.length >= 2) out.push({ group, items });
    }
    setPages(out);
  }, []);
  useFocusEffect(useCallback(() => {
    if (!app.pro) return;
    void load().catch(() => setError("Your groups couldn’t load. Please try again."));
  }, [app.pro, app.revision, load]));
  useEffect(() => { if (app.ready && !app.pro) router.replace("/paywall"); }, [app.ready, app.pro]);
  const marked = useMemo(() => new Set((pages ?? []).flatMap(p => p.items.filter(m => m.decision === "delete").map(m => m.id))), [pages]);
  async function setMark(id: string, on: boolean) {
    setError(undefined);
    try {
      await repository.setDecision(id, on ? "delete" : undefined);
      setPages(old => old?.map(p => ({ ...p, items: p.items.map(m => m.id === id ? { ...m, decision: on ? "delete" : undefined } : m) })));
      setHistory(old => on ? [...old, id] : old.filter(other => other !== id));
      void app.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "That couldn’t be saved. Please try again."); }
  }
  function toggle(page: Page, m: Media) {
    if (m.decision === "delete") return void setMark(m.id, false);
    if (marksEverything(page.items.map(i => i.id), marked, m.id)) return setConfirm({ page, id: m.id });
    void setMark(m.id, true);
  }
  const exit = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)/explore"));
  const scanning = app.scan.status === "running";
  return <AdventureTheme enabled><SafeAreaView className="flex-1 bg-background">
    <StatusBar style="light" />
    <Stack.Screen options={{ title: "Duplicate Hunt", headerShown: false, gestureEnabled: false }} />
    <View className="mx-auto w-full max-w-3xl flex-1">
      <View className="flex-row items-center justify-between px-4 pb-2 pt-2">
        <NavigationBack label="Back from Duplicate Hunt" onPress={exit} />
        <View className="flex-1 items-center">
          <Text accessibilityRole="header" className="text-headline text-foreground">Duplicate Hunt</Text>
          {!!pages?.length && <Text className="text-caption text-muted-foreground">{`Group ${Math.min(index + 1, pages.length)} of ${pages.length}`}</Text>}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={`Ready to delete, ${plural(app.stats.pending, "item")} marked`} onPress={() => router.push("/queue")} className="h-12 w-12 items-center justify-center rounded-full bg-card/90 active:opacity-70">
          <Icon name="Trash2" size={22} className="text-foreground" />
          {app.stats.pending > 0 && <View className="absolute -right-1 -top-1 h-5 min-w-5 items-center justify-center rounded-full bg-sun px-1"><Text className="text-[12px] font-bold text-primary-foreground">{app.stats.pending}</Text></View>}
        </Pressable>
      </View>
      {!!error && <Text accessibilityRole="alert" className="mx-4 mb-2 rounded-2xl bg-card px-4 py-2 text-body text-foreground">{error}</Text>}
      {!app.pro || !pages ? <Loading /> : !pages.length ? <View className="flex-1 items-center justify-center gap-3 px-8">
        <View className="h-16 w-16 items-center justify-center rounded-full bg-sun"><Icon name="ScanSearch" size={28} className="text-primary-foreground" /></View>
        <Text className="text-center text-display text-foreground">{app.scan.status === "complete" ? "No look-alikes found" : "Find your look-alikes"}</Text>
        <Text className="text-center text-body leading-6 text-muted-foreground">{app.scan.status === "complete" ? "No identical or near-identical photos turned up among the photos Pictopia can read." : "Pictopia compares your photos on this phone. Nothing is uploaded, and iCloud originals aren’t downloaded."}</Text>
        {scanning ? <Text className="text-body text-sun">{`Scanning… ${app.scan.processed.toLocaleString()} of ${app.scan.total.toLocaleString()}`}</Text>
          : <View className="w-full max-w-xs"><Button onPress={() => void app.scanLibrary().then(load).catch(e => setError(e instanceof Error ? e.message : String(e)))}>{app.scan.status === "paused" ? "Resume scan" : app.scan.status === "complete" ? "Scan again" : "Scan my library"}</Button></View>}
        {scanning && <Pressable accessibilityRole="button" onPress={app.pauseScan} className="min-h-12 justify-center"><Text className="text-button text-foreground">Pause</Text></Pressable>}
      </View> : <View className="min-h-0 flex-1" onLayout={e => setHeight(e.nativeEvent.layout.height)}>
        {height > 0 && <FlatList
          data={pages}
          keyExtractor={p => p.group.id}
          pagingEnabled
          snapToInterval={height}
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          getItemLayout={(_d, i) => ({ length: height, offset: height * i, index: i })}
          onMomentumScrollEnd={e => setIndex(Math.round(e.nativeEvent.contentOffset.y / height))}
          onScroll={e => setIndex(Math.round(e.nativeEvent.contentOffset.y / height))}
          scrollEventThrottle={64}
          renderItem={({ item: page }) => <GroupPage page={page} height={height} onToggle={m => toggle(page, m)} onView={setViewing} />}
        />}
      </View>}
      <View className="flex-row items-center justify-between px-4 pb-3 pt-2">
        <Pressable accessibilityRole="button" accessibilityLabel={history.length ? "Undo the last mark" : "Undo, nothing to undo yet"} disabled={!history.length} onPress={() => void setMark(history[history.length - 1], false)} className={`h-12 flex-row items-center gap-2 rounded-full bg-card/90 px-4 ${history.length ? "" : "opacity-45"}`}>
          <Icon name="Undo2" size={20} className="text-sun" /><Text className="text-button text-sun">Undo</Text>
        </Pressable>
        {app.stats.pending > 0 && <Pressable accessibilityRole="button" onPress={() => router.push("/queue")} className="h-12 flex-row items-center gap-2 rounded-full bg-sun px-4"><Text className="text-button text-primary-foreground">{`Review ${app.stats.pending}`}</Text></Pressable>}
      </View>
    </View>
    <Modal visible={!!viewing} animationType="fade" onRequestClose={() => setViewing(undefined)}>
      <AdventureTheme enabled><SafeAreaView className="flex-1 bg-background">
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setViewing(undefined)} className="m-4 h-12 w-12 items-center justify-center rounded-full bg-card"><Icon name="X" size={22} className="text-foreground" /></Pressable>
        {viewing && <MediaImage media={viewing} fit="contain" className="flex-1" showLoading />}
        {viewing && <Text className="p-4 text-center text-caption text-muted-foreground">{details(viewing)}</Text>}
      </SafeAreaView></AdventureTheme>
    </Modal>
    <Modal visible={!!confirm} transparent animationType="fade" onRequestClose={() => setConfirm(undefined)}>
      <AdventureTheme enabled><View className="flex-1 items-center justify-center bg-black/70 px-6">
        <View className="w-full max-w-sm rounded-[24px] bg-card p-6">
          <Text className="text-display text-foreground">{`Mark all ${confirm?.page.items.length ?? ""}?`}</Text>
          <Text className="my-3 text-body leading-6 text-muted-foreground">None of these would be left once you delete. They stay in your library until you confirm in Ready to delete.</Text>
          <Button danger onPress={() => { if (confirm) void setMark(confirm.id, true); setConfirm(undefined); }}>Mark all</Button>
          <Pressable accessibilityRole="button" onPress={() => setConfirm(undefined)} className="mt-1 min-h-12 items-center justify-center"><Text className="text-button text-foreground">Keep one</Text></Pressable>
        </View>
      </View></AdventureTheme>
    </Modal>
  </SafeAreaView></AdventureTheme>;
}

function GroupPage({ page, height, onToggle, onView }: { page: Page; height: number; onToggle(m: Media): void; onView(m: Media): void }) {
  const tags = keeperTags(page.items.map(m => ({ id: m.id, width: m.width, height: m.height, size: m.size ?? m.scan?.size, sharpness: m.scan?.sharpness })));
  const two = page.items.length === 2;
  return <View style={{ height }} className="justify-center px-3">
    <Text className="mb-3 text-center text-caption text-muted-foreground">{page.group.kind === "exact" ? `${page.items.length} identical copies` : `${page.items.length} similar shots`}</Text>
    <View className="flex-row flex-wrap justify-center gap-2">
      {page.items.map(m => {
        const on = m.decision === "delete";
        return <View key={m.id} className="w-[48.5%] overflow-hidden rounded-2xl bg-card">
          <Pressable accessibilityRole="button" accessibilityLabel={`View this ${page.group.kind === "exact" ? "copy" : "shot"} larger. ${details(m)}`} onPress={() => onView(m)} className={two ? "aspect-[3/4]" : "aspect-square"}>
            <MediaImage media={m} fit="cover" className={`flex-1 ${on ? "opacity-40" : ""}`} />
            {tags[m.id] && <View className="absolute left-2 top-2 rounded-full bg-grass px-2 py-0.5"><Text className="text-[11px] font-bold text-white">{tags[m.id]}</Text></View>}
            {on && <View className="absolute inset-0 items-center justify-center"><View className="rounded-full bg-black/60 px-3 py-1"><Text className="text-caption text-white">Marked</Text></View></View>}
          </Pressable>
          <View className="flex-row items-center gap-1 p-2">
            <Text numberOfLines={2} className="flex-1 text-[11px] leading-4 text-muted-foreground">{details(m)}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={on ? "Keep this one" : "Mark this one for deletion"} onPress={() => onToggle(m)} className={`h-10 w-10 items-center justify-center rounded-full ${on ? "bg-sun" : "bg-secondary"}`}>
              <Icon name={on ? "RotateCcw" : "Trash2"} size={18} className={on ? "text-primary-foreground" : "text-foreground"} />
            </Pressable>
          </View>
        </View>;
      })}
    </View>
  </View>;
}
function details(m: Media) {
  const size = m.size ?? m.scan?.size;
  return [
    new Date(m.created).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }),
    m.width && m.height ? `${m.width}×${m.height}` : undefined,
    size ? sizeText(size) : undefined,
  ].filter(Boolean).join(" · ");
}
