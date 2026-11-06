/** Playful Adventure 1.0 ships light only. Dark tokens and the saved System/Light/Dark choice are
 * kept so dark mode can return by flipping this flag and adding dark pastel values. */
export const DARK_MODE_ENABLED = false;
export const nativeScheme = (appearance: "system" | "light" | "dark") =>
  !DARK_MODE_ENABLED ? "light" : appearance === "system" ? "unspecified" : appearance;
