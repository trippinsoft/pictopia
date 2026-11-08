import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { Icon, Text } from "./ui";
import { plural } from "@/lib/pictopia/text";

export interface ReviewTrashHandle {
  bounce(): void;
}
const sizeLabel = (bytes: number) => bytes >= 1_000_000_000
  ? `${(bytes / 1_000_000_000).toFixed(1)} GB`
  : `${(bytes / 1_000_000).toFixed(1)} MB`;

/** Persistent adventure trash. Its icon centre is the target for discarded photographs. */
export const ReviewTrash = forwardRef<ReviewTrashHandle, {
  count: number;
  bytes: number;
  unknownSizes: number;
  disabled?: boolean;
  highlighted?: boolean;
  onMeasure(centre: { x: number; y: number }): void;
  onPress(): void;
}>(function ReviewTrash({ count, bytes, unknownSizes, disabled, highlighted, onMeasure, onPress }, ref) {
  const box = useRef<View>(null);
  const lid = useSharedValue(0);
  const pop = useSharedValue(0);
  const drift = useSharedValue(1);
  const reduced = useReducedMotion();
  const [addition, setAddition] = useState<string>();
  const previous = useRef({ count, bytes });
  const label = unknownSizes ? (bytes > 0 ? `≥ ${sizeLabel(bytes)}` : "Size unknown") : sizeLabel(bytes);
  useImperativeHandle(ref, () => ({
    bounce() {
      lid.value = withSequence(
        withTiming(1, { duration: 110, easing: Easing.out(Easing.quad), reduceMotion: ReduceMotion.System }),
        withTiming(0, { duration: 260, easing: Easing.elastic(1.6), reduceMotion: ReduceMotion.System }),
      );
    },
  }), [lid]);
  useEffect(() => {
    const before = previous.current;
    previous.current = { count, bytes };
    if (count <= before.count && bytes <= before.bytes) return;
    pop.value = withSequence(
      withTiming(1, { duration: 100, reduceMotion: ReduceMotion.System }),
      withTiming(0, { duration: 240, reduceMotion: ReduceMotion.System }),
    );
    if (bytes > before.bytes) {
      setAddition(`+${sizeLabel(bytes - before.bytes)}`);
      drift.value = 0;
      drift.value = withTiming(1, { duration: 1000, easing: Easing.out(Easing.quad), reduceMotion: ReduceMotion.Never });
    }
  }, [count, bytes, pop, drift]);
  const canStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + lid.value * 0.22 }, { translateY: lid.value * 2 }],
  }));
  const countStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + pop.value * 0.24 }] }));
  const additionStyle = useAnimatedStyle(() => ({
    opacity: 1 - drift.value,
    transform: [{ translateY: reduced ? 0 : drift.value * 18 }],
  }));
  const measure = () => box.current?.measureInWindow((x, y, width, height) => {
    if (width || height) onMeasure({ x: x + width / 2, y: y + height / 2 });
  });
  return <Pressable
    accessibilityRole="button"
    accessibilityState={{ disabled }}
    accessibilityLabel={`Discarded, ${plural(count, "photograph")}, ${label}. Review or restore them. Files are still in your library.`}
    disabled={disabled}
    onPress={onPress}
    className={`h-12 w-12 items-center justify-center rounded-full bg-card/90 active:opacity-70 ${highlighted ? "border-2 border-sun" : ""}`}
  >
    <View ref={box} collapsable={false} onLayout={measure} className="h-8 w-8 items-center justify-center">
      <Animated.View style={canStyle}><Icon name="Trash2" size={22} className="text-foreground" /></Animated.View>
    </View>
    {count > 0 && <View pointerEvents="none" className="absolute -right-1 -top-1">
      <Animated.View style={countStyle}>
        <View className="h-5 min-w-5 items-center justify-center rounded-full bg-sun px-1">
          <Text className="text-[12px] font-bold text-primary-foreground" style={{ fontVariant: ["tabular-nums"] }}>{count}</Text>
        </View>
      </Animated.View>
    </View>}
    {bytes > 0 && <View pointerEvents="none" className="absolute -right-4 top-full mt-1 w-20"><Text numberOfLines={1} className="w-full text-center text-[11px] font-bold leading-4 text-destructive" style={{ fontVariant: ["tabular-nums"] }}>{label}</Text></View>}
    {!!addition && <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" className="absolute right-0 top-full mt-7 w-28 items-end" style={additionStyle}>
      <Text numberOfLines={1} className="rounded-full bg-card px-2 py-0.5 text-caption text-foreground">{addition}</Text>
    </Animated.View>}
  </Pressable>;
});
