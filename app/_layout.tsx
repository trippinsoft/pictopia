import "@/global.css";
import "@/appearance-polyfill";

import {
  Theme as NavigationTheme,
  ThemeProvider as NavigationThemeProvider,
  DefaultTheme as NavigationDefaultTheme,
  DarkTheme as NavigationDarkTheme,
} from "@react-navigation/native";
import { Stack } from "expo-router/stack";
import { StatusBar } from "expo-status-bar";
import * as React from "react";
import { Platform, View } from "react-native";
import { useColorScheme } from "@/lib/useColorScheme";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { PictopiaProvider, usePictopia } from "@/components/pictopia/provider";
import { systemAppearanceService } from "@/services/system-appearance";
import { ThemeProvider, useTheme } from "@/theming/ThemeProvider";
import darkTheme from "@/theming/themes/dark";
import lightTheme from "@/theming/themes/light";
import {
  useFonts,
  Inter_300Light,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
// Editorial serif for headings; per-weight imports bundle only these two files.
import { Fraunces_500Medium } from "@expo-google-fonts/fraunces/500Medium";
import { Fraunces_600SemiBold } from "@expo-google-fonts/fraunces/600SemiBold";
// Playful Adventure display face; per-weight imports bundle only these files.
import { Fredoka_500Medium } from "@expo-google-fonts/fredoka/500Medium";
import { Fredoka_600SemiBold } from "@expo-google-fonts/fredoka/600SemiBold";
import { Fredoka_700Bold } from "@expo-google-fonts/fredoka/700Bold";
import { savedPastel } from "@/theming/pastels";
import { DARK_MODE_ENABLED } from "@/theming/appearance";
import { PortalHost } from "@rn-primitives/portal";
import { WebPortalContext } from "@/components/WebPortalContext";
import * as SplashScreen from "expo-splash-screen";

SplashScreen.preventAutoHideAsync();

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from "expo-router";

function RootContent() {
  const { ready, error, prefs } = usePictopia();
  const hasMounted = React.useRef(false);
  const hasShownContent = React.useRef(false);
  const [portalContainer, setPortalContainer] = React.useState<View | null>(null);
  const { isDarkColorScheme } = useColorScheme();
  const { theme, setTheme, pastel, setPastel } = useTheme();
  // Playful Adventure 1.0 is light only. The dark tokens stay, so System/Light/Dark can
  // return later without rebuilding the design; the saved appearance choice is kept.
  const dark = DARK_MODE_ENABLED && isDarkColorScheme;
  const chosenPastel = savedPastel(prefs.theme);
  const [isColorSchemeLoaded, setIsColorSchemeLoaded] = React.useState(false);

  const [fontsLoaded, fontError] = useFonts({
    Inter_300Light,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Fraunces_500Medium,
    Fraunces_600SemiBold,
    Fredoka_500Medium,
    Fredoka_600SemiBold,
    Fredoka_700Bold,
  });
  const isLoadingFonts = !fontsLoaded && !fontError;
  const appearanceReady =
    (ready || !!error) && theme.name === (dark ? "dark" : "light") && (!!error || pastel === chosenPastel);

  const navigationTheme: NavigationTheme = React.useMemo(() => {
    const navigationThemeBase = dark ? NavigationDarkTheme : NavigationDefaultTheme;
    const baseColors = navigationThemeBase.colors;
    return {
      ...navigationThemeBase,
      colors: {
        ...baseColors,
        background: theme.colors.background ?? baseColors.background,
        border: theme.colors.border ?? baseColors.border,
        card: theme.colors.card ?? baseColors.card,
        notification: theme.colors.destructive ?? baseColors.notification,
        primary: theme.colors.primary ?? baseColors.primary,
        text: theme.colors.foreground ?? baseColors.text,
      },
    };
  }, [theme, dark]);

  React.useEffect(() => {
    if (dark && theme.name !== "dark") setTheme("dark");
    if (!dark && theme.name !== "light") setTheme("light");
  }, [dark, theme.name, setTheme]);

  React.useEffect(() => {
    if (ready && pastel !== chosenPastel) setPastel(chosenPastel);
  }, [ready, pastel, chosenPastel, setPastel]);

  React.useEffect(() => {
    if (Platform.OS !== "web") {
      void systemAppearanceService
        .sync(theme.colors.background ?? "", theme.name === "dark")
        .catch(() => {});
      return;
    }
    if (typeof globalThis.document === "undefined") return;
    const root = globalThis.document.documentElement;
    root.style.backgroundColor = theme.colors.background ?? "";
    root.style.colorScheme = theme.name;
    root.classList.toggle("dark", theme.name === "dark");
    globalThis.document.body.style.backgroundColor = theme.colors.background ?? "";
  }, [theme]);

  React.useEffect(() => {
    if (hasMounted.current) {
      return;
    }

    if (Platform.OS === "web" && typeof document !== "undefined") {
      // Adds the background color to the html element to prevent white background on overscroll.
      // eslint-disable-next-line no-undef
      document.documentElement.classList.add("bg-background");
    }
    setIsColorSchemeLoaded(true);
    hasMounted.current = true;
  }, []);

  React.useEffect(() => {
    if (!isLoadingFonts && appearanceReady) {
      SplashScreen.hideAsync();
    }
  }, [isLoadingFonts, appearanceReady]);

  if (!isColorSchemeLoaded || isLoadingFonts || (!hasShownContent.current && !appearanceReady)) {
    return null;
  }

  hasShownContent.current = true;

  return (
    <WebPortalContext.Provider
      value={{ container: portalContainer as unknown as HTMLElement | null }}
    >
      <NavigationThemeProvider value={navigationTheme}>
        <StatusBar style={dark ? "light" : "dark"} />
        <Stack
          screenOptions={() => ({
            headerStyle: {
              backgroundColor: theme.colors.background,
              borderBottomColor: theme.colors.border,
            },
            headerTintColor: theme.colors.foreground,
            headerTitleAlign: "center",
            headerTitleStyle: {
              fontFamily: theme.typography.h1?.fontFamily,
            },

            headerShown: false,
          })}
        >
          <Stack.Screen name="settings" options={{ title: "Settings", presentation: "modal" }} />
          <Stack.Screen name="on-this-day" options={{ title: "On This Day" }} />
          <Stack.Screen name="time-machine" options={{ title: "The Yearbook" }} />
          <Stack.Screen name="pit-stops" options={{ title: "Pit Stops" }} />
          <Stack.Screen name="pit-stop" options={{ title: "Pit Stop" }} />
          {/* Review layers: iOS swipe-to-dismiss would fight vertical scrolling; ✕ and Android Back close them. */}
          <Stack.Screen name="vertical-explore" options={{ title: "Adventure", gestureEnabled: false, fullScreenGestureEnabled: false }} />
          <Stack.Screen name="collection-review" options={{ title: "Photo review", gestureEnabled: false, fullScreenGestureEnabled: false }} />
          <Stack.Screen name="queue" options={{ title: "Discarded" }} />
          <Stack.Screen
            name="index"
            options={{
              title: "Pictopia",
              headerShown: false,
            }}
          />
        </Stack>
        {
          // View used as a portal container on web
          <View
            // eslint-disable-next-line react-native/no-inline-styles
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              pointerEvents: "none",
            }}
            ref={setPortalContainer}
          />
        }
        {
          // PortalHost used as a portal container on native
          <PortalHost />
        }
      </NavigationThemeProvider>
    </WebPortalContext.Provider>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider
      initialThemeName="light"
      themes={[lightTheme, darkTheme]}
    >
      <GestureHandlerRootView style={fillStyle}>
        <PictopiaProvider>
          <RootContent />
        </PictopiaProvider>
      </GestureHandlerRootView>
    </ThemeProvider>
  );
}

const fillStyle = { flex: 1 };
