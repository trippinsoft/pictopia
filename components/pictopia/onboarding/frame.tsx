import type { ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Icon, Text } from "@/components/pictopia/ui";

/** One onboarding screen: optional progress dots (or a close ✕ in their place), a top action
 * (e.g. Back), scrolling content, and the actions pinned to the bottom so the main button never
 * moves between steps. */
export function OnboardingFrame({ children, footer, dots, onTopAction, topAction, onClose }: {
  children: ReactNode;
  footer: ReactNode;
  dots?: { count: number; index: number };
  topAction?: string;
  onTopAction?: () => void;
  onClose?: () => void;
}) {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right", "bottom"]}>
      <View className="mx-auto h-14 w-full max-w-md flex-row items-center justify-between px-5">
        {onClose ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} className="-ml-3 h-12 w-12 items-center justify-center rounded-full active:bg-foreground/10">
            <Icon name="X" size={24} className="text-muted-foreground" />
          </Pressable>
        ) : null}
        <View className="flex-row gap-1.5" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {dots ? Array.from({ length: dots.count }, (_, i) => (
            <View key={i} className={`h-2 rounded-full ${i === dots.index ? "w-6 bg-foreground" : "w-2 bg-foreground/20"}`} />
          )) : null}
        </View>
        {topAction && onTopAction ? (
          <Pressable accessibilityRole="button" onPress={onTopAction} className="min-h-12 min-w-12 items-end justify-center">
            <Text className="text-h5 text-muted-foreground">{topAction}</Text>
          </Pressable>
        ) : null}
      </View>
      <ScrollView contentContainerClassName="mx-auto w-full max-w-md flex-grow justify-center px-6 pb-4" bounces={false}>
        {children}
      </ScrollView>
      <View className="mx-auto w-full max-w-md gap-1 px-6 pb-3 pt-2">{footer}</View>
    </SafeAreaView>
  );
}

/** The quiet secondary action under a main button. */
export function QuietAction({ children, onPress }: { children: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} className="min-h-12 items-center justify-center">
      <Text className="text-h5 text-muted-foreground">{children}</Text>
    </Pressable>
  );
}
