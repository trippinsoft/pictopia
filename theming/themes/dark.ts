import { Theme } from "../Theme";

const darkTheme: Theme = {
  name: "dark",
  colors: {
    background: "hsl(210 30% 9%)",
    foreground: "hsl(160 15% 94%)",
    card: "hsl(210 25% 13%)",
    cardForeground: "hsl(0 0% 98%)",
    popover: "hsl(240 10% 3.9%)",
    popoverForeground: "hsl(0 0% 98%)",
    primary: "hsl(164 53% 65%)",
    primaryForeground: "hsl(210 35% 12%)",
    secondary: "hsl(240 3.7% 15.9%)",
    secondaryForeground: "hsl(0 0% 98%)",
    tertiary: "hsl(214 100% 57.1%)",
    tertiaryForeground: "hsl(0 0% 98%)",
    muted: "hsl(240 3.7% 15.9%)",
    mutedForeground: "hsl(210 12% 68%)",
    accent: "hsl(167 28% 17%)",
    accentForeground: "hsl(0 0% 98%)",
    success: "hsl(142 70.6% 45.3%)",
    successForeground: "hsl(0 0% 98%)",
    warning: "hsl(45 100% 51%)",
    warningForeground: "hsl(0 0% 98%)",
    destructive: "hsl(8 85% 69%)",
    destructiveForeground: "hsl(210 35% 12%)",
    border: "hsl(210 18% 22%)",
    notification: "hsl(240 3.7% 15.9%)",
    input: "hsl(240 3.7% 15.9%)",
    ring: "hsl(247 100% 64%)",
    overlay: "hsl(0 0% 0%)",
  },
  typography: {
    h1: {
      fontSize: "32px",
      fontFamily: "Inter_700Bold",
    },
    h2: {
      fontSize: "24px",
      fontFamily: "Inter_700Bold",
    },
    h3: {
      fontSize: "20px",
      fontFamily: "Inter_600SemiBold",
    },
    h4: {
      fontSize: "18px",
      fontFamily: "Inter_600SemiBold",
    },
    h5: {
      fontSize: "16px",
      fontFamily: "Inter_500Medium",
    },
    h6: {
      fontSize: "14px",
      fontFamily: "Inter_500Medium",
    },
    body: {
      fontSize: "14px",
      fontFamily: "Inter_400Regular",
    },
    caption: {
      fontSize: "12px",
      fontFamily: "Inter_300Light",
    },
    button: {
      fontSize: "16px",
      fontFamily: "Inter_500Medium",
    },
  },
};

export default darkTheme;
