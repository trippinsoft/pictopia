import { forwardRef, useCallback, useImperativeHandle } from "react";
import { FlatList, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  ReduceMotion,
  runOnJS,
  scrollTo,
  useAnimatedProps,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { GLIDE_DURATION, glideEase } from "@/lib/pictopia/glide";
import type { ExplorePagerProps } from "./explore-pager.types";
const NativeList = Animated.createAnimatedComponent(FlatList<string>);
export const ExplorePager = forwardRef<FlatList<string>, ExplorePagerProps>(function ExplorePager(
  { nativeScroll, motion, scrollEnabled = true, onScroll, onScrollBeginDrag, onPointerDragChange: _onPointerDragChange, pendingPage: _pendingPage, glide, ...props },
  ref,
) {
  const list = useAnimatedRef<FlatList<string>>();
  useImperativeHandle(ref, () => list.current as FlatList<string>, [list]);
  const reportScroll = useCallback((event: NativeScrollEvent) => {
    onScroll?.({ nativeEvent: event } as NativeSyntheticEvent<NativeScrollEvent>);
  }, [onScroll]);
  const scroll = useAnimatedScrollHandler(event => {
    motion.offset.value = event.contentOffset.y;
    runOnJS(reportScroll)(event);
  });
  // A programmatic glide, stepped on the UI thread at the shared pace rather than the
  // platform's own (much quicker) animated scroll.
  const from = useSharedValue(0), to = useSharedValue(0), progress = useSharedValue(0), gliding = useSharedValue(false);
  useDerivedValue(() => {
    if (!gliding.value) return;
    scrollTo(list, 0, from.value + (to.value - from.value) * progress.value, false);
  });
  if (glide)
    glide.current = (offset: number) => {
      cancelAnimation(progress);
      from.value = motion.offset.value;
      to.value = offset;
      progress.value = 0;
      gliding.value = true;
      progress.value = withTiming(1, { duration: GLIDE_DURATION, easing: glideEase, reduceMotion: ReduceMotion.Never }, () => {
        gliding.value = false;
      });
    };
  // Only an activated horizontal pan holds vertical scrolling. Normal browsing and
  // momentum stay native; React/JS scheduling cannot postpone the axis handoff.
  const animatedProps = useAnimatedProps(() => ({
    scrollEnabled: scrollEnabled && !motion.horizontal.value,
  }));
  return (
    <GestureDetector gesture={nativeScroll}>
      <NativeList
        ref={list}
        {...props}
        animatedProps={animatedProps}
        onScroll={scroll}
        onScrollBeginDrag={(event) => {
          // The finger takes over from a glide still under way.
          cancelAnimation(progress);
          gliding.value = false;
          onScrollBeginDrag?.(event);
        }}
      />
    </GestureDetector>
  );
});
