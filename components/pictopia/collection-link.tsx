import { Pressable, View } from "react-native";
import { MediaImage } from "./media-image";
import { Icon, Text } from "./ui";
import type { Media } from "@/lib/pictopia/types";
import type { IconName } from "@/lib/icons/LucideIcon";

/** Decorative thumbnails never record an exploration encounter. */
export function CollectionLink({ title, detail, photo, icon, onPress }: {
  title: string; detail: string; photo?: Media; icon: IconName; onPress(): void;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${title}. ${detail}`} onPress={onPress} className="min-h-24 flex-row items-center gap-4 border-b border-border py-4 active:opacity-70">
    <View className="h-16 w-16 items-center justify-center overflow-hidden rounded-xl bg-secondary">
      {photo ? <MediaImage media={photo} className="h-full w-full" /> : <Icon name={icon} size={26} className="text-primary" />}
    </View>
    <View className="flex-1"><Text className="text-h5 text-foreground">{title}</Text><Text className="mt-1 text-caption leading-5 text-muted-foreground">{detail}</Text></View>
    <Icon name="ChevronRight" size={20} className="text-primary" />
  </Pressable>;
}
