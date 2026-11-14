import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from "react-native-reanimated";
import Svg from "react-native-svg";
import { CardStackMark } from "./card-stack-mark";
import { MediaImage, type MediaSettled } from "./media-image";
import type { Media } from "@/lib/pictopia/types";
import { MEMORY_DEAL_MS, MEMORY_FLIP_MS, memoryTable, type DealFrom } from "@/lib/pictopia/memory-match";
import { lightArt } from "@/theming/illustration";


export function MemoryCard({ index, photoNumber, photo, uri, open, matched, celebrating, disabled, reduced, active, width, height, deal, dealDelay, dealFrom, onPress, onSettled }: {
  index: number; photoNumber: number; photo?: Media; uri?: string; open: boolean; matched: boolean; celebrating: boolean;
  disabled: boolean; reduced: boolean; active: boolean; width: number; height: number;
  /** "stacked": invisible, waiting in the deck while photos load; "dealt": fly to the slot. */
  deal: "stacked" | "dealt"; dealDelay: number; dealFrom: DealFrom;
  onPress(): void; onSettled(state: MediaSettled): void;
}) {
  const flip = useSharedValue(open ? 1 : 0), scale = useSharedValue(1), highlight = useSharedValue(0), emphasis = useSharedValue(1);
  const table = memoryTable(index), shadow = { boxShadow: table.shadow } as ViewStyle;
  const dx = useSharedValue(dealFrom.x), dy = useSharedValue(dealFrom.y), sx = useSharedValue(dealFrom.scaleX), sy = useSharedValue(dealFrom.scaleY);
  const tilt = useSharedValue(dealFrom.rotate), lift = useSharedValue(0), shown = useSharedValue(0);
  // Cards still in the deck stack with the next one to deal on top; once a card leaves the deck
  // it rises above everything already on the table, so it never slides underneath them.
  const [launched, setLaunched] = useState(false);
  const { x: fromX, y: fromY, scaleX: fromScaleX, scaleY: fromScaleY, rotate: fromRotate } = dealFrom;
  useEffect(() => {
    if (deal !== "stacked") return;
    dx.value = fromX; dy.value = fromY; sx.value = fromScaleX; sy.value = fromScaleY; tilt.value = fromRotate; lift.value = 0; shown.value = 0;
    setLaunched(false);
  }, [deal, fromX, fromY, fromScaleX, fromScaleY, fromRotate, dx, dy, sx, sy, tilt, lift, shown]);
  useEffect(() => {
    if (deal !== "dealt") return;
    shown.value = 1;
    if (reduced) {
      dx.value = 0; dy.value = 0; sx.value = 1; sy.value = 1; tilt.value = table.tilt; lift.value = 0; setLaunched(true);
      return;
    }
    const values = [dx, dy, sx, sy, tilt, lift];
    const timer = setTimeout(() => setLaunched(true), dealDelay);
    const glide = { duration: MEMORY_DEAL_MS, easing: Easing.out(Easing.cubic) };
    dx.value = withDelay(dealDelay, withTiming(0, glide));
    dy.value = withDelay(dealDelay, withTiming(0, glide));
    sx.value = withDelay(dealDelay, withTiming(1, glide));
    sy.value = withDelay(dealDelay, withTiming(1, glide));
    // A dealt card spins a little on its way and settles at its own resting angle.
    tilt.value = withDelay(dealDelay, withTiming(table.tilt, { duration: MEMORY_DEAL_MS, easing: Easing.out(Easing.back(1.4)) }));
    lift.value = withDelay(dealDelay, withSequence(withTiming(1, { duration: MEMORY_DEAL_MS * 0.4 }), withTiming(0, { duration: MEMORY_DEAL_MS * 0.6, easing: Easing.in(Easing.quad) })));
    return () => { clearTimeout(timer); values.forEach(value => cancelAnimation(value)); };
  }, [deal, reduced, dealDelay, table.tilt, dx, dy, sx, sy, tilt, lift, shown]);
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
  const spin = index % 2 ? 9 : -9;
  const outer = useAnimatedStyle(() => ({
    opacity: emphasis.value * shown.value,
    transform: [{ translateX: dx.value }, { translateY: dy.value - lift.value * 10 }, { scaleX: sx.value * scale.value * (1 + lift.value * 0.06) }, { scaleY: sy.value * scale.value * (1 + lift.value * 0.06) }, { rotate: `${tilt.value + lift.value * spin}deg` }],
  }));
  // Separate faces plus a hard edge-on visibility boundary avoid mirrored images and z-fighting.
  const back = useAnimatedStyle(() => ({ opacity: flip.value < 0.5 ? 1 : 0, transform: [{ perspective: 900 }, { rotateY: `${flip.value * 180}deg` }] }));
  const front = useAnimatedStyle(() => ({ opacity: flip.value >= 0.5 ? 1 : 0, transform: [{ perspective: 900 }, { rotateY: `${(flip.value - 1) * 180}deg` }] }));
  const glow = useAnimatedStyle(() => ({ opacity: highlight.value }));
  return <Pressable accessibilityRole="button" accessibilityLabel={`Card ${index + 1}, ${matched ? `photo ${photoNumber}, matched` : open ? `photo ${photoNumber}, face up` : "face down"}`}
    accessibilityState={{ disabled, selected: open }} disabled={disabled} onPress={onPress} style={{ width, height, zIndex: launched ? 100 + index : 50 - index }}>
    <Animated.View pointerEvents="none" style={[styles.fill, outer]}>
      <Animated.View style={[styles.face, shadow, back]}><CardBack /></Animated.View>
      <Animated.View style={[styles.face, shadow, front]}><View className="flex-1 overflow-hidden rounded-2xl bg-secondary">
        <MediaImage media={uri ? undefined : photo} uri={uri} className="h-full w-full" fit="contain" onSettled={onSettled} />
        <Animated.View style={[styles.fill, glow]}><View className="flex-1 rounded-2xl border-2 border-primary" /></Animated.View>
      </View></Animated.View>
    </Animated.View>
  </Pressable>;
}
const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject },
  face: { ...StyleSheet.absoluteFillObject, backfaceVisibility: "hidden", borderRadius: 16 },
  back: { flex: 1, overflow: "hidden", borderRadius: 16, padding: 6, backgroundColor: lightArt.sky },
  frame: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 11, borderWidth: 1, borderStyle: "dashed", borderColor: "rgba(28,36,87,0.28)" },
  mark: { width: "84%", height: "84%", maxWidth: 130, maxHeight: 130 },
});

/** The face-down side: warm card stock with a dashed inner frame and Memory Match's fanned
 * card-stack emblem from the app icon — the same mark as the game's Pit Stop artwork. */
export function CardBack() {
  return <View style={styles.back}>
    <View style={styles.frame}>
      <View style={styles.mark}>
        <Svg width="100%" height="100%" viewBox="0 0 104 100" preserveAspectRatio="xMidYMid meet" aria-hidden><CardStackMark c={lightArt} cx={54} cy={50} /></Svg>
      </View>
    </View>
  </View>;
}
