import {
  ReactNode,
  createContext,
  useState,
  useMemo,
  useContext,
  useCallback,
  useEffect,
} from "react";
import { Theme } from "./Theme";
import lightTheme from "./themes/light";
import { DEFAULT_PASTEL, withPastel, type PastelId } from "./pastels";
import { Platform, View } from "react-native";
import { vars } from "nativewind";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (name: string) => void;
  /** The chosen Playful Adventure background; applied to the light theme only. */
  pastel: PastelId;
  setPastel: (id: PastelId) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: lightTheme,
  setTheme: () => {},
  pastel: DEFAULT_PASTEL,
  setPastel: () => {},
});

export const ThemeProvider = ({
  initialThemeName,
  themes,
  scoped = false,
  children,
}: {
  initialThemeName: string;
  themes: Theme[];
  /** A nested theme for one screen: styles only its own subtree, never the document root. */
  scoped?: boolean;
  children: ReactNode;
}) => {
  if (themes.length === 0) {
    throw new Error("At least one theme must be provided in the ThemeProvider");
  }

  const [pastel, setPastel] = useState<PastelId>(DEFAULT_PASTEL);
  const [baseTheme, setCurrentTheme] = useState<Theme>(() => {
    const theme = themes.find((theme) => theme.name === initialThemeName);
    if (!theme) {
      // eslint-disable-next-line no-console
      console.warn(`Theme '${initialThemeName}' not found, falling back to ${themes[0].name}`);
      return themes[0];
    }
    return theme;
  });

  const setTheme = useCallback(
    (name: string) => {
      const theme = themes.find((theme) => theme.name === name);
      if (!theme) {
        // eslint-disable-next-line no-console
        console.warn(`Theme '${name}' not found, skipping setting theme`);
        return;
      }
      setCurrentTheme(theme);
    },
    [themes],
  );

  const currentTheme = useMemo(() => (scoped ? baseTheme : withPastel(baseTheme, pastel)), [scoped, baseTheme, pastel]);
  const themeContextValue: ThemeContextValue = useMemo(
    () => ({
      theme: currentTheme,
      setTheme,
      pastel,
      setPastel,
    }),
    [currentTheme, setTheme, pastel],
  );

  // Flatten to variables that can be referenced in CSS/Tailwind classes
  // `h1: { fontSize: 24 }` -> Transforms to the following css variable: `--h1-fontSize: 24px`
  const flattenedTypographyVariables = useMemo(() => {
    const flattened: Record<string, string> = {};
    Object.entries(currentTheme.typography).forEach(([typographyItem, values]) => {
      if (values) {
        Object.entries(values).forEach(([key, value]) => {
          if (value !== undefined) {
            flattened[`${typographyItem}-${key}`] = value;
          }
        });
      }
    });
    return flattened;
  }, [currentTheme.typography]);

  // Strip the hsl() from the colors since they're used in the tailwind config with an assumption
  // of just the raw hsl values without the wrapping hsl(...)
  const strippedHslColors = useMemo(() => {
    const stripped: Record<string, string> = {};
    Object.entries(currentTheme.colors).forEach(([key, value]) => {
      if (value.startsWith("hsl(")) {
        stripped[key] = value.replace("hsl(", "").replace(")", "");
      }
    });
    return stripped;
  }, [currentTheme.colors]);

  // Web Modal portals mount under body, outside the themed View.
  // Root variables keep dialogs and portals in the same theme.
  useEffect(() => {
    if (scoped || Platform.OS !== "web" || typeof globalThis.document === "undefined") return;
    const root = globalThis.document.documentElement;
    Object.entries({ ...strippedHslColors, ...flattenedTypographyVariables }).forEach(
      ([key, value]) => {
        root.style.setProperty("--" + key, value);
      },
    );
  }, [scoped, strippedHslColors, flattenedTypographyVariables]);

  return (
    <ThemeContext.Provider value={themeContextValue}>
      <View
        className="h-full w-full"
        style={vars({ ...strippedHslColors, ...flattenedTypographyVariables })}
      >
        {children}
      </View>
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  return useContext(ThemeContext);
};
