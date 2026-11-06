import { Theme } from "../Theme";
import lightTheme from "./light";
import darkTheme from "./dark";

/** The review stage: photos on true black with neutral glass controls, sharing the Playful
 * Adventure type (Fredoka/Inter) and accents (sun, tomato, grass) with the rest of the app. */
const adventureTheme: Theme = {
  ...darkTheme,
  name: "adventure",
  colors: {
    ...darkTheme.colors,
    background: "hsl(0 0% 0%)",
    foreground: "hsl(36 33% 95%)",
    card: "hsl(0 0% 15%)",
    cardForeground: "hsl(36 33% 95%)",
    popover: "hsl(0 0% 12%)",
    popoverForeground: "hsl(36 33% 95%)",
    primary: lightTheme.colors.sun ?? "hsl(43 100% 59.6%)",
    primaryForeground: "hsl(30 8% 11%)",
    secondary: "hsl(0 0% 20%)",
    secondaryForeground: "hsl(36 33% 95%)",
    muted: "hsl(0 0% 15%)",
    mutedForeground: "hsl(35 6% 63%)",
    accent: "hsl(0 0% 20%)",
    accentForeground: "hsl(36 33% 95%)",
    destructive: "hsl(9 100% 68%)",
    destructiveForeground: "hsl(30 8% 11%)",
    border: "hsl(0 0% 24%)",
    input: "hsl(0 0% 24%)",
    ring: lightTheme.colors.sun ?? "hsl(43 100% 59.6%)",
    tint: "hsl(0 0% 0%)",
    sun: lightTheme.colors.sun,
    sunSoft: "hsl(43 40% 22%)",
    tomato: lightTheme.colors.tomato,
    grass: "hsl(151 50% 52%)",
  },
  typography: lightTheme.typography,
};

export default adventureTheme;
