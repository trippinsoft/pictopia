import { View } from "react-native";
import { Tabs } from "expo-router";
import Icon, { IconName } from "@/lib/icons/LucideIcon";
import { useTheme } from "@/theming/ThemeProvider";
export default function TabLayout() {
  const { theme } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.foreground,
        tabBarInactiveTintColor: theme.colors.mutedForeground,
        tabBarStyle: { backgroundColor: theme.colors.background, borderTopColor: theme.colors.tint ?? theme.colors.border },
        tabBarLabelStyle: { fontFamily: "Inter_600SemiBold", fontSize: 12, lineHeight: 16 },
        tabBarIconStyle: { height: 28, width: 56 },
        tabBarHideOnKeyboard: true,
      }}
    >
      {(
        [
          { name: "home", title: "Home", icon: "House" },
          { name: "explore", title: "Explore", icon: "Compass" },
          // Retired from navigation (code and saved data kept); old links still resolve.
          { name: "swipe", title: "Swipe", icon: "Layers2", hidden: true },
          { name: "smart", title: "Smart Clean", icon: "Sparkles", hidden: true },
          { name: "progress", title: "Progress", icon: "ChartNoAxesCombined" },
        ] as { name: string; title: string; icon: IconName; hidden?: boolean }[]
      ).map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            ...(t.hidden ? { href: null } : {}),
            // The selected tab sits in a sun-yellow pill so it reads at a glance on every pastel.
            tabBarIcon: ({ color, focused }) => (
              <View className={`h-7 w-14 items-center justify-center rounded-full ${focused ? "bg-sun" : ""}`}>
                <Icon name={t.icon} size={21} color={focused ? theme.colors.foreground : color} />
              </View>
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
