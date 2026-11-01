import { Theme } from '../Theme';

const lightTheme: Theme = {
  name: 'light',
  colors: {
    background: 'hsl(42 47% 95%)',
    foreground: 'hsl(195 32% 14%)',
    card: 'hsl(43 60% 98.5%)',
    cardForeground: 'hsl(195 32% 14%)',
    popover: 'hsl(43 60% 98.5%)',
    popoverForeground: 'hsl(195 32% 14%)',
    primary: 'hsl(182 62% 20%)',
    primaryForeground: 'hsl(43 60% 97%)',
    secondary: 'hsl(38 36% 90%)',
    secondaryForeground: 'hsl(195 32% 14%)',
    tertiary: 'hsl(214 100% 57.1%)',
    tertiaryForeground: 'hsl(0 0% 98%)',
    muted: 'hsl(38 30% 91%)',
    mutedForeground: 'hsl(195 10% 38%)',
    accent: 'hsl(172 32% 89%)',
    accentForeground: 'hsl(182 62% 18%)',
    success: 'hsl(142 70.6% 45.3%)',
    successForeground: 'hsl(0 0% 98%)',
    warning: 'hsl(45 100% 51%)',
    warningForeground: 'hsl(0 0% 98%)',
    destructive: 'hsl(8 66% 50%)',
    destructiveForeground: 'hsl(43 60% 97%)',
    border: 'hsl(38 26% 85%)',
    notification: 'hsl(38 30% 88%)',
    input: 'hsl(38 26% 85%)',
    ring: 'hsl(182 62% 30%)',
    overlay: 'hsl(0 0% 0%)',
    stage: 'hsl(200 20% 6%)',
    stageForeground: 'hsl(43 40% 96%)',
  },
  typography: {
    h1: {
      fontSize: '32px',
      fontFamily: 'Fraunces_600SemiBold',
    },
    h2: {
      fontSize: '24px',
      fontFamily: 'Fraunces_600SemiBold',
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
    display: {
      fontSize: '34px',
      fontFamily: 'Fraunces_500Medium',
    },
    mark: {
      fontSize: '40px',
      fontFamily: 'Fraunces_500Medium',
    },
    headline: {
      fontSize: '19px',
      fontFamily: 'Fraunces_600SemiBold',
    },
  },
};

export default lightTheme;
