import { Pressable } from 'react-native';
import { setAndroidNavigationBar } from '@/lib/android-navigation-bar';
import LucideIcon from '@/lib/icons/LucideIcon';
import { useColorScheme } from '@/lib/useColorScheme';
import { useTheme } from '@/theming/ThemeProvider';

export function ThemeToggle() {
  const { isDarkColorScheme, setColorScheme } = useColorScheme();
  const { theme } = useTheme();

  function toggleColorScheme() {
    const newColorScheme = isDarkColorScheme ? 'light' : 'dark';
    setColorScheme(newColorScheme);
    setAndroidNavigationBar(newColorScheme, theme.colors.background ?? '');
  }

  return (
    <Pressable
      onPress={toggleColorScheme}
      className="h-11 w-11 items-center justify-center active:opacity-70 web:ring-offset-background web:transition-colors web:focus-visible:outline-none web:focus-visible:ring-2 web:focus-visible:ring-ring web:focus-visible:ring-offset-2">
      {isDarkColorScheme ? (
        <LucideIcon name="MoonStar" className="text-foreground" size={23} strokeWidth={1.25} />
      ) : (
        <LucideIcon name="Sun" className="text-foreground" size={24} strokeWidth={1.25} />
      )}
    </Pressable>
  );
}
