import { useCallback, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { Button, Icon, Loading, Text } from "@/components/pictopia/ui";
import { usePictopia } from "@/components/pictopia/provider";
import { SectionTitle, TabHeader, useLift } from "@/components/pictopia/playful";
import { AlbumCard } from "@/components/pictopia/album-card";
import { MediaImage } from "@/components/pictopia/media-image";
import { Illustration, type ArtName } from "@/components/pictopia/illustration";
import type { IconName } from "@/lib/icons/LucideIcon";
import { adventureStore, type AdventureSlot, type ExploreChoice } from "@/services/adventures";
import { storage } from "@/services/repository";
import { adventurePlace, meaningfulReview, type AdventureKind } from "@/lib/pictopia/adventures";
import { type CatalogId } from "@/lib/pictopia/catalog";
import type { Media } from "@/lib/pictopia/types";
import { albumService } from "@/services/albums";
import { albumsLabel } from "@/lib/pictopia/albums";
import type { AlbumSummary } from "@/services/albums.types";
import { collectionStore, RECENTS_LIMIT } from "@/services/collections";
import { useLocalDay } from "@/components/pictopia/use-local-day";
import { lookalikeStore } from "@/services/lookalikes";

type Choices = Awaited<ReturnType<typeof adventureStore.choices>>;
interface AlbumTile extends AlbumSummary { percent?: number; progressLoaded?: boolean }
const ALBUMS_LABEL = albumsLabel(Platform.OS);
const ALBUMS_SHOWN = 8;
const KINDS: Record<Exclude<CatalogId, "duplicate-hunt" | "time-machine" | "time-capsule">, AdventureKind[]> = {
  "on-this-day": ["day"],
  "surprise-me": ["detour", "random"],
  "screenshot-sweep": ["screenshots"],
};

/** Explore: the daily fixed set of adventures and cleanups in the order the audit sets.
 * Every row uses the same tile shape so the whole screen reads as one list. Pit Stops live
 * on Progress as a reward; Timeline (years → months) has its own tab. */
export default function Explore() {
  const app = usePictopia();
  const today = useLocalDay();
  const todayLabel = new Date(`${today}T12:00:00`).toLocaleDateString(undefined, { month: "long", day: "numeric" });
  const lift = useLift();
  const [choices, setChoices] = useState<Choices>();
  const [parked, setParked] = useState<AdventureSlot[]>([]);
  const [recentCount, setRecentCount] = useState<number>();
  const [recents, setRecents] = useState<number>();
  const [albums, setAlbums] = useState<AlbumTile[]>();
  const [videos, setVideos] = useState<{ total: number; explored: number }>();
  const [screenshots, setScreenshots] = useState<{ total: number }>();
  const [favorites, setFavorites] = useState<number>();
  const [lookalikes, setLookalikes] = useState<number>();
  const [busy, setBusy] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [retry, setRetry] = useState(0);
  const hasPhotos = app.ready && app.stats.total > 0;
  useFocusEffect(useCallback(() => {
    if (!hasPhotos) return;
    let alive = true;
    void (async () => {
      try {
        const [c, waiting] = await Promise.all([adventureStore.choices(), adventureStore.unfinished()]);
        if (!alive) return;
        setChoices(c); setParked(waiting); setMessage(undefined);
        void storage.count({ type: "photo" }).then(({ total }) => { if (alive) setRecentCount(total); }).catch(() => {});
        void storage.query({ order: "newest", limit: RECENTS_LIMIT + 50 }).then(rows => {
          if (alive) setRecents(rows.filter(m => !m.deletedAt).slice(0, RECENTS_LIMIT).length);
        }).catch(() => { if (alive) setRecents(0); });
        void collectionStore.summary("screenshots").then(totals => {
          if (alive) setScreenshots(totals);
        }).catch(() => {});
        void lookalikeStore.saved().then(index => { if (alive) setLookalikes(index?.groups.length); }).catch(() => {});
        void storage.count({ type: "photo", favorite: true }).then(({ total }) => {
          if (alive) setFavorites(total);
        }).catch(() => {});
        const progress = await storage.videoProgress();
        if (alive) setVideos({ total: progress.total, explored: progress.explored });
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
  }, [hasPhotos, app.revision, retry, today]));

  const unfinished = (id: Exclude<CatalogId, "duplicate-hunt" | "time-machine" | "time-capsule">) => parked.find(slot => KINDS[id].includes(slot.adventure.kind));
  const place = (slot?: AdventureSlot) => {
    const p = slot && meaningfulReview(slot.session) ? adventurePlace(slot.session) : undefined;
    return p ? `Continue · ${Math.max(1, slot!.session.ids.indexOf(slot!.session.activeId ?? "") + 1)} of ${p.total}` : undefined;
  };
  async function begin(id: CatalogId) {
    if (busy) return;
    if (id === "on-this-day") return router.push("/on-this-day");
    const slot = id === "surprise-me" || id === "screenshot-sweep" ? unfinished(id) : undefined;
    setBusy(id); setMessage(undefined);
    try {
      let adventureId = slot?.adventure.id;
      if (!adventureId) {
        const choice: ExploreChoice = id === "surprise-me" ? { kind: "detour" } : { kind: "screenshots" };
        const made = await adventureStore.choose(choice, Date.now(), app.pro);
        if (!made?.id && id === "screenshot-sweep") {
          const summary = await collectionStore.summary("screenshots");
          if (summary.total && !summary.remaining) {
            router.push({ pathname: "/collection-review", params: { scope: "screenshots" } });
            return;
          }
        }
        if (!made?.id) { setMessage("No eligible photos for that one right now. Try another adventure."); return; }
        adventureId = made.id;
      }
      if (!adventureId) return;
      await adventureStore.open(adventureId, app.pro);
      router.push({ pathname: "/vertical-explore", params: { adventure: adventureId } });
    } catch {
      setMessage("That adventure couldn’t be opened. Please try again.");
    } finally {
      setBusy(undefined);
    }
  }
  const otd = parked.find(slot => slot.adventure.kind === "day" && slot.adventure.source === `day:${today.slice(5)}`);
  const surprise = unfinished("surprise-me");
  const screenshotSlot = unfinished("screenshot-sweep");
  const screenshotsAvailable = screenshots ? screenshots.total > 0 : !!choices?.screenshots;
  const openPlus = (go: () => void) => app.pro ? go() : router.push({ pathname: "/paywall", params: { entry: "Explore" } });

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
            {/* On This Day stays available even when today has no memories. */}
            <ExploreTile
              lift={lift}
              title="On This Day"
              hint={`${todayLabel} · ${choices.day ? (place(otd) ?? "Today’s date in earlier years") : "No memories yet — open a past date"}`}
              art={{ illustration: "onThisDay" }}
              badge={busy === "on-this-day" ? "Preparing…" : "Today"}
              onPress={() => void begin("on-this-day")}
            />
            {/* Extra breathing room sets today's On This Day apart from the library rows below. */}
            <View className="h-5" />
            <View className="mt-3 gap-1.5">
              <ExploreTile
                grouped
                lift={lift}
                title="Recents"
                hint={recents === undefined ? "Checking…" : recents ? `Your latest ${recents.toLocaleString()} · photos, videos & screenshots` : "Nothing new yet"}
                art={{ illustration: "recents" }}
                disabled={!recents}
                onPress={() => router.push({ pathname: "/collection-review", params: { scope: "recents" } })}
              />
              <ExploreTile
                grouped
                lift={lift}
                title="Favorites"
                hint={favorites === undefined ? "Checking…" : favorites ? `${favorites.toLocaleString()} ${favorites === 1 ? "photo" : "photos"}` : "Mark photos in Photos"}
                art={{ illustration: "favorites" }}
                disabled={!favorites}
                onPress={() => router.push({ pathname: "/collection-review", params: { scope: "favorites" } })}
              />
              {/* Surprise Me — curated adventure, full-width landscape. */}
              {choices.detour ? (
                <ExploreTile
                  grouped
                  lift={lift}
                  title="Surprise Me"
                  hint={surprise ? surprise.adventure.hint.detail : "20 photos, drawn from across your years"}
                  art={{ illustration: "detour" }}
                  badge={busy === "surprise-me" ? "Preparing…" : place(surprise)}
                  onPress={() => void begin("surprise-me")}
                />
              ) : (
                <ExploreTile grouped lift={lift} title="Surprise Me" hint="Not enough variety yet — try after reviewing a few more months." art={{ illustration: "detour" }} disabled />
              )}
              {/* All Photos — the whole library, newest first. */}
              <ExploreTile
                grouped
                lift={lift}
                title="All Photos"
                hint={recentCount !== undefined ? `${recentCount.toLocaleString()} photos · newest first` : "Every photo, newest first"}
                art={{ illustration: "allPhotos" }}
                onPress={() => router.push({ pathname: "/collection-review", params: { scope: "recent" } })}
              />
            </View>

            <SectionTitle>Utilities</SectionTitle>
            <View className="gap-3">
              <View className="flex-row gap-3">
                {screenshotsAvailable ? (
                  <ExploreTile
                    utility lift={lift}
                    title="Screenshot Sweep"
                    hint={screenshots ? `${screenshots.total.toLocaleString()} screenshots` : "Oldest first"}
                    art={{ illustration: "screenshots" }}
                    plus
                    badge={busy === "screenshot-sweep" ? "Preparing…" : app.pro ? place(screenshotSlot) : undefined}
                    onPress={() => openPlus(() => void begin("screenshot-sweep"))}
                  />
                ) : (
                  <ExploreTile utility lift={lift} title="Screenshot Sweep" hint={screenshots ? "Nothing to sweep" : "Looking…"} art={{ illustration: "screenshots" }} plus disabled />
                )}
                {videos?.total ? (
                  <ExploreTile
                    utility lift={lift}
                    title="Largest videos"
                    hint={`${videos.total.toLocaleString()} videos · biggest first`}
                    art={{ illustration: "largeVideos" }}
                    plus
                    onPress={() => openPlus(() => router.push({ pathname: "/collection-review", params: { scope: "videos-large" } }))}
                  />
                ) : (
                  <ExploreTile utility lift={lift} title="Largest videos" hint={videos ? "No videos yet" : "Looking…"} art={{ illustration: "largeVideos" }} plus disabled />
                )}
              </View>

              <View className="flex-row gap-3">
                <ExploreTile
                  utility lift={lift}
                  title="Duplicate Hunt"
                  hint={lookalikes ? `${lookalikes.toLocaleString()} ${lookalikes === 1 ? "set" : "sets"} of look-alikes` : "Copies and near-identical shots"}
                  art={{ illustration: "duplicates" }}
                  plus
                  onPress={() => openPlus(() => router.push("/duplicate-hunt"))}
                />
                {videos?.total ? (
                  <ExploreTile
                    utility lift={lift}
                    title="All videos"
                    hint={`${videos.total.toLocaleString()} videos · oldest first`}
                    art={{ illustration: "allVideos" }}
                    plus
                    onPress={() => openPlus(() => router.push({ pathname: "/collection-review", params: { scope: "videos" } }))}
                  />
                ) : (
                  <ExploreTile utility lift={lift} title="All videos" hint={videos ? "No videos yet" : "Looking…"} art={{ illustration: "allVideos" }} plus disabled />
                )}
              </View>
            </View>

            {/* Albums */}
            <SectionTitle action={albums && albums.length > ALBUMS_SHOWN ? { label: "See all", onPress: () => openPlus(() => router.push("/albums")) } : undefined}>{ALBUMS_LABEL}</SectionTitle>
            {!albumService.supported ? (
              <ExploreTile lift={lift} title={ALBUMS_LABEL} hint="Your phone’s albums appear here in the installed app. Not available in the browser preview." art={{ icon: "FolderOpen" }} plus disabled />
            ) : albums?.length ? (
              <View className="flex-row flex-wrap items-start justify-between gap-y-3">
                {albums.slice(0, ALBUMS_SHOWN).map(a => <AlbumCard key={a.id} album={a} percent={a.percent} progressLoading={!a.progressLoaded} revision={app.revision} locked={!app.pro} />)}
              </View>
            ) : (
              <ExploreTile lift={lift} title={ALBUMS_LABEL} hint={albums ? "No albums to show yet." : "Reading your albums…"} art={{ icon: "FolderOpen" }} plus disabled />
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/** One unified Explore tile. By default it's a landscape row (108 px tall with a 108 px art
 * panel on the left). Utilities use half-width cards with matching artwork and text areas. `disabled` greys the tile
 * but keeps its shape, so empty sections never collapse. */
function ExploreTile({ lift, title, hint, art, plus, disabled, badge, utility, grouped, onPress }: {
  lift: object;
  title: string;
  hint: string;
  /** Prefer a real photo cover; fall back to an illustration or a plain icon. */
  art: { cover?: Media; illustration?: ArtName; icon?: IconName };
  plus?: boolean;
  disabled?: boolean;
  badge?: string;
  utility?: boolean;
  grouped?: boolean;
  onPress?: () => void;
}) {
  const label = `${title}${plus ? ", Pictopia+" : ""}. ${hint}${badge ? `. ${badge}` : ""}`;
  if (utility) {
    const cardStyle = [lift, utilityTile];
    const cardClass = "overflow-hidden rounded-[18px] bg-card";
    const content = (
      <>
        <View style={squareArt} className="p-1.5">
          <View className="flex-1 overflow-hidden rounded-[13px] bg-muted"><ArtPanel art={art} wide /></View>
          {plus ? <View pointerEvents="none" className="absolute right-3 top-3"><PlusTag /></View> : null}
          {badge ? <View pointerEvents="none" className="absolute bottom-3 left-3 right-3 items-start">
            <View className="max-w-full rounded-md bg-card px-1.5 py-0.5">
              <Text numberOfLines={1} className="text-[11px] leading-[14px] uppercase tracking-wider text-foreground" style={tagStyle}>{badge}</Text>
            </View>
          </View> : null}
        </View>
        <View className="gap-1 px-3 pb-2 pt-1.5">
          <Text numberOfLines={2} className="text-h3 leading-[23px] text-foreground">{title}</Text>
          <Text numberOfLines={2} ellipsizeMode="tail" className="text-caption leading-[17px] text-muted-foreground">{hint}</Text>
        </View>
      </>
    );
    if (disabled || !onPress) return <View accessibilityLabel={label} style={cardStyle} className={`${cardClass} opacity-70`}>{content}</View>;
    return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={cardStyle} className={`${cardClass} active:opacity-90`}>{content}</Pressable>;
  }
  const row = (
    <View style={lift} className={`h-[108px] flex-row overflow-hidden rounded-[18px] bg-card ${disabled ? "opacity-70" : ""}`}>
      <View className="h-full w-[108px] p-1.5"><View className="flex-1 overflow-hidden rounded-[13px] bg-muted"><ArtPanel art={art} /></View></View>
      <View className="min-w-0 flex-1 flex-row items-center gap-1 py-3 pl-3.5 pr-1.5">
        <View className="min-w-0 flex-1 justify-center gap-1">
          {!!badge && <View className="self-start rounded-md bg-tomato/15 px-1.5 py-0.5"><Text className="text-[11px] uppercase tracking-wider text-tertiary" style={tagStyle}>{badge}</Text></View>}
          <View className="flex-row items-center gap-2">
            <Text numberOfLines={1} className="shrink text-h3 text-foreground">{title}</Text>
            {plus && <PlusTag />}
          </View>
          <Text numberOfLines={2} className="text-caption leading-[17px] text-muted-foreground">{hint}</Text>
        </View>
        {onPress && !disabled ? (
          <View className="w-7 items-center justify-center"><Icon name="ChevronRight" size={18} className="text-muted-foreground" /></View>
        ) : (
          <View className="w-7" />
        )}
      </View>
    </View>
  );
  // `active:` lives on the Pressable, never on
  // the card View: NativeWind upgrades a View with press pseudo-classes into its own
  // Pressable on native, which would claim every tap before onPress can fire.
  return (
    <View className={grouped ? "relative" : "relative mt-3"}>
      {disabled || !onPress
        ? <View accessibilityLabel={label}>{row}</View>
        : <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} className="active:opacity-90">{row}</Pressable>}
    </View>
  );
}

function ArtPanel({ art, wide }: { art: { cover?: Media; illustration?: ArtName; icon?: IconName }; wide?: boolean }) {
  // The art never intercepts a tap: an SVG illustration (and some cover fallbacks) can
  // capture touches on native and make the tile feel dead, so the whole panel is
  // non-interactive and the card's Pressable always receives the tap. Mirrors AlbumCover.
  return (
    <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" className="h-full w-full overflow-hidden bg-muted">
      {art.cover ? (
        <MediaImage media={art.cover} fit="cover" style={StyleSheet.absoluteFill} failureContent={<Fallback art={art} wide={wide} />} />
      ) : (
        <Fallback art={art} wide={wide} />
      )}
    </View>
  );
}

const FEATURE_ART = new Set<ArtName>(["onThisDay", "recents", "favorites", "detour", "allPhotos"]);

function Fallback({ art, wide }: { art: { illustration?: ArtName; icon?: IconName }; wide?: boolean }) {
  if (art.illustration) return <Illustration name={art.illustration} wide={wide} emphasized={FEATURE_ART.has(art.illustration)} />;
  return (
    <View className="flex-1 items-center justify-center bg-secondary">
      <Icon name={art.icon ?? "Image"} size={32} className="text-muted-foreground" />
    </View>
  );
}

function PlusTag() {
  return (
    <View className="shrink-0 rounded-md bg-feature px-1.5 py-0.5">
      <Text className="text-[11px] text-sun" style={tagStyle}>PLUS</Text>
    </View>
  );
}
const tagStyle = { fontFamily: "Inter_700Bold" };
/** Utilities cards use a landscape picture (3:2) so the pairs stay compact on the page. */
const squareArt = { width: "100%", aspectRatio: 1.5, flexShrink: 0 } as const;
// Share row width evenly. The row grows to fit its longest label.
const utilityTile = { flexBasis: 0, flexGrow: 1, minWidth: 0 };
