import { useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import Svg, { Circle, G, Path, Rect } from "react-native-svg";
import { MediaImage, type MediaSettled } from "./media-image";
import type { Media } from "@/lib/pictopia/types";
import { MEMORY_FLIP_MS } from "@/lib/pictopia/memory-match";
import { lightArt } from "@/theming/illustration";

export function MemoryCard({ index, photoNumber, photo, uri, open, matched, celebrating, disabled, reduced, active, width, height, onPress, onSettled }: {
  index: number; photoNumber: number; photo?: Media; uri?: string; open: boolean; matched: boolean; celebrating: boolean;
  disabled: boolean; reduced: boolean; active: boolean; width: number; height: number;
  onPress(): void; onSettled(state: MediaSettled): void;
}) {
  const flip = useSharedValue(open ? 1 : 0), scale = useSharedValue(1), highlight = useSharedValue(0), emphasis = useSharedValue(1);
  useEffect(() => {
    flip.value = reduced || !active ? Number(open) : withTiming(Number(open), { duration: MEMORY_FLIP_MS, easing: Easing.inOut(Easing.cubic) });
    return () => cancelAnimation(flip);
  }, [open, reduced, active, flip]);
  useEffect(() => {
    if (celebrating && active) {
      scale.value = reduced ? 1 : withSequence(withTiming(1.035, { duration: 170 }), withTiming(1, { duration: 290 }));
      highlight.value = reduced ? 0 : withSequence(withTiming(0.7, { duration: 140 }), withTiming(0, { duration: 320 }));
    } else { scale.value = 1; highlight.value = 0; }
    emphasis.value = withTiming(matched && !celebrating ? 0.86 : 1, { duration: reduced ? 0 : 220 });
    return () => { cancelAnimation(scale); cancelAnimation(highlight); cancelAnimation(emphasis); };
  }, [celebrating, matched, reduced, active, scale, highlight, emphasis]);
  const outer = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }], opacity: emphasis.value }));
  // Separate faces plus a hard edge-on visibility boundary avoid mirrored images and z-fighting.
  const back = useAnimatedStyle(() => ({ opacity: flip.value < 0.5 ? 1 : 0, transform: [{ perspective: 900 }, { rotateY: `${flip.value * 180}deg` }] }));
  const front = useAnimatedStyle(() => ({ opacity: flip.value >= 0.5 ? 1 : 0, transform: [{ perspective: 900 }, { rotateY: `${(flip.value - 1) * 180}deg` }] }));
  const glow = useAnimatedStyle(() => ({ opacity: highlight.value }));
  return <Pressable accessibilityRole="button" accessibilityLabel={`Card ${index + 1}, ${matched ? `photo ${photoNumber}, matched` : open ? `photo ${photoNumber}, face up` : "face down"}`}
    accessibilityState={{ disabled, selected: open }} disabled={disabled} onPress={onPress} style={{ width, height }}>
    <Animated.View pointerEvents="none" style={[styles.fill, outer]}>
      <Animated.View style={[styles.face, back]}><View className="flex-1 overflow-hidden rounded-2xl"><CardBack /></View></Animated.View>
      <Animated.View style={[styles.face, front]}><View className="flex-1 overflow-hidden rounded-2xl bg-secondary">
        <MediaImage media={uri ? undefined : photo} uri={uri} className="h-full w-full" fit="contain" onSettled={onSettled} />
        <Animated.View style={[styles.fill, glow]}><View className="flex-1 rounded-2xl border-2 border-primary" /></Animated.View>
      </View></Animated.View>
    </Animated.View>
  </Pressable>;
}
const styles = StyleSheet.create({ fill: { ...StyleSheet.absoluteFillObject }, face: { ...StyleSheet.absoluteFillObject, backfaceVisibility: "hidden" } });

/** A Pictopia "postcard stamp" card back: warm paper with a dashed inner frame and a
 * centered postmark emblem. A pattern, not a landscape — so a whole deck of face-down
 * cards reads as a clean grid rather than twelve repeated scenes. */
function CardBack() {
  const C = lightArt;
  return (
    <Svg width="100%" height="100%" viewBox="0 0 80 100" preserveAspectRatio="xMidYMid meet" aria-hidden>
      {/* Warm paper with a faint ruled texture, like the back of a postcard. */}
      <Rect width="80" height="100" fill={C.sky} />
      <Path d="M8 32 H72 M8 44 H72 M8 56 H56 M8 68 H72 M8 80 H60" stroke={C.sandDeep} strokeWidth="0.6" opacity="0.18" strokeLinecap="round" />
      {/* Dashed inner frame, inset from the edges. */}
      <Rect x="6" y="6" width="68" height="88" rx="6" fill="none" stroke={C.ink} strokeWidth="0.8" strokeDasharray="3 3" opacity="0.35" />
      {/* Postmark circle with the little sun + hill monogram, tilted like a real stamp. */}
      <G transform="translate(40 50) rotate(-8)">
        <Circle cx="0" cy="0" r="20" fill="none" stroke={C.terracotta} strokeWidth="1.2" opacity="0.65" />
        <Circle cx="0" cy="0" r="16" fill={C.paper} />
        <Circle cx="4" cy="-5" r="4.5" fill={C.sun} />
        <Path d="M-11 6 Q-4 -1 3 4 T13 6 V13 H-11Z" fill={C.moss} />
        <Path d="M-11 9 Q-2 4 6 8 T13 9 V13 H-11Z" fill={C.tealDeep} opacity="0.85" />
      </G>
      {/* Tiny tomato dot in the lower right, like the pictopia wordmark's period. */}
      <Circle cx="60" cy="80" r="1.8" fill={C.terracotta} />
    </Svg>
  );
}
