import { Appearance, Platform } from "react-native";
import lightTheme from "@/theming/themes/light";
import darkTheme from "@/theming/themes/dark";

// React Native Web does not implement application appearance overrides.
// Only explicit light/dark values override the system; unspecified releases it.
if (Platform.OS === "web" && typeof globalThis.document !== "undefined") {
  const root = globalThis.document.documentElement;
  const system = globalThis.matchMedia("(prefers-color-scheme: dark)");
  const cacheKey = "pictopia.appearance";
  const explicit = (value: string | null) => (value === "light" || value === "dark" ? value : null);
  try {
    const cached = explicit(globalThis.localStorage.getItem(cacheKey));
    if (cached) root.setAttribute("data-theme", cached);
  } catch {
    /* Storage restrictions must never prevent appearance switching. */
  }
  const getScheme = (): "light" | "dark" =>
    explicit(root.getAttribute("data-theme")) ?? (system.matches ? "dark" : "light");
  Appearance.getColorScheme = getScheme;
  const syncSurface = () => {
    const mode = getScheme();
    const theme = mode === "dark" ? darkTheme : lightTheme;
    root.style.backgroundColor = theme.colors.background ?? "";
    if (globalThis.document.body)
      globalThis.document.body.style.backgroundColor = theme.colors.background ?? "";
    root.style.colorScheme = mode;
    root.classList.toggle("dark", mode === "dark");
  };
  Appearance.setColorScheme = (scheme) => {
    const mode = explicit(scheme);
    if (mode) root.setAttribute("data-theme", mode);
    else root.removeAttribute("data-theme");
    try {
      if (mode) globalThis.localStorage.setItem(cacheKey, mode);
      else globalThis.localStorage.removeItem(cacheKey);
    } catch {
      /* The authoritative preference still lives in the local database. */
    }
    syncSurface();
  };
  Appearance.addChangeListener = (listener) => {
    const notify = () => {
      syncSurface();
      listener({ colorScheme: getScheme() });
    };
    system.addEventListener("change", notify);
    const observer = new globalThis.MutationObserver((mutations) => {
      if (mutations.some((m) => m.attributeName === "data-theme")) notify();
    });
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return {
      remove: () => {
        system.removeEventListener("change", notify);
        observer.disconnect();
      },
    };
  };
  syncSurface();
}
