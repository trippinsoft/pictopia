import { Pressable, View } from "react-native";
import { AdventureCover } from "./adventure-art";
import { Icon, Text } from "./ui";
import type { AdventureKind } from "@/lib/pictopia/adventures";

export function AdventureTile({ kind, title, detail, ids, disabled, onPress }: {
  kind: AdventureKind; title: string; detail: string; ids?: string[]; disabled?: boolean; onPress(): void;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${title}. ${detail}`} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress} className="min-w-0 flex-1 active:opacity-70">
    <View className="aspect-square overflow-hidden rounded-2xl bg-secondary"><AdventureCover kind={kind} ids={ids} /></View>
    <View className="mt-3 flex-row items-start gap-1"><Text className="flex-1 text-h5 text-foreground">{title}</Text><Icon name="ArrowUpRight" size={18} className="mt-0.5 text-primary" /></View>
    <Text className="mt-1 text-caption leading-5 text-muted-foreground">{detail}</Text>
  </Pressable>;
}
