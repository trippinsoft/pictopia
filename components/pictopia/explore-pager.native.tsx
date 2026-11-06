import { forwardRef, useCallback } from "react";
import { FlatList, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedProps, useAnimatedScrollHandler } from "react-native-reanimated";
import type { ExplorePagerProps } from "./explore-pager.types";
const NativeList = Animated.createAnimatedComponent(FlatList<string>);
export const ExplorePager = forwardRef<FlatList<string>, ExplorePagerProps>(function ExplorePager(
  { nativeScroll, motion, scrollEnabled = true, onScroll, onPointerDragChange: _onPointerDragChange, pendingPage: _pendingPage, ...props },
  ref,
) {
  const reportScroll = useCallback((event: NativeScrollEvent) => {
    onScroll?.({ nativeEvent: event } as NativeSyntheticEvent<NativeScrollEvent>);
  }, [onScroll]);
  const scroll = useAnimatedScrollHandler(event => {
    motion.offset.value = event.contentOffset.y;
    runOnJS(reportScroll)(event);
  });
  // Only an activated horizontal pan holds vertical scrolling. Normal browsing and
  // momentum stay native; React/JS scheduling cannot postpone the axis handoff.
  const animatedProps = useAnimatedProps(() => ({
    scrollEnabled: scrollEnabled && !motion.horizontal.value,
  }));
  return (
    <GestureDetector gesture={nativeScroll}>
      <NativeList ref={ref} {...props} animatedProps={animatedProps} onScroll={scroll} />
    </GestureDetector>
  );
});
