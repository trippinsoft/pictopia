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
          { name: "swipe", title: "Swipe", icon: "Layers2" },
          { name: "smart", title: "Smart Clean", icon: "Sparkles" },
          { name: "settings", title: "Settings", icon: "Settings2" },
        ] as { name: string; title: string; icon: IconName }[]
      ).map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            tabBarIcon: ({ color }) => <Icon name={t.icon} size={22} color={color} />,
          }}
        />
      ))}
    </Tabs>
  );
}
