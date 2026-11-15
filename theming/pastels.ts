import type { Theme } from "./Theme";

/** The ten Playful Adventure background themes (Cloud is the near-white one). Only the page background and the soft shadow
 * tint change; cards, text, accents and artwork stay identical so every theme reads the same.
 * Each also has a `night` hue for dark mode (see `nightColors`).
 * All pass WCAG AA for ink (13:1+), secondary text (6:1+) and accent text (4.6:1+). */
export const PASTELS = [
  { id: "sky", name: "Sky", swatch: "#E9F4FF", background: "hsl(210 100% 95.7%)", tint: "hsl(210 54.3% 86.3%)", night: [212, 42] },
  { id: "periwinkle", name: "Periwinkle", swatch: "#ECEEFF", background: "hsl(234 100% 96.3%)", tint: "hsl(232 58.7% 87.6%)", night: [234, 34] },
  { id: "lavender", name: "Lavender", swatch: "#F1ECFF", background: "hsl(256 100% 96.3%)", tint: "hsl(258 58.7% 87.6%)", night: [258, 32] },
  { id: "lilac", name: "Lilac", swatch: "#F8ECFA", background: "hsl(291 58.3% 95.3%)", tint: "hsl(288 42.9% 86.3%)", night: [290, 26] },
  { id: "blush", name: "Blush", swatch: "#FFEEF1", background: "hsl(349 100% 96.7%)", tint: "hsl(346 53.1% 87.5%)", night: [346, 28] },
  { id: "peach", name: "Peach", swatch: "#FFF0E6", background: "hsl(24 100% 95.1%)", tint: "hsl(24 62% 84.5%)", night: [22, 28] },
  { id: "butter", name: "Butter", swatch: "#FFF7DC", background: "hsl(46 100% 93.1%)", tint: "hsl(46 65.7% 79.4%)", night: [42, 26] },
  { id: "mint", name: "Mint", swatch: "#E8F8EF", background: "hsl(146 53.3% 94.1%)", tint: "hsl(145 38.8% 83.3%)", night: [152, 26] },
  { id: "stone", name: "Stone", swatch: "#F2F1ED", background: "hsl(48 16.1% 93.9%)", tint: "hsl(44 12.6% 82.9%)", night: [40, 6] },
  { id: "cloud", name: "Cloud", swatch: "#FBFBFD", background: "hsl(240 33.3% 98.8%)", tint: "hsl(222 20.6% 87.6%)", night: [228, 10] },
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

type Pastel = (typeof PASTELS)[number];
/** A pastel's night version: the same hue as a deep page, slightly lifted cards and chips,
 * and a soft rim instead of a shadow tint. `night` is [hue, saturation of the page]. */
export function nightColors(p: Pastel) {
  const [h, s] = p.night;
  const at = (sat: number, light: number) => `hsl(${h} ${sat}% ${light}%)`;
  const card = at(Math.round(s * 0.7), 16);
  const rim = at(Math.round(s * 0.6), 26);
  return {
    background: at(s, 10),
    card,
    popover: card,
    secondary: card,
    muted: at(Math.round(s * 0.65), 21),
    border: rim,
    input: rim,
    tint: at(s, 5),
  };
}

/** Light: only the background and its shadow tint change between pastels. Dark: the pastel's
 * night version (page, cards, chips and rims share its hue). */
export function withPastel(theme: Theme, id: PastelId): Theme {
  const p = pastel(id);
  if (theme.name === "dark") return { ...theme, colors: { ...theme.colors, ...nightColors(p) } };
  if (theme.name !== "light") return theme;
  return { ...theme, colors: { ...theme.colors, background: p.background, border: p.tint, input: p.tint, tint: p.tint } };
}
