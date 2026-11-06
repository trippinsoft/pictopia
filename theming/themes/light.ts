import { Theme } from '../Theme';
import { PASTELS } from '../pastels';

// Playful Adventure. `background`, `border`, `input` and `tint` come from the chosen pastel
// (applied in ThemeProvider); every other token is shared by all ten pastel themes.
const sky = PASTELS[0];
const lightTheme: Theme = {
  name: 'light',
  colors: {
    background: sky.background,
    foreground: 'hsl(231 49.5% 21%)',
    card: 'hsl(0 0% 100%)',
    cardForeground: 'hsl(231 49.5% 21%)',
    popover: 'hsl(0 0% 100%)',
    popoverForeground: 'hsl(231 49.5% 21%)',
    primary: 'hsl(231 49.5% 21%)',
    primaryForeground: 'hsl(0 0% 100%)',
    secondary: 'hsl(0 0% 100%)',
    secondaryForeground: 'hsl(231 49.5% 21%)',
    tertiary: 'hsl(8 72.4% 44.1%)',
    tertiaryForeground: 'hsl(0 0% 100%)',
    muted: 'hsl(212 51.5% 93.5%)',
    mutedForeground: 'hsl(227 20.6% 39%)',
    accent: 'hsl(46 100% 88%)',
    accentForeground: 'hsl(231 49.5% 21%)',
    success: 'hsl(151 60.5% 29.8%)',
    successForeground: 'hsl(0 0% 100%)',
    warning: 'hsl(43 100% 59.6%)',
    warningForeground: 'hsl(231 49.5% 21%)',
    destructive: 'hsl(8 72.6% 48.6%)',
    destructiveForeground: 'hsl(0 0% 100%)',
    border: sky.tint,
    notification: 'hsl(46 100% 88%)',
    input: sky.tint,
    ring: 'hsl(231 49.5% 21%)',
    overlay: 'hsl(0 0% 0%)',
    stage: 'hsl(0 0% 0%)',
    stageForeground: 'hsl(40 25% 95%)',
    tint: sky.tint,
    sun: 'hsl(43 100% 59.6%)',
    sunSoft: 'hsl(46 100% 88%)',
    tomato: 'hsl(9 100% 61.8%)',
    grass: 'hsl(151 55.2% 41.2%)',
  },
  typography: {
    h1: { fontSize: '31px', fontFamily: 'Fredoka_700Bold' },
    h2: { fontSize: '23px', fontFamily: 'Fredoka_700Bold' },
    h3: { fontSize: '19px', fontFamily: 'Fredoka_600SemiBold' },
    h4: { fontSize: '17px', fontFamily: 'Fredoka_600SemiBold' },
    h5: { fontSize: '16px', fontFamily: 'Inter_600SemiBold' },
    h6: { fontSize: '14px', fontFamily: 'Inter_600SemiBold' },
    body: { fontSize: '16px', fontFamily: 'Inter_400Regular' },
    caption: { fontSize: '13px', fontFamily: 'Inter_500Medium' },
    button: { fontSize: '16px', fontFamily: 'Fredoka_600SemiBold' },
    display: { fontSize: '30px', fontFamily: 'Fredoka_700Bold' },
    mark: { fontSize: '40px', fontFamily: 'Fredoka_700Bold' },
    headline: { fontSize: '19px', fontFamily: 'Fredoka_600SemiBold' },
  },
};

export default lightTheme;
