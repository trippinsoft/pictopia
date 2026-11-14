import { useCallback, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { Button, Icon, Loading, Text } from "@/components/pictopia/ui";
import { usePictopia } from "@/components/pictopia/provider";
import { InfoSheet, SectionTitle, TabHeader, useLift } from "@/components/pictopia/playful";
import { AlbumCard } from "@/components/pictopia/album-card";
import { MediaImage } from "@/components/pictopia/media-image";
import { Illustration, type ArtName } from "@/components/pictopia/illustration";
import type { IconName } from "@/lib/icons/LucideIcon";
import { adventureStore, type AdventureSlot, type ExploreChoice } from "@/services/adventures";
import { storage } from "@/services/repository";
import { adventurePlace, meaningfulReview, type AdventureKind } from "@/lib/pictopia/adventures";
import { catalogEntry, catalogFor, type CatalogEntry, type CatalogId } from "@/lib/pictopia/catalog";
import type { Media } from "@/lib/pictopia/types";
import { albumService } from "@/services/albums";
import { albumsLabel } from "@/lib/pictopia/albums";
import type { AlbumSummary } from "@/services/albums.types";
import { collectionStore } from "@/services/collections";

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
  const lift = useLift();
  const [choices, setChoices] = useState<Choices>();
  const [parked, setParked] = useState<AdventureSlot[]>([]);
  const [recent, setRecent] = useState<Media>();
  const [recentCount, setRecentCount] = useState<number>();
  const [albums, setAlbums] = useState<AlbumTile[]>();
  const [videos, setVideos] = useState<{ total: number; explored: number; cover?: Media }>();
  const [screenshots, setScreenshots] = useState<{ total: number; bytes: number }>();
  const [favorites, setFavorites] = useState<{ total: number; cover?: Media }>();
  const [busy, setBusy] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [info, setInfo] = useState<CatalogEntry>();
  const [retry, setRetry] = useState(0);
  const hasPhotos = app.ready && app.stats.total > 0;
  useFocusEffect(useCallback(() => {
    if (!hasPhotos) return;
    let alive = true;
    void (async () => {
      try {
        const [c, waiting, [latest]] = await Promise.all([
          adventureStore.choices(),
          adventureStore.unfinished(),
          storage.query({ type: "photo", order: "newest", limit: 1 }),
        ]);
        if (!alive) return;
        setChoices(c); setParked(waiting); setRecent(latest); setMessage(undefined);
        void storage.count({ type: "photo" }).then(({ total }) => { if (alive) setRecentCount(total); }).catch(() => {});
        void storage.count({ type: "photo", screenshot: true }).then(totals => {
          if (alive) setScreenshots(totals);
        }).catch(() => {});
        void Promise.all([
          storage.count({ type: "photo", favorite: true }),
          storage.query({ type: "photo", order: "newest", favorite: true, limit: 1 }),
        ]).then(([{ total }, [cover]]) => {
          if (alive) setFavorites({ total, cover });
        }).catch(() => {});
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
        if (!made) { setMessage("No eligible photos for that one right now. Try another adventure."); return; }
        adventureId = made.id;
      }
      await adventureStore.open(adventureId, app.pro);
      router.push({ pathname: "/vertical-explore", params: { adventure: adventureId } });
    } catch {
      setMessage("That adventure couldn’t be opened. Please try again.");
    } finally {
      setBusy(undefined);
    }
  }
  const otd = unfinished("on-this-day");
  const surprise = unfinished("surprise-me");
  const screenshotSlot = unfinished("screenshot-sweep");
  const screenshotsAvailable = !!choices?.screenshots || (screenshots?.total ?? 0) > 0;
  const bytes = (n: number) => n < 1073741824 ? `${Math.round(n / 1048576)} MB` : `${(n / 1073741824).toFixed(1)} GB`;
  const openPlus = (go: () => void) => app.pro ? go() : router.push("/paywall");

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
            {/* On This Day — always present, info icon on the right so the user can learn
                 what it is even when there's nothing for today. */}
            <ExploreTile
              lift={lift}
              title="On This Day"
              hint={choices.day ? (otd ? `${otd.adventure.hint.detail}${place(otd) ? ` · ${place(otd)}` : ""}` : "Today’s date in earlier years") : "Nothing from today’s date yet — open a past date"}
              art={{ illustration: "onThisDay" }}
              onInfo={() => setInfo(catalogEntry("on-this-day"))}
              badge={busy === "on-this-day" ? "Preparing…" : "Today"}
              onPress={() => void begin("on-this-day")}
            />
            {/* Recents + Favorites — two squares side by side, both personal-library views. */}
            <View className="mt-3 flex-row gap-3">
              <ExploreTile
                square lift={lift}
                title="Recent photos"
                hint={recentCount !== undefined ? `${recentCount.toLocaleString()} photos` : "Newest first"}
                art={{ cover: recent, icon: "Image" }}
                onPress={() => router.push({ pathname: "/collection-review", params: { scope: "recent" } })}
              />
              {favorites?.total ? (
                <ExploreTile
                  square lift={lift}
                  title="Favorites"
                  hint={`${favorites.total.toLocaleString()} photos`}
                  art={{ cover: favorites.cover, icon: "Heart" }}
                  onPress={() => router.push({ pathname: "/collection-review", params: { scope: "favorites" } })}
                />
              ) : (
                <ExploreTile square lift={lift} title="Favorites" hint={favorites ? "Mark photos in Photos" : "Checking…"} art={{ icon: "Heart" }} disabled />
              )}
            </View>
            {/* Surprise Me — curated adventure, full-width landscape. */}
            {choices.detour ? (
              <ExploreTile
                lift={lift}
                title="Surprise Me"
                hint={surprise ? surprise.adventure.hint.detail : "20 photos, drawn from across your years"}
                art={{ illustration: "detour" }}
                badge={busy === "surprise-me" ? "Preparing…" : place(surprise)}
                onInfo={() => setInfo(catalogEntry("surprise-me"))}
                onPress={() => void begin("surprise-me")}
              />
            ) : (
              <ExploreTile lift={lift} title="Surprise Me" hint="Not enough variety yet — try after reviewing a few more months." art={{ illustration: "detour" }} disabled />
            )}

            {/* Screenshot Sweep + Largest videos — two squares side by side. No "Clean up"
                 heading: the whole app is cleanup, so a section for it reads as redundant. */}
            <View className="mt-3 flex-row gap-3">
              {screenshotsAvailable ? (
                <ExploreTile
                  square lift={lift}
                  title="Screenshot Sweep"
                  hint={screenshots ? `${screenshots.total.toLocaleString()} screenshots${screenshots.bytes > 0 ? ` · ${bytes(screenshots.bytes)}` : ""}` : "Oldest first"}
                  art={{ illustration: "screenshots" }}
                  plus={!app.pro}
                  badge={busy === "screenshot-sweep" ? "Preparing…" : app.pro ? place(screenshotSlot) : undefined}
                  onInfo={() => setInfo(catalogEntry("screenshot-sweep"))}
                  onPress={() => openPlus(() => void begin("screenshot-sweep"))}
                />
              ) : (
                <ExploreTile square lift={lift} title="Screenshot Sweep" hint={screenshots ? "Nothing to sweep" : "Looking…"} art={{ illustration: "screenshots" }} plus={!app.pro} disabled />
              )}
              {videos?.total ? (
                <ExploreTile
                  square lift={lift}
                  title="Largest videos"
                  hint={`${videos.total.toLocaleString()} videos · biggest first`}
                  art={{ cover: videos.cover, icon: "HardDrive" }}
                  plus={!app.pro}
                  onPress={() => openPlus(() => router.push({ pathname: "/collection-review", params: { scope: "videos-large" } }))}
                />
              ) : (
                <ExploreTile square lift={lift} title="Largest videos" hint={videos ? "No videos yet" : "Looking…"} art={{ icon: "HardDrive" }} plus={!app.pro} disabled />
              )}
            </View>

            {/* Videos */}
            <SectionTitle>Videos</SectionTitle>
            {videos?.total ? (
              <ExploreTile
                lift={lift}
                title="All videos"
                hint={`${videos.total.toLocaleString()} · oldest first`}
                art={{ cover: videos.cover, icon: "Video" }}
                plus={!app.pro}
                onPress={() => openPlus(() => router.push({ pathname: "/collection-review", params: { scope: "videos" } }))}
              />
            ) : (
              <ExploreTile lift={lift} title="All videos" hint={videos ? "No videos in your library yet." : "Looking for videos…"} art={{ icon: "Video" }} plus={!app.pro} disabled />
            )}

            {/* Albums */}
            <SectionTitle action={albums && albums.length > ALBUMS_SHOWN ? { label: "See all", onPress: () => openPlus(() => router.push("/albums")) } : undefined}>{ALBUMS_LABEL}</SectionTitle>
            {!albumService.supported ? (
              <ExploreTile lift={lift} title={ALBUMS_LABEL} hint="Your phone’s albums appear here in the installed app. Not available in the browser preview." art={{ icon: "FolderOpen" }} disabled />
            ) : albums?.length ? (
              <View className="flex-row flex-wrap items-start justify-between gap-y-3">
                {albums.slice(0, ALBUMS_SHOWN).map(a => <AlbumCard key={a.id} album={a} percent={a.percent} progressLoading={!a.progressLoaded} revision={app.revision} locked={!app.pro} />)}
              </View>
            ) : (
              <ExploreTile lift={lift} title={ALBUMS_LABEL} hint={albums ? "No albums to show yet." : "Reading your albums…"} art={{ icon: "FolderOpen" }} plus={!app.pro} disabled />
            )}
          </>
        )}
      </ScrollView>
      <InfoSheet entry={info} note={info && catalogFor("day") === info && otd ? `Today’s trip: ${otd.adventure.hint.detail}.` : undefined} onClose={() => setInfo(undefined)} />
    </SafeAreaView>
  );
}

/** One unified Explore tile. By default it's a landscape row (108 px tall with a 108 px art
 * panel on the left). `square` turns it into a half-width square card — art on top, text
 * below — so sibling pairs can sit two-up in a `flex-row gap-3`. `disabled` greys the tile
 * but keeps its shape, so empty sections never collapse. */
function ExploreTile({ lift, title, hint, art, plus, disabled, badge, square, onInfo, onPress }: {
  lift: object;
  title: string;
  hint: string;
  /** Prefer a real photo cover; fall back to an illustration or a plain icon. */
  art: { cover?: Media; illustration?: ArtName; icon?: IconName };
  plus?: boolean;
  disabled?: boolean;
  badge?: string;
  square?: boolean;
  onInfo?: () => void;
  onPress?: () => void;
}) {
  const label = `${title}${plus ? ", Pictopia+" : ""}. ${hint}`;
  if (square) {
    const inner = (
      <View style={lift} className={`flex-1 overflow-hidden rounded-[18px] bg-card ${disabled ? "opacity-70" : ""}`}>
        <View className="aspect-square p-1.5"><View className="flex-1 overflow-hidden rounded-[13px] bg-muted"><ArtPanel art={art} /></View></View>
        <View className="gap-1 p-3">
          {!!badge && <View className="self-start rounded-md bg-tomato/15 px-1.5 py-0.5"><Text className="text-[11px] uppercase tracking-wider text-tertiary" style={tagStyle}>{badge}</Text></View>}
          <View className="flex-row items-center gap-1.5">
            <Text numberOfLines={1} className="shrink text-h5 text-foreground">{title}</Text>
            {plus && <PlusTag />}
          </View>
          <Text numberOfLines={2} className="text-caption leading-[17px] text-muted-foreground">{hint}</Text>
        </View>
      </View>
    );
    if (disabled || !onPress) return <View accessibilityLabel={label} className="flex-1">{inner}</View>;
    return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} className="flex-1 active:opacity-90">{inner}</Pressable>;
  }
  const row = (
    <View style={lift} className={`h-[108px] flex-row overflow-hidden rounded-[18px] bg-card ${disabled ? "opacity-70" : ""}`}>
      <View className="h-full w-[108px] p-1.5"><View className="flex-1 overflow-hidden rounded-[13px] bg-muted"><ArtPanel art={art} /></View></View>
      <View className="min-w-0 flex-1 flex-row items-center gap-1 py-3 pl-3.5 pr-1.5">
        <View className="min-w-0 flex-1 justify-center gap-1">
          {!!badge && <View className="self-start rounded-md bg-tomato/15 px-1.5 py-0.5"><Text className="text-[11px] uppercase tracking-wider text-tertiary" style={tagStyle}>{badge}</Text></View>}
          <View className="flex-row items-center gap-2">
            <Text numberOfLines={1} className="shrink text-h4 text-foreground">{title}</Text>
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
  // The info button is a sibling overlay, never nested inside the card's Pressable —
  // a button inside a button is invalid on web. `active:` lives on the Pressable, never on
  // the card View: NativeWind upgrades a View with press pseudo-classes into its own
  // Pressable on native, which would claim every tap before onPress can fire.
  return (
    <View className="relative mt-3">
      {disabled || !onPress
        ? <View accessibilityLabel={label}>{row}</View>
        : <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} className="active:opacity-90">{row}</Pressable>}
      {!!onInfo && !disabled && (
        <View className="absolute right-0 top-0">
          <Pressable accessibilityRole="button" accessibilityLabel={`About ${title}`} onPress={onInfo} hitSlop={6} className="h-9 w-9 items-center justify-center active:opacity-60">
            <Icon name="Info" size={16} className="text-muted-foreground" />
          </Pressable>
        </View>
      )}
    </View>
  );
}

function ArtPanel({ art }: { art: { cover?: Media; illustration?: ArtName; icon?: IconName } }) {
  // The art never intercepts a tap: an SVG illustration (and some cover fallbacks) can
  // capture touches on native and make the tile feel dead, so the whole panel is
  // non-interactive and the card's Pressable always receives the tap. Mirrors AlbumCover.
  return (
    <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" className="h-full w-full overflow-hidden bg-muted">
      {art.cover ? (
        <MediaImage media={art.cover} fit="cover" style={StyleSheet.absoluteFill} failureContent={<Fallback art={art} />} />
      ) : (
        <Fallback art={art} />
      )}
    </View>
  );
}

function Fallback({ art }: { art: { illustration?: ArtName; icon?: IconName } }) {
  if (art.illustration) return <Illustration name={art.illustration} />;
  return (
    <View className="flex-1 items-center justify-center bg-secondary">
      <Icon name={art.icon ?? "Image"} size={32} className="text-muted-foreground" />
    </View>
  );
}

function PlusTag() {
  return (
    <View className="shrink-0 rounded-md bg-primary px-1.5 py-0.5">
      <Text className="text-[11px] text-sun" style={tagStyle}>PLUS</Text>
    </View>
  );
}
const tagStyle = { fontFamily: "Inter_700Bold" };
