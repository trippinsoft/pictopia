import { useMemo, useRef } from "react";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { ScrubberBar, useScrub } from "./video-scrubber-bar";
import type { VideoScrubberProps } from "./video-scrubber.types";

/** Tap anywhere on the track to jump there, or drag along it to scrub. The touch is claimed
 * the moment it lands, so it never scrolls the feed, discards, or toggles playback. */
export function VideoScrubber({ duration, position, onSeek, nativeScroll }: VideoScrubberProps) {
  const scrub = useScrub(duration, position, onSeek);
  const width = useRef(1), latest = useRef(scrub); latest.current = scrub;
  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .runOnJS(true)
      .manualActivation(true)
      .shouldCancelWhenOutside(false)
      .onTouchesDown((_, state) => state.activate())
      .onStart(e => latest.current.move(e.x / width.current))
      .onUpdate(e => latest.current.move(e.x / width.current))
      .onEnd(e => latest.current.end(e.x / width.current))
      .onFinalize(() => latest.current.end());
    return nativeScroll ? pan.blocksExternalGesture(nativeScroll) : pan;
  }, [nativeScroll]);
  return (
    <ScrubberBar
      shown={scrub.shown}
      duration={duration}
      dragging={scrub.dragging}
      track={children => (
        <GestureDetector gesture={gesture}>
          <View
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel="Video position"
            accessibilityValue={{ min: 0, max: Math.round(duration), now: Math.round(scrub.shown) }}
            accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
            onAccessibilityAction={e => onSeek(Math.min(duration, Math.max(0, scrub.shown + (e.nativeEvent.actionName === "increment" ? 5 : -5))))}
            onLayout={e => { width.current = Math.max(1, e.nativeEvent.layout.width); }}
            className="flex-1"
          >
            {children}
          </View>
        </GestureDetector>
      )}
    />
  );
}
