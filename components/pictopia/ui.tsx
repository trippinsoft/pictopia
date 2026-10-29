import React from "react";
import { View, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text } from "@/components/ui/text";
import Icon, { IconName } from "@/lib/icons/LucideIcon";
import { usePictopia } from "./provider";
import { useTheme } from "@/theming/ThemeProvider";
import { router } from "expo-router";
export { Text, Icon };
export function Button({
  children,
  onPress,
  icon,
  secondary = false,
  danger = false,
  disabled = false,
  quiet = false,
  large = false,
}: {
  children: string;
  onPress: () => void;
  icon?: IconName;
  secondary?: boolean;
  danger?: boolean;
  disabled?: boolean;
  /** Ignore presses without dimming, for momentary locks such as a photo mid-transition. */
  quiet?: boolean;
  large?: boolean;
}) {
  const foreground = danger
    ? "text-destructive-foreground"
    : secondary
      ? "text-secondary-foreground"
      : "text-primary-foreground";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || quiet }}
      disabled={disabled || quiet}
      onPress={onPress}
      className={`${large ? "min-h-14" : "min-h-12"} flex-row items-center justify-center gap-2 rounded-2xl px-5 py-3 ${danger ? "bg-destructive" : secondary ? "bg-secondary" : "bg-primary"} ${disabled ? "opacity-40" : "active:scale-[0.98] active:opacity-80"}`}
    >
      <Text className={`text-button ${foreground}`}>{children}</Text>
      {icon && <Icon name={icon} size={18} className={foreground} />}
    </Pressable>
  );
}
export function Page({
  children,
  title,
  subtitle,
  scroll = true,
  compactHeader = false,
}: {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  scroll?: boolean;
  compactHeader?: boolean;
}) {
  const app = usePictopia();
  const body = (
    <View className={`mx-auto w-full max-w-6xl px-5 md:px-10 ${scroll ? "pb-8" : "flex-1 pb-3"}`}>
      <View
        className={`${compactHeader ? "mb-4 mt-4" : "mb-7 mt-7"} flex-row items-center justify-between`}
      >
        <View className="flex-1 pr-3">
          <Text className={`${compactHeader ? "text-h3" : "text-h1"} text-foreground`}>
            {title}
          </Text>
          {!!subtitle && <Text className="mt-2 text-body text-muted-foreground">{subtitle}</Text>}
        </View>
        <Pressable
          accessibilityLabel="Review deletion queue"
          onPress={() => router.push("/queue")}
          className="h-12 w-12 items-center justify-center rounded-full border border-border bg-card"
        >
          <Icon name="Trash2" size={21} className="text-foreground" />
          {app.stats.pending > 0 && (
            <View className="absolute -right-1 -top-1 min-w-5 items-center rounded-full bg-destructive px-1 py-0.5">
              <Text className="text-caption text-destructive-foreground">{app.stats.pending}</Text>
            </View>
          )}
        </Pressable>
      </View>
      {children}
    </View>
  );
  return (
    <SafeAreaView edges={["top", "left", "right"]} className="flex-1 bg-background">
      {scroll ? <ScrollView contentContainerStyle={scrollStyle}>{body}</ScrollView> : body}
    </SafeAreaView>
  );
}
export function Empty({
  icon = "Images",
  title,
  description,
  action,
}: {
  icon?: IconName;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <View className="items-center rounded-3xl border border-border bg-card px-6 py-12">
      <View className="mb-5 h-16 w-16 items-center justify-center rounded-2xl bg-accent">
        <Icon name={icon} size={30} className="text-primary" />
      </View>
      <Text className="text-h3 text-center text-foreground">{title}</Text>
      <Text className="mb-6 mt-3 max-w-sm text-center text-body leading-6 text-muted-foreground">
        {description}
      </Text>
      {action}
    </View>
  );
}
export function Loading() {
  const { theme } = useTheme();
  return (
    <View className="items-center p-10">
      <ActivityIndicator color={theme.colors.primary} />
      <Text className="mt-3 text-body text-muted-foreground">Getting things ready…</Text>
    </View>
  );
}

const scrollStyle = { flexGrow: 1 };
