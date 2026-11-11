import { useEffect, type ReactNode } from "react";
import { View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming } from "react-native-reanimated";
import { Icon, Text } from "@/components/pictopia/ui";
import { Illustration, type ArtName } from "@/components/pictopia/illustration";
import { BadgeArt } from "@/components/pictopia/badge-art";
import { Sticker } from "@/components/pictopia/playful";

const PHONE_W = 212;
const PHONE_H = 300;
const CARD_H = 200;

/** A friendly phone outline holding a demo. Decorative: screen readers get the step's text. */
function Phone({ children }: { children: ReactNode }) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: PHONE_W, height: PHONE_H }} className="self-center overflow-hidden rounded-[34px] border-[6px] border-foreground bg-card">
      {children}
    </View>
  );
}
/** A stand-in "photo" drawn from the Storybook scenes, never a stock or personal photo. */
function FauxPhoto({ name, height = CARD_H }: { name: ArtName; height?: number }) {
  return (
    <View style={{ height }} className="mx-2.5 mb-2.5 overflow-hidden rounded-[18px]">
      <Illustration name={name} />
    </View>
  );
}

/** Scroll: photos glide up like a feed. */
export function ScrollDemo() {
  const reduced = useReducedMotion();
  const y = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    const step = CARD_H + 10;
    y.value = withRepeat(withSequence(
      withDelay(500, withTiming(-step, { duration: 900, easing: Easing.inOut(Easing.cubic) })),
      withDelay(700, withTiming(-step * 2, { duration: 900, easing: Easing.inOut(Easing.cubic) })),
      withDelay(900, withTiming(0, { duration: 0 })),
    ), -1);
  }, [reduced, y]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return (
    <Phone>
      <Animated.View style={[{ paddingTop: 12 }, style]}>
        {(["summer", "detour", "autumn", "summer"] as const).map((name, i) => <FauxPhoto key={i} name={name} />)}
      </Animated.View>
      <View className="absolute bottom-3 self-center rounded-full bg-foreground/80 px-3 py-1">
        <Text className="text-caption text-background">Scroll to explore</Text>
      </View>
    </Phone>
  );
}

/** Swipe: a photo flies into the Discarded pile in the corner. */
export function SwipeDemo() {
  const reduced = useReducedMotion();
  const t = useSharedValue(0);
  const pop = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    t.value = withRepeat(withSequence(
      withDelay(800, withTiming(1, { duration: 650, easing: Easing.in(Easing.quad) })),
      withDelay(1000, withTiming(0, { duration: 0 })),
    ), -1);
    pop.value = withRepeat(withSequence(
      withDelay(1450, withTiming(1, { duration: 120 })),
      withTiming(0, { duration: 900 }),
      withTiming(0, { duration: 0 }),
    ), -1);
  }, [reduced, t, pop]);
  const card = useAnimatedStyle(() => ({
    opacity: 1 - t.value * 0.9,
    transform: [{ translateX: t.value * 120 }, { translateY: -t.value * 150 }, { rotate: `${t.value * 24}deg` }, { scale: 1 - t.value * 0.8 }],
  }));
  const badge = useAnimatedStyle(() => ({ transform: [{ scale: 1 + pop.value * 0.35 }] }));
  return (
    <Phone>
      <View className="absolute left-0 right-0 top-14"><FauxPhoto name="winter" height={210} /></View>
      <View className="absolute left-0 right-0 top-14"><Animated.View style={card}><FauxPhoto name="spring" height={210} /></Animated.View></View>
      <View className="absolute right-3 top-3">
        <Animated.View style={badge}>
          <View className="h-10 w-10 items-center justify-center rounded-full bg-tomato"><Icon name="Trash2" size={18} color="#fff" /></View>
        </Animated.View>
      </View>
      <View className="absolute bottom-3 self-center rounded-full bg-foreground/80 px-3 py-1">
        <Text className="text-caption text-background">Swipe to discard</Text>
      </View>
    </Phone>
  );
}

/** Pops its child in after `delay` (instantly with reduced motion). */
function PopIn({ delay, children }: { delay: number; children: ReactNode }) {
  const reduced = useReducedMotion();
  const v = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (!reduced) v.value = withDelay(delay, withSpring(1, { damping: 11, stiffness: 140 }));
  }, [reduced, delay, v]);
  const style = useAnimatedStyle(() => ({ opacity: v.value, transform: [{ scale: 0.6 + v.value * 0.4 }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

/** Enjoy the space: cleared storage, a streak and a badge pop in. */
export function SpaceDemo() {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ height: PHONE_H }} className="items-center justify-center">
      <PopIn delay={250}>
        <Sticker rotate={-3} className="items-center gap-1 px-7 py-5">
          <Icon name="HardDrive" size={26} className="text-grass" />
          <Text className="text-display text-foreground">58 MB</Text>
          <Text className="text-caption text-muted-foreground">cleared · example</Text>
        </Sticker>
      </PopIn>
      <View className="mt-4 flex-row items-center gap-4">
        <PopIn delay={530}>
          <Sticker rotate={4} className="flex-row items-center gap-2 px-4 py-3">
            <Icon name="Flame" size={22} className="text-sun" />
            <Text className="text-h3 text-foreground">5 day streak</Text>
          </Sticker>
        </PopIn>
        <PopIn delay={810}><BadgeArt family="explorer" tier={2} size={64} /></PopIn>
      </View>
    </View>
  );
}
