import { memo } from "react";
import { View } from "react-native";
import type { AdventureKind } from "@/lib/pictopia/adventures";
import { Illustration, artForKind, type ArtName } from "./illustration";

/** All decorative artwork uses the app's designed, theme-aware SVG illustrations.
 * Real library photos belong in collection thumbnails, reviews and games. */
export const ART_THEMES = {
  timeMachine: "timeMachine",
  onThisDay: "onThisDay",
  duplicates: "memoryMatch",
  capsule: "capsule",
  screenshots: "screenshots",
  detour: "detour",
  corners: "corners",
} satisfies Record<string, ArtName>;

type AdventureArtProps = { kind?: AdventureKind; ids?: string[] };

/** Shared by Home, Explore and Settings; IDs never become decorative photo overlays. */
export const AdventureCover = memo(function AdventureCover({ kind }: AdventureArtProps) {
  return <Illustration name={artForKind(kind)} />;
});

/** The same designed artwork on completion, without a photographic background plate. */
export const AdventureHeader = memo(function AdventureHeader({ kind }: AdventureArtProps) {
  return <View className="h-28 w-28 overflow-hidden rounded-[28px]">
    <Illustration name={kind ? artForKind(kind) : "finish"} square />
  </View>;
});
