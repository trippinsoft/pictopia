import { Appearance, useColorScheme as useNativeColorScheme, ColorSchemeName } from "react-native";

export function useColorScheme() {
  const colorScheme = useNativeColorScheme() === "dark" ? "dark" : "light";

  return {
    colorScheme,
    isDarkColorScheme: colorScheme === "dark",
    setColorScheme: (colorScheme: ColorSchemeName) => {
      Appearance.setColorScheme(colorScheme);
    },
    toggleColorScheme: () => {
      Appearance.setColorScheme(colorScheme === "dark" ? "light" : "dark");
    },
  };
}
