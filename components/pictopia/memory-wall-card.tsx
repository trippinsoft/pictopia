import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { Icon, Text } from "./ui";
import { useLift } from "./playful";
import { usePictopia } from "./provider";
import { WallCanvas } from "./memory-wall";
import { useMemoryWall } from "./use-memory-wall";
import { OVERVIEW_TILE, UNDATED, yearComplete } from "@/lib/pictopia/memory-wall";
import { worldArt } from "@/theming/illustration";

/** Progress tab entry: a miniature wall plus the shared library percentage. Opens the full wall. */
export function MemoryWallCard() {
  const app = usePictopia();
  const lift = useLift();
  const { model, percent } = useMemoryWall();
  const dated = model?.years.filter((y) => y.key !== UNDATED) ?? [];
  const complete = dated.filter(yearComplete).length;
  const value = percent === undefined ? "—" : `${percent}%`;
  const caption = app.permission?.limited ? "of your shared photos explored" : "of your photos explored";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`The Big Picture. ${value} ${caption}${dated.length ? `, ${complete} of ${dated.length} years complete` : ""}. Open The Big Picture.`}
      onPress={() => router.push("/memory-wall")}
      style={lift}
      className="mt-4 flex-row items-center gap-3.5 rounded-[20px] bg-card p-2.5 active:opacity-80"
    >
      <View pointerEvents="none" className="w-[104px] overflow-hidden rounded-[12px] bg-muted">
        {model && model.photos > 0 ? <WallCanvas model={model} tileSize={OVERVIEW_TILE} labels={false} gap={1.5} /> : <View style={placeholder} />}
      </View>
      <View className="flex-1 gap-0.5">
        <Text className="text-h5 text-foreground">The Big Picture</Text>
        <Text className="text-[38px] leading-[42px] text-foreground" style={display}>{value}</Text>
        <Text className="text-caption text-muted-foreground">{caption}</Text>
        {dated.length > 0 && <Text className="mt-1 text-caption text-foreground">{complete} of {dated.length} {dated.length === 1 ? "year" : "years"} complete</Text>}
      </View>
      <Icon name="ChevronRight" size={20} className="text-muted-foreground" />
    </Pressable>
  );
}
const display = { fontFamily: "Fredoka_700Bold" } as const;
const placeholder = { aspectRatio: 360 / 450, backgroundColor: worldArt.tile2 } as const;
