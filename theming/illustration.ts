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
  canvasBlue: "#E3EFFB",
  canvasMint: "#E3F3E9",
  canvasLilac: "#EEE7FA",
  canvasBlush: "#FBE7EC",
  canvasButter: "#FBF0D3",
  canvasPeach: "#FDEBD3",
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
