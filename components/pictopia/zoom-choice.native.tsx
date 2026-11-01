import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { DOUBLE_TAP_MS, TAP_SLOP, ZOOM_SNAP, clampOffset, clampScale, doubleTapTarget, focalOffset, tapSelects } from "@/lib/pictopia/zoom-math";
import type { ZoomChoiceProps } from "./zoom-choice.types";

const fill = { flex: 1 };
/** Pinch (to 3×), pan and double-tap zoom inside the photo's own frame; a single still tap at 1× answers. */
export function ZoomChoice({ children, onSelect, onPressChange }: ZoomChoiceProps) {
  const scale = useSharedValue(1), x = useSharedValue(0), y = useSharedValue(0);
  const width = useSharedValue(0), height = useSharedValue(0), pinched = useSharedValue(false);
  const start = useSharedValue({ scale: 1, x: 0, y: 0, fx: 0, fy: 0 });
  const pressed = (value: boolean) => onPressChange?.(value);
  const animateTo = (target: { scale: number; x: number; y: number }) => {
    "worklet";
    scale.value = withTiming(target.scale, { duration: 220 });
    x.value = withTiming(target.x, { duration: 220 });
    y.value = withTiming(target.y, { duration: 220 });
  };
  const pinch = Gesture.Pinch()
    .onStart(e => {
      pinched.value = true;
      runOnJS(pressed)(false);
      start.value = { scale: scale.value, x: x.value, y: y.value, fx: e.focalX - width.value / 2, fy: e.focalY - height.value / 2 };
    })
    .onUpdate(e => {
      const s = clampScale(start.value.scale * e.scale);
      scale.value = s;
      x.value = clampOffset(focalOffset(e.focalX - width.value / 2, start.value.fx, start.value.x, start.value.scale, s), s, width.value);
      y.value = clampOffset(focalOffset(e.focalY - height.value / 2, start.value.fy, start.value.y, start.value.scale, s), s, height.value);
    })
    .onEnd(() => { if (scale.value < ZOOM_SNAP) animateTo({ scale: 1, x: 0, y: 0 }); });
  const pan = Gesture.Pan()
    .maxPointers(1)
    .minDistance(TAP_SLOP)
    .onStart(() => { start.value = { ...start.value, x: x.value, y: y.value }; })
    .onUpdate(e => {
      if (scale.value <= 1) return;
      x.value = clampOffset(start.value.x + e.translationX, scale.value, width.value);
      y.value = clampOffset(start.value.y + e.translationY, scale.value, height.value);
    });
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDelay(DOUBLE_TAP_MS)
    .maxDistance(TAP_SLOP)
    .onEnd((e, success) => { if (success) animateTo(doubleTapTarget(scale.value, { x: e.x, y: e.y }, { width: width.value, height: height.value })); });
  const singleTap = Gesture.Tap()
    .maxDistance(TAP_SLOP)
    .maxDuration(600)
    .onBegin(() => { pinched.value = false; runOnJS(pressed)(true); })
    .onEnd((_e, success) => { if (success && tapSelects(scale.value, pinched.value, 0)) runOnJS(onSelect)(); })
    .onFinalize(() => { runOnJS(pressed)(false); });
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }] }));
  return <GestureDetector gesture={Gesture.Simultaneous(pinch, pan, Gesture.Exclusive(doubleTap, singleTap))}>
    <View collapsable={false} style={fill} onLayout={e => { width.value = e.nativeEvent.layout.width; height.value = e.nativeEvent.layout.height; }}>
      <Animated.View style={[fill, style]}>{children}</Animated.View>
    </View>
  </GestureDetector>;
}
