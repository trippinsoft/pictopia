/** The illustration palette: warm and vibrant, tuned to sit on the purple/sunset UI in
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
  skyAlt: "#E7D5F5",
  cloud: "#FFF9EE",
  sun: "#EEA13A",
  teal: "#8424BF",
  tealDeep: "#441060",
  tealLight: "#C599E9",
  sage: "#DCB7E7",
  moss: "#8552AA",
  sand: "#E9D2A9",
  sandDeep: "#C9A67A",
  terracotta: "#D46F4D",
  coral: "#EC9C7E",
  rose: "#EFC2B1",
  paper: "#FFFBF3",
  ink: "#301343",
  grain: "#301343",
};
export const darkArt: ArtPalette = {
  sky: "#291734",
  skyAlt: "#351F48",
  cloud: "#4E365E",
  sun: "#E2A350",
  teal: "#9C58C8",
  tealDeep: "#633082",
  tealLight: "#C795E6",
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
