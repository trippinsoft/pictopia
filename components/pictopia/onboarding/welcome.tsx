import { Image, ScrollView, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { Button, Text } from '@/components/pictopia/ui';
import { Wordmark } from '@/components/pictopia/playful';
import { ThemeProvider, useTheme } from '@/theming/ThemeProvider';
import { welcomeThemes, welcomeWaves } from '@/theming/welcome';
import { openLegal } from '@/lib/pictopia/links';

export function Welcome({ onStart }: { onStart: () => void }) {
  const { theme } = useTheme();
  return (
    <ThemeProvider scoped initialThemeName={theme.name === 'dark' ? 'dark' : 'light'} themes={welcomeThemes}>
      <WelcomeContent onStart={onStart} />
    </ThemeProvider>
  );
}

function WelcomeContent({ onStart }: { onStart: () => void }) {
  const { theme } = useTheme();
  const { width, height } = useWindowDimensions();
  const waves = welcomeWaves[theme.name === 'dark' ? 'dark' : 'light'];
  const artworkSize = Math.min(width - 40, 320, Math.max(180, height * 0.37));

  return (
    <View className="flex-1 overflow-hidden bg-background">
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" className="absolute inset-x-0 bottom-0 h-52">
        <Svg width="100%" height="100%" viewBox="0 0 400 200" preserveAspectRatio="none">
          <Path d="M0 30 C80 -10 136 106 232 75 S340 55 400 84 V200 H0Z" fill={waves.lavender} />
          <Path d="M0 148 C146 158 230 22 400 24 V200 H0Z" fill={waves.lime} />
          <Path d="M0 120 C100 97 193 146 310 200 H0Z" fill={waves.aqua} />
        </Svg>
      </View>
      <SafeAreaView className="flex-1" edges={['top', 'bottom', 'left', 'right']}>
        <ScrollView bounces={false} contentContainerClassName="mx-auto w-full max-w-md flex-grow justify-center px-5 py-6">
          <View className="items-center gap-3">
            <Wordmark hero />
            <View style={{ width: artworkSize, height: artworkSize }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Image source={require('@/assets/images/welcome-photo-stack.png')} resizeMode="contain" style={{ width: artworkSize, height: artworkSize }} accessible={false} />
              <View pointerEvents="none" className="absolute right-1 top-8 h-16 w-16">
                <Svg width="100%" height="100%" viewBox="0 0 64 64">
                  <Path d="M12 30 L18 9 M29 37 L46 18 M38 51 L59 44" stroke={theme.colors.sun} strokeWidth={7} strokeLinecap="round" />
                </Svg>
              </View>
            </View>
            <View className="items-center gap-4 px-1">
              <Text accessibilityRole="header" className="text-center text-h1 leading-10 text-foreground">{'Scroll your photos.\nSwipe the clutter.'}</Text>
              <Text className="text-center text-body leading-7 text-muted-foreground">{'A fast and fun way to clean\nup your photo library.'}</Text>
            </View>
          </View>
        </ScrollView>
        <View className="mx-auto w-full max-w-md gap-2 px-6 pb-3 pt-4">
          <Button large onPress={onStart}>Get started</Button>
          <Text className="text-center text-caption leading-5 text-foreground">
            By continuing you agree to our{' '}
            <Text accessibilityRole="link" onPress={() => void openLegal('terms').catch(() => {})} className="text-caption text-foreground underline">Terms</Text>
            {' '}and{' '}
            <Text accessibilityRole="link" onPress={() => void openLegal('privacy').catch(() => {})} className="text-caption text-foreground underline">Privacy Policy</Text>
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}
