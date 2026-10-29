import type { FlatListProps } from "react-native";
import type { NativeGesture } from "react-native-gesture-handler";
export interface ExplorePagerProps extends FlatListProps<string> {
  nativeScroll: NativeGesture;
  onPointerDragChange?: (active: boolean) => void;
  /** Page a programmatic scroll is still moving to, so a drag that catches it continues from there. */
  pendingPage?: () => number | undefined;
}
