import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Pressable, View } from "react-native";
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { Icon, Text } from "./ui";
import { plural } from "@/lib/pictopia/text";

export interface ReviewTrashHandle {
  /** A photograph has landed: the can takes the weight. */
  bounce(): void;
}
/** The one place a marked photograph lives until the user confirms or restores it. Quiet, in
 * the bottom row beside Favorite and Share, with a stable centre for flights to aim at. */
export const ReviewTrash = forwardRef<
  ReviewTrashHandle,
  {
    count: number;
    disabled?: boolean;
    highlighted?: boolean;
    /** The can's centre in window coordinates, remeasured whenever it moves or resizes. */
    onMeasure(centre: { x: number; y: number }): void;
    onPress(): void;
  }
>(function ReviewTrash({ count, disabled, highlighted, onMeasure, onPress }, ref) {
  const box = useRef<View>(null);
  const lid = useSharedValue(0);
  const pop = useSharedValue(0);
  const shown = useRef(count);
  useImperativeHandle(
    ref,
    () => ({
      bounce() {
        lid.value = withSequence(
          withTiming(1, { duration: 110, easing: Easing.out(Easing.quad), reduceMotion: ReduceMotion.System }),
          withTiming(0, { duration: 260, easing: Easing.elastic(1.6), reduceMotion: ReduceMotion.System }),
        );
      },
    }),
    [lid],
  );
  // The count's own small arrival, only when it actually changes.
  useEffect(() => {
    if (shown.current === count) return;
    shown.current = count;
    pop.value = withSequence(
      withTiming(1, { duration: 120, reduceMotion: ReduceMotion.System }),
      withTiming(0, { duration: 180, reduceMotion: ReduceMotion.System }),
    );
  }, [count, pop]);
  const canStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + lid.value * 0.22 }, { translateY: lid.value * 2 }],
  }));
  const countStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pop.value * 0.3 }],
  }));
  const measure = () =>
    box.current?.measureInWindow((x, y, width, height) => {
      if (width || height) onMeasure({ x: x + width / 2, y: y + height / 2 });
    });
  return (
    <Pressable
      ref={box}
      onLayout={measure}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityLabel={
        count
          ? `Trash, ${plural(count, "photograph")} marked for deletion. Review or restore them.`
          : "Trash, nothing marked for deletion yet"
      }
      disabled={disabled}
      onPress={onPress}
      className={`min-h-11 flex-row items-center gap-1.5 rounded-full border px-3 py-1.5 ${highlighted ? "border-primary" : "border-transparent"} ${count ? "bg-secondary/60" : ""}`}
    >
      <Animated.View style={canStyle}>
        <Icon
          name="Trash2"
          size={24}
          className={count ? "text-foreground" : "text-muted-foreground"}
        />
      </Animated.View>
      {count > 0 && (
        <Animated.View style={countStyle}>
          <Text className="text-caption text-foreground">{count}</Text>
        </Animated.View>
      )}
    </Pressable>
  );
});
