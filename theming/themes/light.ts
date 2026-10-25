import { Theme } from '../Theme';

const lightTheme: Theme = {
  name: 'light',
  colors: {
    background: 'hsl(160 20% 98%)',
    foreground: 'hsl(210 35% 15%)',
    card: 'hsl(0 0% 100%)',
    cardForeground: 'hsl(240 10% 3.9%)',
    popover: 'hsl(0 0% 100%)',
    popoverForeground: 'hsl(240 10% 3.9%)',
    primary: 'hsl(166 64% 29%)',
    primaryForeground: 'hsl(0 0% 100%)',
    secondary: 'hsl(240 4.8% 95.9%)',
    secondaryForeground: 'hsl(240 5.9% 10%)',
    tertiary: 'hsl(214 100% 57.1%)',
    tertiaryForeground: 'hsl(0 0% 98%)',
    muted: 'hsl(240 4.8% 95.9%)',
    mutedForeground: 'hsl(210 12% 43%)',
    accent: 'hsl(157 42% 91%)',
    accentForeground: 'hsl(240 5.9% 10%)',
    success: 'hsl(142 70.6% 45.3%)',
    successForeground: 'hsl(0 0% 98%)',
    warning: 'hsl(45 100% 51%)',
    warningForeground: 'hsl(0 0% 98%)',
    destructive: 'hsl(8 72% 47%)',
    destructiveForeground: 'hsl(0 0% 98%)',
    border: 'hsl(160 14% 89%)',
    notification: 'hsl(240 5.9% 90%)',
    input: 'hsl(240 5.9% 90%)',
    ring: 'hsl(247 100% 64%)',
    overlay: 'hsl(0 0% 0%)',
  },
  typography: {
    h1: {
      fontSize: '32px',
      fontFamily: 'Inter_700Bold',
    },
    h2: {
      fontSize: '24px',
      fontFamily: 'Inter_700Bold',
    },
    h3: {
      fontSize: '20px',
      fontFamily: 'Inter_600SemiBold',
    },
    h4: {
      fontSize: '18px',
      fontFamily: 'Inter_600SemiBold',
    },
    h5: {
      fontSize: '16px',
      fontFamily: 'Inter_500Medium',
    },
    h6: {
      fontSize: '14px',
      fontFamily: 'Inter_500Medium',
    },
    body: {
      fontSize: '14px',
      fontFamily: 'Inter_400Regular',
    },
    caption: {
      fontSize: '12px',
      fontFamily: 'Inter_300Light',
    },
    button: {
      fontSize: '16px',
      fontFamily: 'Inter_500Medium',
    },
  },
};

export default lightTheme;
