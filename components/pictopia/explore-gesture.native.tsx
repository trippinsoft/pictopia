import { useMemo } from "react";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import { exploreDirection } from "@/lib/pictopia/explore";
import type { ExploreGestureProps } from "./explore-gesture.types";
export function ExploreGesture({
  children,
  x,
  locked,
  enabled,
  nativeScroll,
  onStart,
  onCommit,
  onCancel,
}: ExploreGestureProps) {
  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(enabled)
        .activeOffsetX([-12, 12])
        .failOffsetY([-12, 12])
        .blocksExternalGesture(nativeScroll)
        .onStart(() => {
          if (!locked.value) runOnJS(onStart)();
        })
        .onUpdate((e) => {
          if (!locked.value) x.value = e.translationX;
        })
        .onEnd((e, success) => {
          if (locked.value) return;
          // The horizontal recognizer has already won; vertical drift cannot switch axes.
          const direction = success ? exploreDirection(e.translationX, 0, e.velocityX, 0) : null;
          if (direction === "left" || direction === "right") {
            locked.value = true;
            runOnJS(onCommit)(direction);
          } else runOnJS(onCancel)();
        })
        .onFinalize((_e, success) => {
          if (!success && !locked.value) runOnJS(onCancel)();
        }),
    [enabled, x, locked, nativeScroll, onStart, onCommit, onCancel],
  );
  return <GestureDetector gesture={gesture}>{children}</GestureDetector>;
}
