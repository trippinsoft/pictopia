import type { ReactNode } from "react";
import { ThemeProvider } from "@/theming/ThemeProvider";
import adventureTheme from "@/theming/themes/adventure";

const THEMES = [adventureTheme];
/** Dark-on-black theme for an Adventure's subtree (and its body-mounted dialogs on web). */
export function AdventureTheme({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  if (!enabled) return <>{children}</>;
  return <ThemeProvider initialThemeName={adventureTheme.name} themes={THEMES} scoped>{children}</ThemeProvider>;
}
