import { memo, useEffect, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import type { AdventureKind } from "@/lib/pictopia/adventures";
import type { Media } from "@/lib/pictopia/types";
import { storage } from "@/services/storage";
import { mediaService } from "@/services/media";
import { Illustration, artForKind } from "./illustration";

/** Painted artwork for an Adventure: a portrait cover for Home's choices and a wide header
 * for the finish screen. WebP, sized for 3× screens (covers 600 px wide, headers 1200 × 600).
 * Kinds without artwork yet fall back to the drawn illustration system. */
interface Art {
  cover: number;
  finish: number;
}
/** Artwork by Adventure theme. `duplicates` has no Adventure kind yet: it is wired in by
 * adding that kind to ART below once a Duplicates Adventure exists. */
export const ART_THEMES = {
  timeMachine: {
    cover: require("@/assets/images/adventures/time-machine-cover.webp"),
    finish: require("@/assets/images/adventures/time-machine-finish.webp"),
  },
  onThisDay: {
    cover: require("@/assets/images/adventures/on-this-day-cover.webp"),
    finish: require("@/assets/images/adventures/on-this-day-finish.webp"),
  },
  duplicates: {
    cover: require("@/assets/images/adventures/duplicates-cover.webp"),
    finish: require("@/assets/images/adventures/duplicates-finish.webp"),
  },
  capsule: {
    cover: require("@/assets/images/adventures/capsule-cover.webp"),
    finish: require("@/assets/images/adventures/capsule-finish.webp"),
  },
  screenshots: {
    cover: require("@/assets/images/adventures/screenshots-cover.webp"),
    finish: require("@/assets/images/adventures/screenshots-finish.webp"),
  },
  detour: {
    cover: require("@/assets/images/adventures/detour-cover.webp"),
    finish: require("@/assets/images/adventures/detour-finish.webp"),
  },
  corners: {
    cover: require("@/assets/images/adventures/corners-cover.webp"),
    finish: require("@/assets/images/adventures/corners-finish.webp"),
  },
} satisfies Record<string, Art>;
/** Game review keeps its drawn illustration; Duplicates art awaits that Adventure kind. */
const ART: Partial<Record<AdventureKind, Art>> = {
  year: ART_THEMES.timeMachine,
  month: ART_THEMES.timeMachine,
  day: ART_THEMES.onThisDay,
  capsule: ART_THEMES.capsule,
  screenshots: ART_THEMES.screenshots,
  detour: ART_THEMES.detour,
  random: ART_THEMES.detour,
  corners: ART_THEMES.corners,
};

type PhotoCard = { x: number; y: number; width: number; height: number; rotation?: number };
type ArtLayout = { width: number; height: number; cards: PhotoCard[] };
/** Independent prints on clean artwork plates. Coordinates include the white border. */
const PHOTO_CARDS: Partial<Record<"cover" | "finish", Partial<Record<AdventureKind, ArtLayout>>>> = {
  cover: {
    day: { width: 1056, height: 1872, cards: [
      { x: 400, y: 1230, width: 430, height: 385, rotation: -9 },
      { x: 115, y: 1420, width: 290, height: 300, rotation: 8 },
    ] },
    year: { width: 1056, height: 1872, cards: [
      { x: 90, y: 390, width: 340, height: 345, rotation: -12 },
      { x: 650, y: 375, width: 340, height: 345, rotation: 11 },
      { x: 70, y: 960, width: 300, height: 310, rotation: -8 },
    ] },
    month: { width: 1056, height: 1872, cards: [
      { x: 90, y: 390, width: 340, height: 345, rotation: -12 },
      { x: 650, y: 375, width: 340, height: 345, rotation: 11 },
      { x: 70, y: 960, width: 300, height: 310, rotation: -8 },
    ] },
    detour: { width: 1200, height: 1600, cards: [
      { x: 215, y: 1050, width: 490, height: 430, rotation: -12 },
      { x: 310, y: 1090, width: 490, height: 430, rotation: -1 },
      { x: 415, y: 1130, width: 490, height: 430, rotation: 11 },
    ] },
    random: { width: 1200, height: 1600, cards: [
      { x: 215, y: 1050, width: 490, height: 430, rotation: -12 },
      { x: 310, y: 1090, width: 490, height: 430, rotation: -1 },
      { x: 415, y: 1130, width: 490, height: 430, rotation: 11 },
    ] },
  },
  finish: {
    day: { width: 1984, height: 992, cards: [
      { x: 265, y: 125, width: 350, height: 345, rotation: -10 },
      { x: 150, y: 525, width: 340, height: 340, rotation: -8 },
      { x: 1370, y: 125, width: 350, height: 345, rotation: 10 },
      { x: 1510, y: 530, width: 340, height: 340, rotation: 8 },
    ] },
    year: { width: 1984, height: 992, cards: [
      { x: 325, y: 145, width: 350, height: 345, rotation: -11 },
      { x: 1315, y: 125, width: 350, height: 345, rotation: 10 },
      { x: 75, y: 505, width: 340, height: 340, rotation: -8 },
      { x: 1590, y: 505, width: 340, height: 340, rotation: 8 },
    ] },
    month: { width: 1984, height: 992, cards: [
      { x: 325, y: 145, width: 350, height: 345, rotation: -11 },
      { x: 1315, y: 125, width: 350, height: 345, rotation: 10 },
      { x: 75, y: 505, width: 340, height: 340, rotation: -8 },
      { x: 1590, y: 505, width: 340, height: 340, rotation: 8 },
    ] },
  },
};

function PersonalPhotos({ kind, ids, format }: { kind?: AdventureKind; ids?: string[]; format: "cover" | "finish" }) {
  const layout = kind && PHOTO_CARDS[format]?.[kind];
  const [frame, setFrame] = useState({ width: 0, height: 0 });
  const [photos, setPhotos] = useState<{ uri: string; aspect: number }[]>([]);
  useEffect(() => {
    if (!layout || !ids?.length) { setPhotos([]); return; }
    let active = true;
    void (async () => {
      const picks = await Promise.all(ids.slice(0, 18).map((id) => storage.get(id)));
      const photos = picks.filter((m): m is Media =>
        !!m?.active && !m.deletedAt && m.type === "photo" && (format === "finish" || m.decision !== "delete"));
      const resolved = await Promise.all(photos.slice(0, layout.cards.length).map(async (m) => {
        try {
          return {
            uri: Platform.OS === "web" ? (await mediaService.resolve(m)).uri : m.uri,
            aspect: m.width > 0 && m.height > 0 ? m.width / m.height : 1,
          };
        }
        catch { return undefined; }
      }));
      if (active) setPhotos(resolved.filter((photo): photo is { uri: string; aspect: number } => !!photo?.uri));
    })();
    return () => { active = false; };
  }, [format, ids, layout]);
  if (!layout) return null;
  const scale = Math.max(frame.width / layout.width, frame.height / layout.height);
  const offsetX = (frame.width - layout.width * scale) / 2;
  const offsetY = (frame.height - layout.height * scale) / 2;
  return <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={(event) => setFrame(event.nativeEvent.layout)}>
    {scale > 0 && layout.cards.map((card, index) => {
      const photo = photos[index];
      if (!photo) return null;
      const aspect = photo.aspect;
      const borderFraction = 0.04;
      const innerWidth = Math.min(
        card.width / (1 + borderFraction * 2),
        card.height / (1 / aspect + borderFraction * 2),
      ) * scale;
      const width = innerWidth * (1 + borderFraction * 2);
      const height = innerWidth * (1 / aspect + borderFraction * 2);
      const border = innerWidth * borderFraction;
      return <View
        key={`${index}:${photo.uri}`}
        style={[styles.card, {
          left: offsetX + (card.x + card.width / 2) * scale - width / 2,
          top: offsetY + (card.y + card.height / 2) * scale - height / 2,
          width, height, padding: border,
          transform: [{ rotate: `${card.rotation ?? 0}deg` }],
        }]}
      ><View style={styles.photoWell}><Image
        source={{ uri: photo.uri }}
        contentFit="contain"
        style={StyleSheet.absoluteFill}
      /></View></View>;
    })}
  </View>;
}
const styles = StyleSheet.create({
  card: { position: "absolute", backgroundColor: "#fffdf8", borderRadius: 2,
    shadowColor: "#241b10", shadowOpacity: 0.26, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 5 },
  photoWell: { flex: 1, overflow: "hidden", backgroundColor: "#e5ddd0" },
});

/** Fills its parent (cropped from the centre); the drawn illustration when there's no artwork. */
export const AdventureCover = memo(function AdventureCover({ kind, ids }: { kind?: AdventureKind; ids?: string[] }) {
  const art = kind && ART[kind];
  if (!art) return <Illustration name={artForKind(kind)} />;
  return (
    <View style={StyleSheet.absoluteFill}>
    <Image
      source={art.cover}
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      transition={150}
      accessible={false}
    />
    <PersonalPhotos kind={kind} ids={ids} format="cover" />
    </View>
  );
});

/** A full-width 2:1 header with a transparent background that follows the current theme,
 * or the square finish illustration for kinds without artwork. */
export const AdventureHeader = memo(function AdventureHeader({ kind, ids }: { kind?: AdventureKind; ids?: string[] }) {
  const art = kind && ART[kind];
  if (!art)
    return (
      <View className="h-40 w-40 overflow-hidden rounded-[40px]">
        <Illustration name="finish" square />
      </View>
    );
  return (
    <View className="aspect-[2/1] w-full">
      <Image source={art.finish} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} accessible={false} />
      <PersonalPhotos kind={kind} ids={ids} format="finish" />
    </View>
  );
});
