import type { Theme } from "./Theme";

/** The ten Playful Adventure background themes (Cloud is the near-white one). Only the page background and the soft shadow
 * tint change; cards, text, accents and artwork stay identical so every theme reads the same.
 * All pass WCAG AA for ink (13:1+), secondary text (6:1+) and accent text (4.6:1+). */
export const PASTELS = [
  { id: "sky", name: "Sky", swatch: "#E9F4FF", background: "hsl(210 100% 95.7%)", tint: "hsl(210 54.3% 86.3%)" },
  { id: "periwinkle", name: "Periwinkle", swatch: "#ECEEFF", background: "hsl(234 100% 96.3%)", tint: "hsl(232 58.7% 87.6%)" },
  { id: "lavender", name: "Lavender", swatch: "#F1ECFF", background: "hsl(256 100% 96.3%)", tint: "hsl(258 58.7% 87.6%)" },
  { id: "lilac", name: "Lilac", swatch: "#F8ECFA", background: "hsl(291 58.3% 95.3%)", tint: "hsl(288 42.9% 86.3%)" },
  { id: "blush", name: "Blush", swatch: "#FFEEF1", background: "hsl(349 100% 96.7%)", tint: "hsl(346 53.1% 87.5%)" },
  { id: "peach", name: "Peach", swatch: "#FFF0E6", background: "hsl(24 100% 95.1%)", tint: "hsl(24 62% 84.5%)" },
  { id: "butter", name: "Butter", swatch: "#FFF7DC", background: "hsl(46 100% 93.1%)", tint: "hsl(46 65.7% 79.4%)" },
  { id: "mint", name: "Mint", swatch: "#E8F8EF", background: "hsl(146 53.3% 94.1%)", tint: "hsl(145 38.8% 83.3%)" },
  { id: "stone", name: "Stone", swatch: "#F2F1ED", background: "hsl(48 16.1% 93.9%)", tint: "hsl(44 12.6% 82.9%)" },
  { id: "cloud", name: "Cloud", swatch: "#FBFBFD", background: "hsl(240 33.3% 98.8%)", tint: "hsl(222 20.6% 87.6%)" },
] as const;
export type PastelId = (typeof PASTELS)[number]["id"];
export const DEFAULT_PASTEL: PastelId = "sky";
export function pastel(id: string | undefined) {
  return PASTELS.find((p) => p.id === id) ?? PASTELS[0];
}
export const isPastel = (id: unknown): id is PastelId => PASTELS.some((p) => p.id === id);
/** Retired themes map to their closest remaining one so a saved choice keeps a similar look. */
const RETIRED: Record<string, PastelId> = { seafoam: "mint" };
export function savedPastel(id: unknown): PastelId {
  if (isPastel(id)) return id;
  return (typeof id === "string" && RETIRED[id]) || DEFAULT_PASTEL;
}

/** Only the background and its shadow tint change between pastels. */
export function withPastel(theme: Theme, id: PastelId): Theme {
  if (theme.name !== "light") return theme;
  const p = pastel(id);
  return { ...theme, colors: { ...theme.colors, background: p.background, border: p.tint, input: p.tint, tint: p.tint } };
}
