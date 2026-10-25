import * as SystemUI from "expo-system-ui";
import * as NavigationBar from "expo-navigation-bar";
import { Platform } from "react-native";
import { SystemAppearanceService } from "./system-appearance.types";
export const systemAppearanceService: SystemAppearanceService = {
  async sync(background, dark) {
    if (Platform.OS === "android") NavigationBar.setStyle(dark ? "dark" : "light");
    await SystemUI.setBackgroundColorAsync(background);
  },
};
