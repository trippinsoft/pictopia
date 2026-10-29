import { forwardRef } from "react";
import { FlatList } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import type { ExplorePagerProps } from "./explore-pager.types";
export const ExplorePager = forwardRef<FlatList<string>, ExplorePagerProps>(function ExplorePager(
  { nativeScroll, onPointerDragChange: _onPointerDragChange, pendingPage: _pendingPage, ...props },
  ref,
) {
  // FlatList's native ScrollView owns all vertical movement. Do not wrap the
  // gesture-handler FlatList again (it already has its own native handler).
  return (
    <GestureDetector gesture={nativeScroll}>
      <FlatList ref={ref} {...props} />
    </GestureDetector>
  );
});
