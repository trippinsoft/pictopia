import { useState } from "react";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedReaction, useAnimatedStyle } from "react-native-reanimated";
import { MediaImage } from "./media-image";
import { useZoomState } from "./zoom-state";
import { ZoomPhotoProps } from "./zoom-photo.types";
const fill = { flex: 1 };
export function ZoomPhoto({ media, onSettled, active = true, zoom, onZoomChange, imageProps }: ZoomPhotoProps) {
  const own = useZoomState();
  const { scale, saved, x, y, sx, sy } = zoom ?? own;
  // With a zoom listener, one finger only moves the photo once it's zoomed in, so a sideways
  // swipe around it still works at normal size.
  const [zoomed, setZoomed] = useState(false);
  const report = (value: boolean) => { setZoomed(value); if (active) onZoomChange?.(value); };
  useAnimatedReaction(() => scale.value > 1.01, (now, before) => { if (now !== before) runOnJS(report)(now); }, [active, onZoomChange]);
  const pinch = Gesture.Pinch()
    .enabled(active)
    .onUpdate((e) => {
      scale.value = Math.min(5, Math.max(1, saved.value * e.scale));
    })
    .onEnd(() => {
      saved.value = scale.value;
      if (scale.value === 1) {
        x.value = 0;
        y.value = 0;
        sx.value = 0;
        sy.value = 0;
      }
    });
  const pan = Gesture.Pan()
    .enabled(active && (!onZoomChange || zoomed))
    .onUpdate((e) => {
      if (scale.value > 1) {
        x.value = sx.value + e.translationX;
        y.value = sy.value + e.translationY;
      }
    })
    .onEnd(() => {
      sx.value = x.value;
      sy.value = y.value;
    });
  const tap = Gesture.Tap()
    .enabled(active)
    .numberOfTaps(2)
    .onEnd(() => {
      scale.value = scale.value > 1 ? 1 : 2;
      saved.value = scale.value;
      x.value = 0;
      y.value = 0;
      sx.value = 0;
      sy.value = 0;
    });
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }],
  }));
  return (
    <GestureDetector gesture={Gesture.Simultaneous(pinch, pan, tap)}>
      <Animated.View collapsable={false} style={[fill, style]}>
        <MediaImage allowRetry onSettled={onSettled} media={media} fit="contain" style={fill} {...imageProps} />
      </Animated.View>
    </GestureDetector>
  );
}
