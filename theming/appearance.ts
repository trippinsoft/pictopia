/** Light and dark are both available to everyone; Settings › Theme offers System / Light / Dark
 * (saved as `preferences.appearance`, default System, which follows the device). */
export const DARK_MODE_ENABLED = true;
export const nativeScheme = (appearance: "system" | "light" | "dark") =>
  !DARK_MODE_ENABLED ? "light" : appearance === "system" ? "unspecified" : appearance;
