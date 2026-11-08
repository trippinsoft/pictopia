import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { Text } from "@/components/ui/text";
import Icon from "@/lib/icons/LucideIcon";

/** Shared secondary-screen navigation. Custom exits retain their own save/cancel behavior. */
export function NavigationBack({ fallback = "/(tabs)/home", onPress, label = "Back" }: {
  fallback?: string; onPress?: () => void; label?: string;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress ?? (() => router.canGoBack() ? router.back() : router.replace(fallback as never))} className="h-12 w-12 shrink-0 items-center justify-center rounded-full bg-card active:opacity-70">
    <Icon name="ChevronLeft" size={24} className="text-foreground" />
  </Pressable>;
}

export function ScreenHeader({ title, subtitle, fallback = "/(tabs)/home", onBack, backLabel, action, showBack = true }: {
  title: string; subtitle?: string; fallback?: string; onBack?: () => void;
  backLabel?: string; action?: ReactNode; showBack?: boolean;
}) {
  return <View className="w-full pb-4 pt-2">
    <View className="min-h-12 flex-row items-center gap-2">
      {showBack && <NavigationBack fallback={fallback} onPress={onBack} label={backLabel} />}
      <Text accessibilityRole="header" className="min-w-0 flex-1 text-h2 text-foreground">{title}</Text>
      {!!action && <View className="min-h-12 shrink-0 items-center justify-center">{action}</View>}
    </View>
    {!!subtitle && <Text className="mt-2 text-body leading-6 text-muted-foreground">{subtitle}</Text>}

  </View>;
}
