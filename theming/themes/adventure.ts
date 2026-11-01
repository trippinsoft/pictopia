import { Theme } from "../Theme";
import darkTheme from "./dark";

/** Adventures always view photos on true black, whatever the app's appearance setting. */
const adventureTheme: Theme = {
  ...darkTheme,
  colors: { ...darkTheme.colors, background: "hsl(0 0% 0%)" },
};

export default adventureTheme;
