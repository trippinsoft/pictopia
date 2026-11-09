import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { albumCoverReader } from "@/services/album-covers";
import type { AlbumSummary } from "@/services/albums.types";
import type { Media } from "@/lib/pictopia/types";
import { plural } from "@/lib/pictopia/text";
import { Icon, Text } from "./ui";
import { MediaImage } from "./media-image";
import { useLift } from "./playful";

function AlbumPlaceholder({ kind }: { kind: AlbumSummary["kind"] }) {
  return <View className="flex-1 items-center justify-center bg-muted">
    <View className="h-16 w-16 items-center justify-center rounded-2xl bg-secondary">
      <Icon name={kind === "folder" ? "Folder" : "BookImage"} size={30} className="text-muted-foreground" />
    </View>
  </View>;
}

/** Failed covers never disable navigation or change the album's collection selection. */
export function AlbumCover({ album, revision = 0 }: { album: AlbumSummary; revision?: number }) {
  const [candidate, setCandidate] = useState<{ media: Media; failed(): void }>();
  useEffect(() => {
    const controller = new AbortController();
    let advance: (() => void) | undefined;
    setCandidate(undefined);
    void albumCoverReader(album.id, controller.signal).then(reader => {
      advance = () => {
        setCandidate(undefined);
        void reader.next().then(media => {
          if (controller.signal.aborted || !media) return;
          let failed = false;
          const next = () => {
            if (failed || controller.signal.aborted) return;
            failed = true;
            advance?.();
          };
          setCandidate({ media, failed: next });
        }).catch(() => { if (!controller.signal.aborted) setCandidate(undefined); });
      };
      if (!controller.signal.aborted) advance();
    }).catch(() => { /* Permission/lookup failure leaves a decorative placeholder. */ });
    return () => { controller.abort(); };
  }, [album.id, revision]);
  const placeholder = <AlbumPlaceholder kind={album.kind} />;
  return <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" className="aspect-square w-full overflow-hidden rounded-[12px] bg-muted">
    {candidate ? <MediaImage key={candidate.media.id} media={candidate.media} fit="cover" style={StyleSheet.absoluteFill} failureContent={placeholder} onSettled={state => { if (state === "failed") candidate.failed(); }} /> : placeholder}
  </View>;
}

export function AlbumCard({ album, percent, revision, progressLoading = false, locked = false }: { album: AlbumSummary; percent?: number; revision?: number; progressLoading?: boolean; locked?: boolean }) {
  const lift = useLift();
  const open = () => router.push(locked ? "/paywall" : { pathname: "/collection-review", params: { scope: `album:${album.id}`, title: album.title } });
  return <Pressable accessibilityRole="button" accessibilityLabel={`${album.title}, ${plural(album.count, "item")}${percent !== undefined ? `, ${percent}% explored` : ""}${locked ? ", Pictopia+" : ""}`} onPress={open} style={lift} className="w-[48.5%] self-start gap-1.5 rounded-[16px] bg-card p-1.5 pb-3 active:opacity-80">
    <AlbumCover album={album} revision={revision} />
    <View className="min-h-10 flex-row items-start justify-between gap-1 px-1 pt-1">
      <Text numberOfLines={2} className="shrink text-h5 text-foreground">{album.title}</Text>
      {locked && <View className="rounded-md bg-primary px-1.5 py-0.5"><Text className="text-[11px] text-sun" style={plusTagText}>PLUS</Text></View>}
    </View>
    <Text className="px-1 text-caption text-muted-foreground">{plural(album.count, "item")}</Text>
    <Text className="px-1 text-caption text-muted-foreground">{percent !== undefined ? `${percent}% explored` : progressLoading ? "Loading progress…" : album.count === 0 ? "No accessible items" : "Progress unavailable"}</Text>
  </Pressable>;
}
const plusTagText = { fontFamily: "Inter_700Bold" };
