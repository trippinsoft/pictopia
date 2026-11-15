import { useSharedValue, withTiming } from "react-native-reanimated";
/** Zoom shared by several photos, so switching between look-alikes keeps the same close-up. */
export function useZoomState() {
  return {
    scale: useSharedValue(1), saved: useSharedValue(1),
    x: useSharedValue(0), y: useSharedValue(0), sx: useSharedValue(0), sy: useSharedValue(0),
  };
}
export type ZoomState = ReturnType<typeof useZoomState>;
export function resetZoom(z: ZoomState, animated = true) {
  const to = (v: number) => (animated ? withTiming(v, { duration: 180 }) : v);
  z.scale.value = to(1); z.x.value = to(0); z.y.value = to(0);
  z.saved.value = 1; z.sx.value = 0; z.sy.value = 0;
}
