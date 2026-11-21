import lightTheme from './themes/light';
import darkTheme from './themes/dark';
import type { Theme } from './Theme';

/** A neutral backdrop for the welcome artwork in each color scheme. */
export const welcomeThemes: Theme[] = [lightTheme, darkTheme].map(theme => ({
  ...theme,
  colors: {
    ...theme.colors,
    background: darkTheme.colors[theme.name === 'dark' ? 'primaryForeground' : 'foreground'],
  },
  typography: {
    ...theme.typography,
    h1: { ...theme.typography.h1, fontSize: '34px' },
    body: { ...theme.typography.body, fontSize: '18px' },
    button: { ...theme.typography.button, fontSize: '20px' },
  },
}));

export const welcomeWaves = {
  light: { lavender: '#C8ACF2', lime: '#D2ED8A', aqua: '#A0E8E4' },
  dark: { lavender: '#514078', lime: '#455E36', aqua: '#285C67' },
};
