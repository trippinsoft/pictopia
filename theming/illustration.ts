/** The illustration palette: flat, warm and restrained, tuned to sit on the ivory/teal UI in
 * light mode and on the deep night background in dark mode. Illustrations read these values
 * directly (SVG needs raw colors); UI chrome keeps using the theme tokens. */
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
}
export const lightArt: ArtPalette = {
  sky: "#F4E7CF",
  skyAlt: "#DDEBE5",
  cloud: "#FFF9EE",
  sun: "#EEA13A",
  teal: "#2A6B6B",
  tealDeep: "#16494B",
  tealLight: "#8DBDB4",
  sage: "#A9C29B",
  moss: "#5F8B66",
  sand: "#E9D2A9",
  sandDeep: "#C9A67A",
  terracotta: "#D46F4D",
  coral: "#EC9C7E",
  rose: "#EFC2B1",
  paper: "#FFFBF3",
  ink: "#22363B",
  grain: "#22363B",
};
export const darkArt: ArtPalette = {
  sky: "#22343A",
  skyAlt: "#1D3A3C",
  cloud: "#3A4F53",
  sun: "#E2A350",
  teal: "#3C8381",
  tealDeep: "#24595A",
  tealLight: "#6FA9A1",
  sage: "#7E9C77",
  moss: "#4F7657",
  sand: "#9C8463",
  sandDeep: "#7D6648",
  terracotta: "#C9694A",
  coral: "#D98E72",
  rose: "#C59C8E",
  paper: "#EDE3D0",
  ink: "#16242A",
  grain: "#000000",
};
