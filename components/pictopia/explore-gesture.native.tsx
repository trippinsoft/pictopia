import { useMemo } from "react";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS, useSharedValue, withTiming } from "react-native-reanimated";
import { exploreDirection } from "@/lib/pictopia/explore";
import { DOUBLE_TAP_MS, ZOOM_SNAP, clampScale, clampTo, focalOffset, panLimit, toggleZoomAt } from "@/lib/pictopia/zoom-math";
import type { ExploreGestureProps } from "./explore-gesture.types";
export function ExploreGesture({
  children,
  x,
  y,
  locked,
  enabled,
  tapEnabled,
  zoom,
  zoomed,
  nativeScroll,
  onTap,
  onStart,
  onCommit,
  onCancel,
  onZoomStart,
  onZoomEnd,
}: ExploreGestureProps) {
  const pinching = useSharedValue(false);
  const origin = useSharedValue({ scale: 1, x: 0, y: 0, fx: 0, fy: 0 });
  const gesture = useMemo(() => {
    // Two fingers zoom the photo inside its own page. Not while a sideways drag or discard
    // has moved the card, so a pinch can never become (or interrupt into) a discard.
    const pinch = Gesture.Pinch()
      .enabled(enabled)
      .onStart((e) => {
        if (locked.value || Math.abs(x.value) > 1) return;
        pinching.value = true;
        const f = zoom.frame.value;
        origin.value = {
          scale: zoom.scale.value,
          x: zoom.x.value,
          y: zoom.y.value,
          fx: e.focalX - f.width / 2,
          fy: e.focalY - f.height / 2,
        };
        runOnJS(onZoomStart)();
      })
      .onUpdate((e) => {
        if (!pinching.value) return;
        const f = zoom.frame.value,
          o = origin.value,
          s = clampScale(o.scale * e.scale),
          limit = panLimit(s, zoom.photo.value, f);
        zoom.scale.value = s;
        zoom.x.value = clampTo(focalOffset(e.focalX - f.width / 2, o.fx, o.x, o.scale, s), limit.x);
        zoom.y.value = clampTo(focalOffset(e.focalY - f.height / 2, o.fy, o.y, o.scale, s), limit.y);
      })
      .onFinalize(() => {
        if (!pinching.value) return;
        pinching.value = false;
        if (zoom.scale.value >= ZOOM_SNAP) return;
        zoom.scale.value = withTiming(1, { duration: 180 });
        zoom.x.value = withTiming(0, { duration: 180 });
        zoom.y.value = withTiming(0, { duration: 180 });
        runOnJS(onZoomEnd)();
      });
    // Zoomed: one finger moves the photo within its edges. The pager is paused meanwhile.
    const look = Gesture.Pan()
      .enabled(enabled && zoomed)
      .maxPointers(1)
      .minDistance(4)
      .onStart(() => {
        origin.value = { ...origin.value, x: zoom.x.value, y: zoom.y.value };
      })
      .onUpdate((e) => {
        if (pinching.value) return;
        const limit = panLimit(zoom.scale.value, zoom.photo.value, zoom.frame.value);
        zoom.x.value = clampTo(origin.value.x + e.translationX, limit.x);
        zoom.y.value = clampTo(origin.value.y + e.translationY, limit.y);
      });
    // One finger only: a second finger fails it, so pinching never discards.
    const pan = Gesture.Pan()
        .enabled(enabled && !zoomed)
        .maxPointers(1)
        .activeOffsetX([-12, 12])
        .failOffsetY([-12, 12])
        .blocksExternalGesture(nativeScroll)
        .onStart(() => {
          if (!locked.value) runOnJS(onStart)();
        })
        .onUpdate((e) => {
          if (locked.value) return;
          // Once sideways intent wins, the photo moves freely under the thumb.
          x.value = e.translationX;
          y.value = e.translationY;
        })
        .onEnd((e, success) => {
          if (locked.value) return;
          // The horizontal recognizer has already won; vertical drift cannot switch axes.
          const direction =
            success && !pinching.value ? exploreDirection(e.translationX, 0, e.velocityX, 0) : null;
          if (direction === "left" || direction === "right") {
            locked.value = true;
            runOnJS(onCommit)(direction, e.velocityX);
          } else runOnJS(onCancel)();
        })
        .onFinalize((_e, success) => {
          if (!success && !locked.value) runOnJS(onCancel)();
        });
    // Double tap zooms toward the tapped spot, or back to 1×. The single tap (undo, or leaving
    // zoom) waits for it to fail, so a double tap never also undoes.
    const doubleTap = Gesture.Tap()
      .enabled(enabled)
      .numberOfTaps(2)
      .maxDelay(DOUBLE_TAP_MS)
      .maxDistance(10)
      .onEnd((e, success) => {
        if (!success || locked.value || pinching.value || Math.abs(x.value) > 1) return;
        const f = zoom.frame.value,
          target = toggleZoomAt(zoom.scale.value, { x: e.x - f.width / 2, y: e.y - f.height / 2 }, zoom.photo.value, f),
          timing = { duration: 220 };
        if (target.scale > 1) runOnJS(onZoomStart)();
        zoom.scale.value = withTiming(target.scale, timing);
        zoom.x.value = withTiming(target.x, timing);
        zoom.y.value = withTiming(target.y, timing);
        if (target.scale === 1) runOnJS(onZoomEnd)();
      });
    // Fails as soon as the finger moves, so neither a sideways pan nor native scrolling
    // ever ends as a tap. Racing the pan means at most one of them wins a touch.
    const tap = Gesture.Tap()
      .enabled(tapEnabled)
      .maxDistance(10)
      .maxDuration(300)
      .onEnd((_e, success) => {
        if (success && !locked.value && !pinching.value) runOnJS(onTap)();
      });
    return Gesture.Simultaneous(pinch, Gesture.Race(zoomed ? look : pan, Gesture.Exclusive(doubleTap, tap)));
  }, [enabled, tapEnabled, zoomed, x, y, locked, zoom, pinching, origin, nativeScroll, onTap, onStart, onCommit, onCancel, onZoomStart, onZoomEnd]);
  return <GestureDetector gesture={gesture}>{children}</GestureDetector>;
}
