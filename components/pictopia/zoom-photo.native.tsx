import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useSharedValue, useAnimatedStyle } from "react-native-reanimated";
import { MediaImage } from "./media-image";
import { ZoomPhotoProps } from "./zoom-photo.types";
const fill = { flex: 1 };
export function ZoomPhoto({ media }: ZoomPhotoProps) {
  const scale = useSharedValue(1),
    saved = useSharedValue(1),
    x = useSharedValue(0),
    y = useSharedValue(0),
    sx = useSharedValue(0),
    sy = useSharedValue(0);
  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.min(5, Math.max(1, saved.value * e.scale));
    })
    .onEnd(() => {
      saved.value = scale.value;
      if (scale.value === 1) {
        x.value = 0;
        y.value = 0;
      }
    });
  const pan = Gesture.Pan()
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
        <MediaImage media={media} fit="contain" style={fill} />
      </Animated.View>
    </GestureDetector>
  );
}
