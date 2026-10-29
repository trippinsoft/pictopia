import type { ReactNode } from "react";
import type { SharedValue } from "react-native-reanimated";
import type { NativeGesture } from "react-native-gesture-handler";
export interface ExploreGestureProps {
  children: ReactNode;
  x: SharedValue<number>;
  locked: SharedValue<boolean>;
  enabled: boolean;
  nativeScroll: NativeGesture;
  onStart: () => void;
  onCommit: (direction: "left" | "right") => void;
  onCancel: () => void;
}
