import { ScreenHeader } from "@/components/pictopia/navigation-header";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, Platform, Pressable, SectionList, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Icon, Loading, Text } from "@/components/pictopia/ui";
import { usePictopia } from "@/components/pictopia/provider";
import { MediaImage } from "@/components/pictopia/media-image";
import { BadgeArt } from "@/components/pictopia/badge-art";
import { useLift } from "@/components/pictopia/playful";
import type { Media } from "@/lib/pictopia/types";
import { repository, serialize, storage } from "@/services/repository";
import { displayMediaSize } from "@/lib/pictopia/storage-size";
import { mediaService } from "@/services/media";
import { exploreStoreFor } from "@/services/explore";
import { badgeStore } from "@/services/badges";
import { DELETE_BATCH, deleteLabel, deletionOutcome, sizeText, type DeviceOs } from "@/lib/pictopia/review-flow";
import { BADGES, ROMAN, type BadgeFamily } from "@/lib/pictopia/badges";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const PAGE = 300;
const os: DeviceOs = Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web";
// Android 10 and earlier delete without a system prompt, so Pictopia asks first there.
const needsOwnPrompt = Platform.OS === "android" && Number(Platform.Version) < 30;

/** Discarded: everything waiting to be deleted, by month, or (from the end of an adventure)
 * only that adventure's discards. Tap a photo to restore it; long-press to look closer. Only
 * the Delete button sends anything to the OS, and the OS asks before anything leaves. */
export default function Discarded() {
  const app = usePictopia();
  const { session: sessionKey, from, only, auto } = useLocalSearchParams<{ session?: string; from?: string; only?: string; auto?: string }>();
  const autoStarted = useRef(false);
  const [showAll, setShowAll] = useState(only !== "1");
  const lift = useLift(3);
  const [items, setItems] = useState<Media[]>();
  const sizeAttempts = useRef(new Set<string>());
  const [scoped, setScoped] = useState<{ ids: Set<string>; title: string }>();
  const [working, setWorking] = useState(false), [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [result, setResult] = useState<{ headline: string; details: string[]; badge?: { family: BadgeFamily; tier: number } }>();
  const loadEpoch = useRef(0), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; loadEpoch.current++; }; }, []);
  const load = useCallback(async () => {
    const token = ++loadEpoch.current;
    // Read behind outstanding review writes. The queue never flashes an old unmarked
    // snapshot when opened immediately after a discard or Restore.
    const snapshot = await serialize(async () => {
      const rows: Media[] = [];
      for (let offset = 0; ; offset += PAGE) {
        const page = await storage.query({ decision: "delete", order: "newest", limit: PAGE, offset });
        rows.push(...page);
        if (page.length < PAGE) break;
      }
      let scope: { ids: Set<string>; title: string } | undefined;
      if (typeof sessionKey === "string" && /^(adventure|collection):.+:explore$/.test(sessionKey)) {
        const saved = await exploreStoreFor(sessionKey).load();
        if (saved) scope = { ids: new Set(saved.ids.filter(id => saved.records[id]?.queued)), title: "From this adventure" };
      }
      return { items: rows.filter(m => !m.deletedAt), scope };
    });
    if (mounted.current && token === loadEpoch.current) { setItems(snapshot.items); setScoped(snapshot.scope); }
  }, [sessionKey]);
  useEffect(() => {
    if (!app.ready) return;
    void load().catch(() => { if (mounted.current) app.setError("Your marked photos couldn’t load. Please try again."); });
  }, [app.revision, app.ready, load]);
  useEffect(() => {
    let alive = true;
    const missing = (items ?? []).filter(m => m.size === undefined && m.scan?.size === undefined && !sizeAttempts.current.has(`${m.id}:${m.modified}`));
    void (async () => {
      for (const m of missing) {
        if (!alive) return;
        sizeAttempts.current.add(`${m.id}:${m.modified}`);
        try {
          const size = await mediaService.size(m);
          if (size === undefined || !Number.isFinite(size) || size <= 0) continue;
          await repository.update(m.id, latest => latest.modified === m.modified ? { ...latest, size } : latest);
          if (alive) setItems(current => current?.map(item => item.id === m.id && item.modified === m.modified ? { ...item, size } : item));
        } catch { /* Unavailable sizes stay excluded, never converted to zero. */ }
      }
    })();
    return () => { alive = false; };
  }, [items]);
  // Only this adventure's discards, or everything waiting.
  const adventureOnly = !showAll && !!scoped;
  const shown = useMemo(() => (items && adventureOnly ? items.filter(m => scoped?.ids.has(m.id)) : items), [items, adventureOnly, scoped]);
  const sections = useMemo(() => {
    if (!shown) return [];
    const groups = new Map<string, Media[]>();
    for (const m of shown) {
      const key = adventureOnly ? "From this adventure" : monthOf(m.created);
      groups.set(key, [...(groups.get(key) ?? []), m]);
    }
    return [...groups.keys()].map(title => ({ title, data: rows(groups.get(title) ?? []) }));
  }, [shown, adventureOnly]);
  // Everything shown goes in one tap; only an unusually large pile goes in turns.
  const batch = useMemo(() => (shown ?? []).slice(0, DELETE_BATCH), [shown]);
  const kinds = { photos: batch.filter(m => m.type !== "video").length, videos: batch.filter(m => m.type === "video").length };
  const total = shown?.length ?? 0;
  const everything = items?.length ?? 0;
  const bytes = (shown ?? []).reduce((n, m) => n + displayMediaSize(m), 0);
  async function keep(id: string) {
    setNotice(undefined);
    setItems(old => old?.filter(m => m.id !== id));
    try { await repository.restore([id]); await app.refresh(); }
    catch { setNotice("That photo couldn’t be restored. Please try again."); await load().catch(() => {}); }
  }
  async function restoreAll() {
    setWorking(true); setNotice(undefined);
    try {
      const ids = (shown ?? []).map(m => m.id);
      for (let i = 0; i < ids.length; i += 100) await repository.restore(ids.slice(i, i + 100));
      await app.refresh();
      await load().catch(() => {});
      setNotice("Everything here is restored. Nothing was deleted.");
    } catch { setNotice("Some photos couldn’t be restored. Please try again."); }
    finally { setWorking(false); }
  }
  async function remove() {
    if (os === "web") { setNotice("Originals can only be deleted in the Pictopia phone app. Your browser files are untouched and still marked."); return; }
    setConfirming(false); setWorking(true); setNotice(undefined);
    const sent = batch;
    try {
      const outcome = await app.deleteQueue(sent);
      const confirmed = new Set(outcome.confirmed);
      const done = sent.filter(m => confirmed.has(m.id));
      const bytes = done.reduce((n, m) => n + displayMediaSize(m), 0);
      const copy = deletionOutcome(outcome, os, bytes, { photos: done.filter(m => m.type !== "video").length, videos: done.filter(m => m.type === "video").length });
      if (copy.screen === "stay") { setNotice(copy.notice); await load().catch(() => {}); return; }
      const badges = await badgeStore.evaluate().catch(() => undefined);
      setResult({ headline: copy.headline, details: copy.details, badge: badges?.newlyEarned.find(b => b.family === "declutterer") ?? badges?.newlyEarned[0] });
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Deletion didn’t complete. Nothing was deleted, and your photos are still marked.");
    } finally { setWorking(false); }
  }
  // Done returns to wherever the whole flow began: the review's origin when reached from one.
  // "Delete N now" at the end of an adventure: go straight to the device's own prompt.
  useEffect(() => {
    if (auto !== "1" || autoStarted.current || !shown || !scoped || working) return;
    autoStarted.current = true;
    if (!shown.length) return;
    if (needsOwnPrompt) setConfirming(true);
    else void remove();
  });
  function done() {
    if (from === "review" && router.canDismiss()) router.dismiss(2);
    else if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/home");
  }
  if (result) return <SafeAreaView className="flex-1 bg-background">
    <Stack.Screen options={{ title: "Cleared", headerShown: false }} />
    <View className="mx-auto w-full max-w-md px-5"><ScreenHeader title="Cleanup done" onBack={done} /></View>
    <View className="mx-auto w-full max-w-md flex-1 justify-center px-6">
      <View style={lift} className="items-center rounded-[28px] bg-card px-6 py-8">
        <Text className="text-[56px] leading-[64px]">🎉</Text>
        <Text accessibilityRole="header" className="mt-5 text-center text-display text-foreground">{result.headline}</Text>
        {result.details.map(line => <Text key={line} className="mt-3 text-center text-body leading-6 text-muted-foreground">{line}</Text>)}
        {result.badge && (() => { const def = BADGES.find(b => b.family === result.badge?.family); return def ? <View className="mt-5 w-full flex-row items-center gap-3 rounded-2xl bg-sun-soft p-3">
          <BadgeArt family={def.family} tier={result.badge.tier} size={44} />
          <Text className="flex-1 text-body text-foreground">{`New badge · ${def.name} ${ROMAN[result.badge.tier] ?? ""}`}</Text>
        </View> : null; })()}
      </View>
    </View>
    <View className="mx-auto w-full max-w-md px-6 pb-4"><Button onPress={done}>Done</Button></View>
  </SafeAreaView>;
  return <SafeAreaView className="flex-1 bg-background">
    <Stack.Screen options={{ title: "Discarded", headerShown: false }} />
    <View className="mx-auto w-full max-w-3xl flex-1">
      <View className="px-5"><ScreenHeader title="Discarded" backLabel="Back, nothing is deleted" fallback="/(tabs)/home" subtitle={adventureOnly ? "From this adventure" : undefined} /></View>
      {!!shown?.length && <View className="mx-5 mb-3 gap-1 rounded-2xl bg-card p-4">
        <Text className="text-display text-foreground" style={{ fontVariant: ["tabular-nums"] }}>{`${sizeText(bytes)} to delete`}</Text>
        <Text className="text-body text-muted-foreground">{`${total} ${total === 1 ? "photo" : "photos"} waiting. Nothing is deleted until you tap Delete.`}</Text>
      </View>}
      {adventureOnly && everything > total && <Pressable accessibilityRole="button" onPress={() => setShowAll(true)} className="mx-5 mb-1 min-h-11 flex-row items-center justify-between rounded-2xl bg-card px-4 active:opacity-70">
        <Text className="text-button text-foreground">{`See everything in Discarded (${everything})`}</Text>
        <Icon name="ChevronRight" size={18} className="text-muted-foreground" />
      </Pressable>}
      {!!shown?.length && <Text className="mx-5 mt-2 text-caption leading-5 text-muted-foreground">Tap a photo to restore it. Press and hold to look closer.</Text>}
      {!!notice && <View accessibilityRole="alert" className="mx-4 mt-3 flex-row items-start gap-2 rounded-2xl bg-sun-soft p-3">
        <Icon name="Info" size={18} className="mt-0.5 text-foreground" />
        <Text className="flex-1 text-body text-foreground">{notice}</Text>
      </View>}
      {!shown ? <Loading /> : !shown.length ? <View className="flex-1 items-center justify-center gap-3 px-8">
        <View className="h-20 w-20 items-center justify-center rounded-full bg-card"><Icon name="Sparkles" size={34} className="text-sun" /></View>
        <Text className="text-center text-display text-foreground">Nothing in Discarded</Text>
        <Text className="text-center text-body leading-6 text-muted-foreground">Swipe a photo sideways in any adventure to discard it. It waits here until you delete it.</Text>
        <View className="mt-2 w-full max-w-xs"><Button onPress={done}>Done</Button></View>
      </View> : <SectionList
        sections={sections}
        keyExtractor={row => row.map(m => m.id).join("|")}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={listStyle}
        renderSectionHeader={({ section }) => <Text className="mb-2 mt-4 text-headline text-foreground">{`${section.title} · ${section.data.reduce((n, r) => n + r.length, 0)}`}</Text>}
        renderItem={({ item: row }) => <View className="mb-2 flex-row gap-2">
          {row.map(m => <Pressable key={m.id} accessibilityRole="button" accessibilityLabel={`Discarded ${m.type === "video" ? "video" : "photo"}. Tap to restore it`} accessibilityHint="Press and hold to view it full screen" onPress={() => void keep(m.id)} onLongPress={() => router.push({ pathname: "/preview", params: { id: m.id } })} className="aspect-square flex-1 overflow-hidden rounded-2xl bg-card active:opacity-70">
            <MediaImage media={m} className="flex-1" />
            {m.type === "video" && <View className="absolute left-1.5 top-1.5 rounded-full bg-black/50 p-1"><Icon name="Play" size={13} className="text-white" /></View>}
          </Pressable>)}
          {Array.from({ length: 3 - row.length }, (_, i) => <View key={i} className="flex-1" />)}
        </View>}
      />}
      {!!shown?.length && <View className="gap-1 border-t border-border px-5 pb-3 pt-3">
        <Button danger icon="Trash2" disabled={working || app.busy} onPress={() => needsOwnPrompt ? setConfirming(true) : void remove()}>{working ? "Waiting for your device…" : deleteLabel(kinds)}</Button>
        {total > batch.length && <Text className="text-center text-caption text-muted-foreground">{`${total - batch.length} more after this`}</Text>}
        <Pressable accessibilityRole="button" disabled={working} onPress={() => void restoreAll()} className="min-h-11 items-center justify-center"><Text className="text-button text-foreground">Restore all</Text></Pressable>
      </View>}
    </View>
    <Modal visible={confirming} transparent animationType="fade" onRequestClose={() => setConfirming(false)}>
      <View className="flex-1 items-center justify-center bg-overlay/70 px-5">
        <View className="w-full max-w-md rounded-[28px] bg-card p-6">
          <Text className="text-display text-foreground">{`${deleteLabel(kinds)}?`}</Text>
          <Text className="my-4 text-body leading-6 text-muted-foreground">Android won’t ask again on this phone, and some gallery apps don’t keep a Trash. Deleted photos may not be recoverable.</Text>
          <Button danger onPress={() => void remove()}>Delete</Button>
          <Pressable accessibilityRole="button" onPress={() => setConfirming(false)} className="mt-1 min-h-12 items-center justify-center"><Text className="text-button text-foreground">Not now</Text></Pressable>
        </View>
      </View>
    </Modal>
  </SafeAreaView>;
}
function monthOf(created: number) {
  const d = new Date(created);
  return Number.isFinite(created) && created > 0 ? `${MONTHS[d.getMonth()]} ${d.getFullYear()}` : "Undated";
}
function rows(items: Media[]) {
  const out: Media[][] = [];
  for (let i = 0; i < items.length; i += 3) out.push(items.slice(i, i + 3));
  return out;
}
const listStyle = { paddingHorizontal: 16, paddingBottom: 24, paddingTop: 8 };
