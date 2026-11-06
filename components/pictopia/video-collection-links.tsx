import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import type { Media } from "@/lib/pictopia/types";
import { Icon, Text } from "./ui";
import { MediaImage } from "./media-image";
import { useLift } from "./playful";

/** Fixed icon columns and flexible text keep both video destinations readable on narrow screens. */
export function VideoCollectionLinks({ videos }: { videos: { total: number; explored: number; cover?: Media } }) {
  const lift = useLift();
  return (
    <View style={lift} className="overflow-hidden rounded-[18px] bg-card">
      <Pressable accessibilityRole="button" accessibilityLabel={`Videos, oldest first. ${videos.total} videos, ${Math.floor((100 * videos.explored) / videos.total)}% explored`} onPress={() => router.push({ pathname: "/collection-review", params: { scope: "videos" } })} className="min-h-[76px] flex-row items-center gap-3 border-b border-border px-3.5 py-3 active:opacity-70">
        <View className="h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-muted">
          {videos.cover && <MediaImage media={videos.cover} fit="cover" style={StyleSheet.absoluteFill} failureContent={<View className="flex-1 bg-muted" />} />}
          <View className="absolute inset-0 items-center justify-center"><View className="rounded-full bg-black/50 p-1"><Icon name="Play" size={12} className="text-white" /></View></View>
        </View>
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-h4 text-foreground">All videos</Text>
          <Text className="text-caption text-muted-foreground">{`${videos.total.toLocaleString()} · oldest first · ${Math.floor((100 * videos.explored) / videos.total)}% explored`}</Text>
        </View>
        <View className="w-[18px] shrink-0 items-center"><Icon name="ChevronRight" size={18} className="text-muted-foreground" /></View>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Largest videos first" onPress={() => router.push({ pathname: "/collection-review", params: { scope: "videos-large" } })} className="min-h-[76px] flex-row items-center gap-3 px-3.5 py-3 active:opacity-70">
        <View className="h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary"><Icon name="HardDrive" size={20} className="text-foreground" /></View>
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-h4 text-foreground">Largest videos</Text>
          <Text className="text-caption text-muted-foreground">Biggest files first</Text>
        </View>
        <View className="w-[18px] shrink-0 items-center"><Icon name="ChevronRight" size={18} className="text-muted-foreground" /></View>
      </Pressable>
    </View>
  );
}
