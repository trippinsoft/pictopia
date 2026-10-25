import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import { SwipeGestureProps } from "./swipe-gesture.types";
export function SwipeGesture({ children, x, y, enabled, onRelease }: SwipeGestureProps) {
  const gesture = Gesture.Pan()
    .enabled(enabled)
    .activeOffsetX([-12, 12])
    .onUpdate((e) => {
      x.value = e.translationX;
      y.value = e.translationY * 0.15;
    })
    .onEnd((e) => {
      runOnJS(onRelease)(e.translationX);
    });
  return <GestureDetector gesture={gesture}>{children}</GestureDetector>;
}
