import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Icon, Text } from "./ui";
import { Illustration, type ArtName } from "./illustration";

/** Small uppercase label above a group. */
export function Eyebrow({ children }: { children: string }) {
  return (
    <Text className="mb-2.5 mt-8 text-caption uppercase tracking-[1.6px] text-muted-foreground">
      {children}
    </Text>
  );
}
/** A rounded card that groups rows with hairline dividers. */
export function RowGroup({ children }: { children: ReactNode }) {
  return <View className="overflow-hidden rounded-3xl border border-border bg-card">{children}</View>;
}
/** An illustrated row: thumbnail, title, one line of detail, chevron. */
export function ArtRow({
  art,
  title,
  detail,
  onPress,
  disabled = false,
  first = false,
  trailing,
}: {
  art: ArtName;
  title: string;
  detail: string;
  onPress?: () => void;
  disabled?: boolean;
  first?: boolean;
  trailing?: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${detail}`}
      accessibilityState={{ disabled }}
      disabled={disabled || !onPress}
      onPress={onPress}
      className={`min-h-[76px] flex-row items-center gap-4 px-4 py-3 active:bg-secondary ${first ? "" : "border-t border-border"}`}
    >
      <View className="h-14 w-14 overflow-hidden rounded-2xl">
        <Illustration name={art} square />
      </View>
      <View className="flex-1">
        <Text className="text-h5 text-foreground">{title}</Text>
        <Text className="mt-0.5 text-caption leading-[17px] text-muted-foreground">{detail}</Text>
      </View>
      {trailing ?? (!disabled && <Icon name="ChevronRight" size={18} className="text-muted-foreground" />)}
    </Pressable>
  );
}
/** The common header is shared by all secondary screens. */
export { ScreenHeader } from "./navigation-header";
