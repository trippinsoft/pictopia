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

/** Scroll: photos glide up like a feed. The strip ends with the same photos it starts with, so the
 * jump back to the top lands on an identical frame and the loop never visibly resets. */
const SCROLL_PHOTOS: ArtName[] = ["summer", "detour", "autumn", "summer", "detour"];
export function ScrollDemo() {
  const reduced = useReducedMotion();
  const y = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    const step = CARD_H + 10;
    const glide = (to: number, delay: number) => withDelay(delay, withTiming(to, { duration: 900, easing: Easing.inOut(Easing.cubic) }));
    y.value = withRepeat(withSequence(
      glide(-step, 700),
      glide(-step * 2, 700),
      glide(-step * 3, 700),
      // Photo 4 is photo 1 again, so snapping back is invisible.
      withTiming(0, { duration: 0 }),
    ), -1);
  }, [reduced, y]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return (
    <Phone>
      <Animated.View style={[{ paddingTop: 12 }, style]}>
        {SCROLL_PHOTOS.map((name, i) => <FauxPhoto key={i} name={name} />)}
      </Animated.View>
      <View className="absolute bottom-3 self-center rounded-full bg-foreground/80 px-3 py-1">
        <Text className="text-caption text-background">Scroll to explore</Text>
      </View>
    </Phone>
  );
}

/** Swipe: a finger flicks the photo sideways (right, then left on the next loop) and, in one
 * continuous arc, it sails up into the Discarded pile in the corner. The photo underneath is simply
 * revealed; three stacked layers (winter · spring · winter) make the loop seamless. */
const SWIPE_CYCLE = 2800;
const TRASH = { x: 66, y: -134 };
const MOVE_START = 0.18;
const MOVE_END = 0.72;
const RELEASE = 0.32;

/** Position of the flying photo along one swipe, `local` 0→1 within the cycle. */
function swipeFlight(local: number, dir: 1 | -1) {
  "worklet";
  const raw = Math.min(1, Math.max(0, (local - MOVE_START) / (MOVE_END - MOVE_START)));
  // Ease in-out: one smooth throw, no stop between the sideways drag and the flight up.
  const p = raw < 0.5 ? 4 * raw * raw * raw : 1 - Math.pow(-2 * raw + 2, 3) / 2;
  // Cubic Bézier: leaves sideways, curves up and over into the trash.
  const p1 = { x: dir * 92, y: -6 };
  const p2 = dir > 0 ? { x: 112, y: -96 } : { x: -36, y: -176 };
  const u = 1 - p;
  const x = u * u * u * 0 + 3 * u * u * p * p1.x + 3 * u * p * p * p2.x + p * p * p * TRASH.x;
  const y = u * u * u * 0 + 3 * u * u * p * p1.y + 3 * u * p * p * p2.y + p * p * p * TRASH.y;
  const landed = local >= MOVE_END;
  return {
    p,
    x,
    y,
    rotate: dir * 12 * Math.sin(Math.PI * Math.min(1, p * 1.4)) + p * 10,
    scale: 1 - p * p * 0.82,
    opacity: landed ? 0 : 1 - p * p * p * 0.7,
  };
}

export function SwipeDemo() {
  const reduced = useReducedMotion();
  // 0→2: two swipes per loop, the first to the right, the second to the left.
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    t.value = withRepeat(withTiming(2, { duration: SWIPE_CYCLE * 2, easing: Easing.linear }), -1, false);
  }, [reduced, t]);
  // Top photo on the first swipe; on the second it waits, at rest, underneath the other photo.
  const first = useAnimatedStyle(() => {
    if (t.value >= 1) return { opacity: 1, transform: [{ translateX: 0 }, { translateY: 0 }, { rotate: "0deg" }, { scale: 1 }] };
    const f = swipeFlight(t.value, 1);
    return { opacity: f.opacity, transform: [{ translateX: f.x }, { translateY: f.y }, { rotate: `${f.rotate}deg` }, { scale: f.scale }] };
  });
  // Covers the identical photo underneath at the start of the second swipe, then flies.
  const second = useAnimatedStyle(() => {
    if (t.value < 1) return { opacity: 0, transform: [{ translateX: 0 }, { translateY: 0 }, { rotate: "0deg" }, { scale: 1 }] };
    const f = swipeFlight(t.value - 1, -1);
    return { opacity: f.opacity, transform: [{ translateX: f.x }, { translateY: f.y }, { rotate: `${f.rotate}deg` }, { scale: f.scale }] };
  });
  const finger = useAnimatedStyle(() => {
    const dir = t.value < 1 ? 1 : -1;
    const local = t.value % 1;
    const f = swipeFlight(local, dir);
    const press = Math.min(1, Math.max(0, (local - 0.08) / 0.1));
    const lift = Math.min(1, Math.max(0, (f.p - RELEASE) / 0.12));
    // The finger rides with the photo until it lets go, then the photo keeps its momentum.
    const held = Math.min(f.p, RELEASE) / Math.max(f.p, 0.0001);
    return {
      opacity: press * (1 - lift),
      transform: [{ translateX: f.x * held }, { translateY: f.y * held }, { scale: 1.15 - press * 0.15 + lift * 0.2 }],
    };
  });
  const badge = useAnimatedStyle(() => {
    const local = t.value % 1;
    const pop = local >= MOVE_END - 0.04 && local < MOVE_END + 0.16 ? 1 - Math.abs(local - (MOVE_END + 0.02)) / 0.14 : 0;
    return { transform: [{ scale: 1 + Math.max(0, pop) * 0.35 }] };
  });
  return (
    <Phone>
      <View className="absolute left-0 right-0 top-14"><FauxPhoto name="winter" height={210} /></View>
      <View className="absolute left-0 right-0 top-14"><Animated.View style={first}><FauxPhoto name="spring" height={210} /></Animated.View></View>
      <View className="absolute left-0 right-0 top-14"><Animated.View style={second}><FauxPhoto name="winter" height={210} /></Animated.View></View>
      {!reduced ? (
        <View pointerEvents="none" className="absolute left-0 right-0 items-center" style={{ top: 56 + 120 }}>
          <Animated.View style={finger} className="h-11 w-11 rounded-full border-2 border-white bg-foreground/30" />
        </View>
      ) : null}
      <View className="absolute right-3 top-3">
        <Animated.View style={badge}>
          <View className="h-10 w-10 items-center justify-center rounded-full bg-tomato"><Icon name="Trash2" size={18} color="#fff" /></View>
        </Animated.View>
      </View>
      <View className="absolute bottom-3 self-center rounded-full bg-foreground/80 px-3 py-1">
        <Text className="text-caption text-background">Swipe left or right to discard</Text>
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
