import type { FlatListProps } from "react-native";
import type { NativeGesture } from "react-native-gesture-handler";
import type { SharedValue } from "react-native-reanimated";

/** Native scroll/swipe coordination lives on the UI thread, independent of React renders. */
export interface ExploreScrollMotion {
  offset: SharedValue<number>;
  horizontal: SharedValue<boolean>;
}
export interface ExplorePagerProps extends FlatListProps<string> {
  nativeScroll: NativeGesture;
  motion: ExploreScrollMotion;
  onPointerDragChange?: (active: boolean) => void;
  /** Page a programmatic scroll is still moving to, so a drag that catches it continues from there. */
  pendingPage?: () => number | undefined;
}
