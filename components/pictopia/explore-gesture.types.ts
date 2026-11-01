import type { ReactNode } from "react";
import type { SharedValue } from "react-native-reanimated";
import type { NativeGesture } from "react-native-gesture-handler";
/** The photo's own zoom, inside its page. Offsets are from the page centre. */
export interface ExploreZoom {
  scale: SharedValue<number>;
  x: SharedValue<number>;
  y: SharedValue<number>;
  photo: SharedValue<{ width: number; height: number }>;
  frame: SharedValue<{ width: number; height: number }>;
}
export interface ExploreGestureProps {
  children: ReactNode;
  x: SharedValue<number>;
  /** Follows the finger only after a sideways drag has taken the gesture. */
  y: SharedValue<number>;
  locked: SharedValue<boolean>;
  /** Sideways dragging, and pinching to zoom. */
  enabled: boolean;
  /** Short, still taps (undo, or leaving zoom). Never reported for a drag in either axis. */
  tapEnabled: boolean;
  zoom: ExploreZoom;
  /** Zoomed in: one finger pans the photo and sideways discarding is off. */
  zoomed: boolean;
  nativeScroll: NativeGesture;
  onTap: () => void;
  onStart: () => void;
  /** The sideways swipe is committed; `velocity` is its horizontal speed in points per
   * second, which sets how far the photograph carries on before it curves to the trash. */
  onCommit: (direction: "left" | "right", velocity: number) => void;
  onCancel: () => void;
  /** A pinch began on this photo. */
  onZoomStart: () => void;
  /** The photo settled back at its original size. */
  onZoomEnd: () => void;
}
