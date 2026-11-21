/** Storybook landscape palette: warm cream skies, green rolling hills, a purple dashed
 * trail, a sun, and tomato-and-yellow props, no outlines. Illustrations read these raw
 * colors directly (SVG needs them); UI chrome keeps using the theme tokens. */
export interface ArtPalette {
  sky: string;
  skyAlt: string;
  cloud: string;
  sun: string;
  teal: string;
  tealDeep: string;
  tealLight: string;
  sage: string;
  moss: string;
  sand: string;
  sandDeep: string;
  terracotta: string;
  coral: string;
  rose: string;
  paper: string;
  ink: string;
  /** Faint dot texture. */
  grain: string;
  /** Per-adventure artwork backdrops, so each scene reads as its own soft color instead of
   * one shared warm sky. Scenes pick one of these for their full-bleed background. */
  canvasBlue: string;
  canvasMint: string;
  canvasLilac: string;
  canvasBlush: string;
  canvasButter: string;
  canvasPeach: string;
}
export const lightArt: ArtPalette = {
  sky: "#FDEBD3",
  skyAlt: "#F6D9C2",
  cloud: "#FFFFFF",
  sun: "#FFC93C",
  // "teal" tokens are the purple-family in Storybook: the dashed trail, phone frames
  // and other props that read as a cool accent against the warm sky.
  teal: "#7B3FC4",
  tealDeep: "#4C1F8A",
  tealLight: "#C9A6EC",
  // "sage/moss" are the green hills.
  sage: "#A8DCC4",
  moss: "#46A97F",
  sand: "#F0D9A8",
  sandDeep: "#C98B55",
  terracotta: "#FF6B4A",
  coral: "#F89B7A",
  rose: "#F7C2AF",
  paper: "#FFFFFF",
  ink: "#1C2457",
  grain: "#1C2457",
  // Clearly deeper and more saturated than the matching page pastels in Settings, so a
  // scene pops as its own color on any page theme instead of reading as a faded pastel.
  canvasBlue: "#A9D2FB",
  canvasMint: "#A3E4C1",
  canvasLilac: "#CDB5F6",
  canvasBlush: "#F8B2C7",
  canvasButter: "#FBD873",
  canvasPeach: "#FDBE8C",
};
export const darkArt: ArtPalette = {
  sky: "#2A1E36",
  skyAlt: "#3A2947",
  cloud: "#4E365E",
  sun: "#FFC150",
  teal: "#9C58C8",
  tealDeep: "#633082",
  tealLight: "#C795E6",
  sage: "#6FBF9A",
  moss: "#3F8E6A",
  sand: "#A88C60",
  sandDeep: "#866846",
  terracotta: "#E66A4D",
  coral: "#D98E72",
  rose: "#C59C8E",
  paper: "#F7EBD8",
  ink: "#121A3A",
  grain: "#000000",
  canvasBlue: "#1D2838",
  canvasMint: "#1B3127",
  canvasLilac: "#2A1E36",
  canvasBlush: "#39212F",
  canvasButter: "#322817",
  canvasPeach: "#352519",
};

/** Memory Wall "Mountains to the Sea" world by day. The scene shares the Storybook palette above
 * and adds the terrain, building and sea tones the larger world needs. Every colour the wall
 * artwork draws comes from here (or `nightWorld` in dark mode). */
export const worldArt = {
  ...lightArt,
  /** Window panes, their opacity, and the warm light used for lamps and lit windows. */
  glass: "#1C2457", glassOpacity: ".55", lit: "#FFC93C", glow: "#FFD97A", moon: "#FFF6DC", star: "#FFFFFF",
  water: "#A9CDF2", waterLight: "#BFDDF6", skyTop: "#E9F1FC", skyBase: "#DCEBFB",
  snow: "#FFFFFF", mtnBack: "#D5C6F2", mtnMid: "#B9A5E6", mtnFront: "#9D86D6",
  forest: "#2F8F68", forest2: "#3E9E74", grass: "#A8DCC4", grass2: "#8FD1B1", pitch: "#7CC79F", leaf: "#5DB88D",
  field1: "#F3D98C", field2: "#E9C46A", field3: "#BFE3A8", field4: "#D9A066", fieldStripe1: "#E0B94F", fieldStripe4: "#C78A52",
  road: "#F6E7C8", roof1: "#FF6B4A", roof2: "#7B3FC4", roof3: "#F89B7A", roof4: "#46A97F", barnRoof: "#C94A34",
  wall1: "#FFF7E6", wall2: "#FBD9B8", wall3: "#F8E4AE", wall4: "#CDE3FA", wall5: "#F8D3DE",
  stone: "#D8CBB8", stoneD: "#B8A68E", sea: "#7FB5EA", beach: "#F6DFAE", cliff: "#C98B55", cliffShade: "#A86E3F",
  /** Unexplored tiles: soft neutral mosaic (grout + four close shades), no preview of the art. */
  tileGrout: "#EEF2F7", tile1: "#DCE4EE", tile2: "#D4DDE9", tile3: "#E1E8F1", tile4: "#D8E0EB",
  wood: "#8E6A4C", timber: "#A86E3F", hayShade: "#C99A2E", seal: "#8E7A6A", eagle: "#6E4F38", horseDark: "#6E4F38",
} as const;

export type WorldPalette = { [K in keyof typeof worldArt]: string };

/** The same world on a clear moonlit night: every colour one step darker and cooler so the land
 * still reads in full detail, with warm light reserved for windows, lamps and lanterns. */
export const nightWorld: WorldPalette = {
  ...worldArt,
  sky: "#2A3463", skyAlt: "#333E70", cloud: "#46507E", sun: "#E9B64A",
  teal: "#7556C2", tealDeep: "#3E2A78", tealLight: "#9D88DA",
  sage: "#4F7C6E", moss: "#2F7656", sand: "#A08B66", sandDeep: "#7E5A3C",
  terracotta: "#CC5A43", coral: "#BE7C67", rose: "#B98E86", paper: "#DCDDEB", ink: "#0C1030", grain: "#0C1030",
  glass: "#0C1030", glassOpacity: ".6", lit: "#FFC857", glow: "#FFD97A", moon: "#FFF4D6", star: "#F4F1FF",
  water: "#2D4F84", waterLight: "#3A6298", skyTop: "#0D1434", skyBase: "#1B2654",
  snow: "#C9D4EE", mtnBack: "#3C4282", mtnMid: "#30366E", mtnFront: "#262B5C",
  forest: "#17423A", forest2: "#1F4E43", grass: "#2B5649", grass2: "#244A3F", pitch: "#2E6450", leaf: "#2C6A51",
  field1: "#7A6E4A", field2: "#706340", field3: "#45684C", field4: "#6A503A", fieldStripe1: "#665A3A", fieldStripe4: "#563F2E",
  road: "#6C6A7E", roof1: "#AE503E", roof2: "#5B3C98", roof3: "#A87160", roof4: "#2C7254", barnRoof: "#86392E",
  wall1: "#B4B1C6", wall2: "#AE998E", wall3: "#ADA182", wall4: "#7A8FB4", wall5: "#A98A9A",
  stone: "#6C6B84", stoneD: "#54536C", sea: "#1C3768", beach: "#857A68", cliff: "#6A5042", cliffShade: "#48352A",
  tileGrout: "#1A2032", tile1: "#2B3349", tile2: "#273045", tile3: "#2F384E", tile4: "#293248",
  wood: "#5A4434", timber: "#744E36", hayShade: "#86682A", seal: "#5A5250", eagle: "#2A2238", horseDark: "#3E2E26",
};
/** The Big Picture palette for the current theme. */
export const worldPalette = (dark: boolean): WorldPalette => (dark ? nightWorld : worldArt);
