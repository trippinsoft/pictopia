import { Tabs } from "expo-router";
import Icon, { IconName } from "@/lib/icons/LucideIcon";
import { useTheme } from "@/theming/ThemeProvider";
export default function TabLayout() {
  const { theme } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.mutedForeground,
        tabBarStyle: { backgroundColor: theme.colors.card, borderTopColor: theme.colors.border },
        tabBarLabelStyle: { fontFamily: "Inter_500Medium", fontSize: 11 },
        tabBarHideOnKeyboard: true,
      }}
    >
      {(
        [
          { name: "home", title: "Home", icon: "House" },
          { name: "explore", title: "Explore", icon: "Compass" },
          // Classic timed sessions and Smart Clean stay available (from Settings) with all
          // their saved data, but Adventures are the one way to review from Home.
          { name: "swipe", title: "Swipe", icon: "Layers2", hidden: true },
          { name: "smart", title: "Smart Clean", icon: "Sparkles", hidden: true },
          { name: "settings", title: "Settings", icon: "Settings2" },
        ] as { name: string; title: string; icon: IconName; hidden?: boolean }[]
      ).map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            ...(t.hidden ? { href: null } : {}),
            tabBarIcon: ({ color }) => <Icon name={t.icon} size={22} color={color} />,
          }}
        />
      ))}
    </Tabs>
  );
}
