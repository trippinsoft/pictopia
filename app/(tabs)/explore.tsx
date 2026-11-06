import { useCallback, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { Button, Icon, Loading, Text } from "@/components/pictopia/ui";
import { usePictopia } from "@/components/pictopia/provider";
import { AdventureCard, InfoSheet, SectionTitle, TabHeader, useLift } from "@/components/pictopia/playful";
import { VideoCollectionLinks } from "@/components/pictopia/video-collection-links";
import { AlbumCard } from "@/components/pictopia/album-card";
import { MediaImage } from "@/components/pictopia/media-image";
import type { ImageContentPosition } from "expo-image";
import { adventureStore, type AdventureSlot, type ExploreChoice } from "@/services/adventures";
import { storage } from "@/services/repository";
import { adventurePlace, meaningfulReview, type AdventureKind } from "@/lib/pictopia/adventures";
import { catalogEntry, catalogFor, type CatalogEntry, type CatalogId } from "@/lib/pictopia/catalog";
import type { Media } from "@/lib/pictopia/types";
import { albumService } from "@/services/albums";
import { albumsLabel } from "@/lib/pictopia/albums";
import type { AlbumSummary } from "@/services/albums.types";
import { collectionStore } from "@/services/collections";
import { developerFlags } from "@/services/features";
import { featureOpen, type DeveloperFlags } from "@/lib/pictopia/features";

const OTD_FOCUS: ImageContentPosition = { top: "18%" };
type Choices = Awaited<ReturnType<typeof adventureStore.choices>>;
interface YearTile { year: string; percent: number; complete: boolean; cover?: Media }
interface AlbumTile extends AlbumSummary { percent?: number; progressLoaded?: boolean }
const ALBUMS_LABEL = albumsLabel(Platform.OS);
const ALBUMS_SHOWN = 8;
const KINDS: Record<Exclude<CatalogId, "duplicate-hunt">, AdventureKind[]> = {
  "on-this-day": ["day"],
  "time-machine": ["year", "month"],
  "time-capsule": ["capsule"],
  "surprise-me": ["detour", "random"],
  "screenshot-sweep": ["screenshots"],
};

/** Explore: the five adventures by their permanent names, quick cleanups, and the whole
 * library by year. An unfinished adventure shows its place on its own card. */
export default function Explore() {
  const app = usePictopia();
  const lift = useLift();
  const [choices, setChoices] = useState<Choices>();
  const [parked, setParked] = useState<AdventureSlot[]>([]);
  const [years, setYears] = useState<YearTile[]>();
  const [recent, setRecent] = useState<Media>();
  const [albums, setAlbums] = useState<AlbumTile[]>();
  const [videos, setVideos] = useState<{ total: number; explored: number; cover?: Media }>();
  const [busy, setBusy] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [info, setInfo] = useState<CatalogEntry>();
  const [flags, setFlags] = useState<DeveloperFlags>();
  const huntOpen = featureOpen("duplicateHunt", flags);
  const [retry, setRetry] = useState(0);
  const hasPhotos = app.ready && app.stats.total > 0;
  useFocusEffect(useCallback(() => {
    if (!hasPhotos) return;
    let alive = true;
    void (async () => {
      try {
        const [c, waiting, months, [latest]] = await Promise.all([
          adventureStore.choices(),
          adventureStore.unfinished(),
          storage.calendarProgress(),
          storage.query({ type: "photo", order: "newest", limit: 1 }),
        ]);
        const byYear = new Map<string, { total: number; explored: number; coverId?: string }>();
        for (const m of months) {
          if (m.key === "unknown") continue;
          const y = byYear.get(m.key.slice(0, 4)) ?? { total: 0, explored: 0, coverId: m.coverId };
          byYear.set(m.key.slice(0, 4), { total: y.total + m.total, explored: y.explored + m.explored, coverId: y.coverId ?? m.coverId });
        }
        const tiles = await Promise.all([...byYear].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 4).map(async ([year, y]) => ({
          year,
          percent: Math.floor((100 * y.explored) / Math.max(1, y.total)),
          complete: y.total > 0 && y.explored === y.total,
          cover: y.coverId ? await storage.get(y.coverId) : undefined,
        })));
        if (!alive) return;
        setChoices(c); setParked(waiting); setYears(tiles); setRecent(latest); setMessage(undefined);
        void developerFlags.load().then(value => { if (alive) setFlags(value); }).catch(() => {});
        // Videos and albums load after the adventures, so they never hold up the screen.
        const [progress, [firstVideo]] = await Promise.all([storage.videoProgress(), storage.query({ type: "video", order: "newest", limit: 1 })]);
        if (alive) setVideos({ total: progress.total, explored: progress.explored, cover: firstVideo });
        if (!albumService.supported) return;
        const list = await albumService.list();
        if (!alive) return;
        setAlbums(list);
        for (const album of list.slice(0, ALBUMS_SHOWN)) {
          const summary = await collectionStore.summary(`album:${album.id}`).catch(() => undefined);
          if (!alive) return;
          setAlbums(old => old?.map(a => a.id === album.id ? { ...a, progressLoaded: true, percent: summary?.total ? Math.floor((100 * summary.explored) / summary.total) : undefined, count: summary?.total ?? a.count } : a));
        }
      } catch {
        if (alive) setMessage("Explore couldn’t read your library just now.");
      }
    })();
    return () => { alive = false; };
  }, [hasPhotos, app.revision, retry]));

  const unfinished = (id: CatalogId) => parked.find((slot) => id !== "duplicate-hunt" && KINDS[id].includes(slot.adventure.kind));
  const place = (slot?: AdventureSlot) => {
    const p = slot && meaningfulReview(slot.session) ? adventurePlace(slot.session) : undefined;
    return p ? `Continue · ${Math.max(1, slot!.session.ids.indexOf(slot!.session.activeId ?? "") + 1)} of ${p.total}` : undefined;
  };
  async function begin(id: CatalogId) {
    if (busy) return;
    // Closed until scanning and keeper suggestions are verified on devices.
    if (id === "duplicate-hunt") return huntOpen ? router.push(app.pro ? "/duplicate-hunt" : "/paywall") : setInfo(catalogEntry("duplicate-hunt"));
    if (id === "time-machine") return router.push("/time-machine");
    const slot = unfinished(id);
    setBusy(id); setMessage(undefined);
    try {
      let adventureId = slot?.adventure.id;
      if (!adventureId) {
        const choice: ExploreChoice = id === "on-this-day" ? { kind: "day" } : id === "time-capsule" ? { kind: "capsule" } : id === "surprise-me" ? { kind: "detour" } : { kind: "screenshots" };
        const made = await adventureStore.choose(choice);
        if (!made) { setMessage("No eligible photos for that one right now. Try another adventure."); return; }
        adventureId = made.id;
      }
      await adventureStore.open(adventureId);
      router.push({ pathname: "/vertical-explore", params: { adventure: adventureId } });
    } catch {
      setMessage("That adventure couldn’t be opened. Please try again.");
    } finally {
      setBusy(undefined);
    }
  }
  const available = (id: CatalogId) =>
    id === "on-this-day" ? !!choices?.day : id === "time-machine" ? !!choices?.years.length : id === "time-capsule" ? !!choices?.capsule : id === "surprise-me" ? !!choices?.detour : id === "screenshot-sweep" ? !!choices?.screenshots : true;
  const card = (id: CatalogId) => {
    const entry = catalogEntry(id);
    const slot = unfinished(id);
    return (
      <AdventureCard
        entry={entry}
        kind={slot?.adventure.kind}
        badge={busy === id ? "Preparing…" : place(slot)}
        blurb={slot && id === "on-this-day" ? slot.adventure.hint.detail : undefined}
        onPress={() => void begin(id)}
        onInfo={() => setInfo(entry)}
      />
    );
  };
  const grid = (["time-machine", "time-capsule", "surprise-me"] as const).filter(available);
  const otd = unfinished("on-this-day");
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
      <ScrollView contentContainerClassName="mx-auto w-full max-w-lg px-[18px] pb-10 pt-2">
        <TabHeader title="Explore" />
        {!app.ready ? (
          <View className="py-10"><Loading /></View>
        ) : !hasPhotos ? (
          <View style={lift} className="mt-6 gap-4 rounded-[22px] bg-card p-5">
            <Text className="text-h2 text-foreground">Your photos make it personal.</Text>
            <Text className="text-body leading-6 text-muted-foreground">Connect your library to find adventures and collections. Everything stays on this device.</Text>
            <Button disabled={app.busy} onPress={() => void app.connect()}>{app.busy ? "Opening your library…" : Platform.OS === "web" ? "Choose photos" : "Allow photo access"}</Button>
          </View>
        ) : !choices ? (
          message ? (
            <Pressable accessibilityRole="button" onPress={() => setRetry((n) => n + 1)} className="mt-6 min-h-12 justify-center"><Text className="text-body text-destructive">{message} Tap to retry.</Text></Pressable>
          ) : (
            <View className="py-10"><Loading /></View>
          )
        ) : (
          <>
            {!!message && <Text accessibilityRole="alert" className="mt-3 text-body text-destructive">{message}</Text>}
            {available("on-this-day") && (
              <View className="mt-4">
                <AdventureCard
                  entry={catalogEntry("on-this-day")}
                  kind={otd?.adventure.kind}
                  landscape
                  badge={busy === "on-this-day" ? "Preparing…" : "Today"}
                  blurb={otd ? `${otd.adventure.hint.detail} · ${place(otd)}` : catalogEntry("on-this-day").blurb}
                  onPress={() => void begin("on-this-day")}
                  onInfo={() => setInfo(catalogEntry("on-this-day"))}
                  focus={OTD_FOCUS}
                />
              </View>
            )}
            <SectionTitle>Adventures</SectionTitle>
            <View className="flex-row flex-wrap justify-between gap-y-3">
              {grid.map((id) => <View key={id} className="w-[48.5%]">{card(id)}</View>)}
            </View>
            <SectionTitle action={{ label: "See all", onPress: () => router.push("/library") }}>Months & Years</SectionTitle>
            <View className="flex-row gap-2.5">
              {(years ?? []).map((y) => (
                <Pressable key={y.year} accessibilityRole="button" accessibilityLabel={`${y.year}, ${y.complete ? "fully explored" : `${y.percent}% explored`}`} onPress={() => router.push({ pathname: "/collection-review", params: { scope: `year:${y.year}` } })} style={lift} className="flex-1 gap-1.5 rounded-[16px] bg-card p-1.5 pb-2 active:opacity-80">
                  <View className="aspect-square overflow-hidden rounded-[12px] bg-muted">{y.cover && <MediaImage media={y.cover} fit="cover" style={StyleSheet.absoluteFill} />}</View>
                  <View className="flex-row items-center justify-between px-1">
                    <Text className="text-h5 text-foreground">{y.year}</Text>
                    {y.complete ? <View className="rounded-md bg-grass px-1"><Icon name="Check" size={12} className="text-white" /></View> : <Text className="text-[11px] text-muted-foreground">{y.percent}%</Text>}
                  </View>
                </Pressable>
              ))}
            </View>
            <SectionTitle>Collections</SectionTitle>
            <View className="flex-row justify-between">
              {available("screenshot-sweep") && <View className="w-[48.5%]">{card("screenshot-sweep")}</View>}
              <View className="w-[48.5%]">
                <AdventureCard entry={catalogEntry("duplicate-hunt")} badge={huntOpen ? undefined : "Coming soon"} blurb={app.pro || !huntOpen ? catalogEntry("duplicate-hunt").blurb : undefined} onPress={() => void begin("duplicate-hunt")} onInfo={() => setInfo(catalogEntry("duplicate-hunt"))} />
              </View>
            </View>
            <View style={lift} className="mt-3 overflow-hidden rounded-[18px] bg-card">
              <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/collection-review", params: { scope: "recent" } })} className="min-h-14 flex-row items-center gap-3 px-3.5 active:opacity-70">
                <View className="h-8 w-8 overflow-hidden rounded-lg bg-muted">{recent && <MediaImage media={recent} fit="cover" style={StyleSheet.absoluteFill} />}</View>
                <Text className="flex-1 text-h4 text-foreground">Recent photos</Text>
                <Icon name="ChevronRight" size={18} className="text-muted-foreground" />
              </Pressable>
            </View>
            {!!videos?.total && <>
              <SectionTitle>Videos</SectionTitle>
              <VideoCollectionLinks videos={videos} />
            </>}
            {!!albums?.length && <>
              <SectionTitle action={albums.length > ALBUMS_SHOWN ? { label: "See all", onPress: () => router.push("/albums") } : undefined}>{ALBUMS_LABEL}</SectionTitle>
              <View className="flex-row flex-wrap items-start justify-between gap-y-3">
                {albums.slice(0, ALBUMS_SHOWN).map(a => <AlbumCard key={a.id} album={a} percent={a.percent} progressLoading={!a.progressLoaded} revision={app.revision} />)}
              </View>
            </>}
          </>
        )}
      </ScrollView>
      <InfoSheet entry={info} note={info && catalogFor("day") === info && otd ? `Today’s trip: ${otd.adventure.hint.detail}.` : info?.id === "duplicate-hunt" && !huntOpen ? "Coming soon. We’re testing it on real iPhones and Android phones first, so its suggestions are ones you can trust." : undefined} onClose={() => setInfo(undefined)} />
    </SafeAreaView>
  );
}
