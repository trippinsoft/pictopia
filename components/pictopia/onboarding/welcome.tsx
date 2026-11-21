import { ScrollView, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Text } from '@/components/pictopia/ui';
import { Wordmark } from '@/components/pictopia/playful';
import { openLegal } from '@/lib/pictopia/links';
import { PROBLEM_COPY } from '@/lib/pictopia/onboarding';
import { ProblemPile } from './problem';

/** The opening: the problem first (a pile of memories that keeps growing), then the promise.
 * Uses the app's own theme and page background, like every other onboarding screen. */
export function Welcome({ onStart }: { onStart: () => void }) {
  const { width, height } = useWindowDimensions();
  const artworkSize = Math.min(width - 40, 320, Math.max(200, height * 0.4));

  return (
    <View className="flex-1 overflow-hidden bg-background">
      <SafeAreaView className="flex-1" edges={['top', 'bottom', 'left', 'right']}>
        <ScrollView bounces={false} contentContainerClassName="mx-auto w-full max-w-md flex-grow justify-center px-5 py-6">
          <View className="items-center gap-3">
            <Wordmark large />
            <ProblemPile size={artworkSize} />
            <View className="items-center gap-2 px-1">
              <Text className="text-center text-h4 text-muted-foreground">{PROBLEM_COPY.kicker}</Text>
              <Text accessibilityRole="header" className="text-center text-h1 leading-10 text-foreground">{PROBLEM_COPY.headline}</Text>
              <Text className="text-center text-body leading-7 text-muted-foreground">{PROBLEM_COPY.body}</Text>
            </View>
          </View>
        </ScrollView>
        <View className="mx-auto w-full max-w-md gap-2 px-6 pb-3 pt-4">
          <Button large onPress={onStart}>{PROBLEM_COPY.action}</Button>
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
