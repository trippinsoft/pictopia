import { Theme } from "../Theme";
import lightTheme from "./light";
import { PASTELS, nightColors } from "../pastels";

// Playful Adventure at night: the light theme's navy ink becomes the sky, cream becomes the
// ink, and the sunshine, tomato and grass accents stay just as bright. `background`, `card`,
// `popover`, `secondary`, `muted`, `border`, `input` and `tint` come from the chosen pastel's
// night version (applied in ThemeProvider); everything else is shared by all ten.
const sky = nightColors(PASTELS[0]);
const cream = "hsl(40 60% 96%)";
const night = "hsl(231 49.5% 14%)";
const darkTheme: Theme = {
  name: "dark",
  colors: {
    ...sky,
    foreground: cream,
    cardForeground: cream,
    popoverForeground: cream,
    primary: cream,
    primaryForeground: night,
    secondaryForeground: cream,
    tertiary: "hsl(9 100% 70%)",
    tertiaryForeground: night,
    mutedForeground: "hsl(225 22% 74%)",
    accent: "hsl(43 45% 22%)",
    accentForeground: cream,
    success: "hsl(151 50% 52%)",
    successForeground: night,
    warning: "hsl(43 100% 59.6%)",
    warningForeground: night,
    destructive: "hsl(9 100% 68%)",
    destructiveForeground: night,
    notification: "hsl(43 45% 22%)",
    ring: cream,
    overlay: "hsl(0 0% 0%)",
    stage: "hsl(0 0% 0%)",
    stageForeground: "hsl(40 25% 95%)",
    feature: "hsl(231 42% 30%)",
    featureForeground: cream,
    sun: "hsl(43 100% 59.6%)",
    sunSoft: "hsl(43 45% 22%)",
    sunPastel: "hsl(46 100% 84%)",
    sunInk: night,
    sunDeep: "hsl(40 90% 45%)",
    tomato: "hsl(9 100% 63%)",
    grass: "hsl(151 50% 48%)",
  },
  typography: lightTheme.typography,
};

export default darkTheme;
