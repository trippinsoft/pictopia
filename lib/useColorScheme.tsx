import { Appearance, useColorScheme as useNativeColorScheme, ColorSchemeName } from 'react-native';

export function useColorScheme() {
  const colorScheme = useNativeColorScheme();

  return {
    colorScheme: colorScheme ?? 'dark',
    isDarkColorScheme: colorScheme === 'dark',
    setColorScheme: (colorScheme: ColorSchemeName) => {
      Appearance.setColorScheme(colorScheme);
    },
    toggleColorScheme: () => {
      Appearance.setColorScheme(colorScheme === 'dark' ? 'light' : 'dark');
    },
  };
}
