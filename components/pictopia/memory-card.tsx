import { useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { Icon } from "./ui";
import { MediaImage, type MediaSettled } from "./media-image";
import type { Media } from "@/lib/pictopia/types";
import { MEMORY_FLIP_MS } from "@/lib/pictopia/memory-match";

export function MemoryCard({ index, photoNumber, photo, open, matched, celebrating, disabled, reduced, active, width, height, onPress, onSettled }: {
  index: number; photoNumber: number; photo?: Media; open: boolean; matched: boolean; celebrating: boolean;
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
      <Animated.View style={[styles.face, back]}><View className="flex-1 items-center justify-center rounded-2xl bg-accent">
        <View className="opacity-60"><Icon name="Aperture" size={25} strokeWidth={1.25} className="text-primary" /></View>
      </View></Animated.View>
      <Animated.View style={[styles.face, front]}><View className="flex-1 overflow-hidden rounded-2xl bg-secondary">
        <MediaImage media={photo} className="h-full w-full" fit="contain" onSettled={onSettled} />
        <Animated.View style={[styles.fill, glow]}><View className="flex-1 rounded-2xl border-2 border-primary" /></Animated.View>
      </View></Animated.View>
    </Animated.View>
  </Pressable>;
}
const styles = StyleSheet.create({ fill: { ...StyleSheet.absoluteFillObject }, face: { ...StyleSheet.absoluteFillObject, backfaceVisibility: "hidden" } });
