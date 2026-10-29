import { useMemo } from "react";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import { commitDirection } from "@/lib/pictopia/swipe-physics";
import { SwipeGestureProps } from "./swipe-gesture.types";
export function SwipeGesture({
  children,
  x,
  y,
  enabled,
  threshold,
  onCommit,
  onCancel,
}: SwipeGestureProps) {
  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(enabled)
        // Horizontal intent activates the swipe; clear vertical movement is left to scrolling.
        .activeOffsetX([-10, 10])
        .failOffsetY([-24, 24])
        .onUpdate((e) => {
          // Runs on the UI thread: the card tracks the finger without a JS round trip.
          x.value = e.translationX;
          y.value = e.translationY * 0.12;
        })
        .onEnd((e, success) => {
          const direction = success ? commitDirection(e.translationX, e.velocityX, threshold) : 0;
          if (direction) runOnJS(onCommit)(direction);
          else runOnJS(onCancel)();
        }),
    [enabled, threshold, onCommit, onCancel, x, y],
  );
  return <GestureDetector gesture={gesture}>{children}</GestureDetector>;
}
