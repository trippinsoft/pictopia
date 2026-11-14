import {
  type ComponentProps,
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import type { NativeGesture } from "react-native-gesture-handler";
import Animated, {
  Easing,
  ReduceMotion,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { reviewTrace, tracePhoto, traceNativeGesture, type ReviewGestureSample } from "@/lib/pictopia/review-trace";
import type { Media } from "@/lib/pictopia/types";
import { ExploreGesture } from "./explore-gesture";
import type { ExploreScrollMotion } from "./explore-pager.types";
import type { DiscardFlight } from "./discard-flight";
import { flightAt, type FlightPath } from "@/lib/pictopia/flight-math";
import { MediaImage } from "./media-image";
import { VideoPage } from "./video-page";
import { Icon, Text } from "./ui";

export interface ExploreCardHandle {
  discard(direction: "left" | "right"): void;
  reset(): void;
}
interface Props {
  id: string;
  media?: Media;
  /** Discarded and waiting in the trash: shown faded in its own slot, ready to restore. */
  marked?: boolean;
  onRestore?(id: string): void;
  active: boolean;
  /** Next to the shown photo: its display copy is fetched (from iCloud if needed) ahead of
   * time, so it is ready when it scrolls or slides in. */
  nearby?: boolean;
  /** Arriving in the shown slot: from the side it was discarded to (undo), or sliding up/down
   * into the slot a discarded photo just left. Positioned at once, animated once active. */
  entrance?: "left" | "right" | "below" | "above";
  pageHeight: number;
  nativeScroll: NativeGesture;
  motion: ExploreScrollMotion;
  /** Claim the photograph at the captured native offset, even during momentum. */
  onBegin(id: string, offset?: number): boolean;
  onZoomBegin?(id: string): boolean;
  onAction(id: string, direction: "left" | "right", animation: Promise<void>, landed?: Promise<void>): Promise<void>;
  /** A short, still tap on this photo. */
  onTap(id: string): void;
  onAccessibleNext?(): void;
  onAccessiblePrevious?(): void;
  onAccessibleUndo?(): void;
  onEntered(id: string): void;
  onAvailability(id: string, available: boolean): void;
  onUnavailable?(): void;
  /** The photo is zoomed in (the feed pauses paging) or back at its original size. */
  onZoom(id: string, zoomed: boolean): void;
  /** Present in a review: the committed photograph is handed to a flight that carries it to
   * the trash, instead of flying off the side of the screen. */
  flight?: DiscardFlight;
}
/** A stable page owns only its horizontal transform. The list owns vertical position. */
export const ExploreCard = memo(
  forwardRef<ExploreCardHandle, Props>(function ExploreCard(
    {
      id,
      media,
      marked = false,
      onRestore,
      active,
      nearby = false,
      entrance,
      pageHeight,
      nativeScroll,
      motion,
      onBegin,
      onZoomBegin,
      onAction,
      onTap,
      onAccessibleNext,
      onAccessiblePrevious,
      onAccessibleUndo,
      onEntered,
      onAvailability,
      onUnavailable,
      onZoom,
      flight,
    },
    ref,
  ) {
    const { width } = useWindowDimensions();
    const isVideo = media?.type === "video";
    // A load that fails before the photo is shown isn't reported: it is usually a photo not
    // yet fetched from iCloud, and it tries again (with network) the moment it is shown.
    const activeRef = useRef(active);
    activeRef.current = active;
    const [videoPlaying, setVideoPlaying] = useState(false);
    const videoRef = useRef(isVideo);
    videoRef.current = isVideo;
    // Pinch zoom, separate from the discard transform: it scales only the photo, in its page.
    const zoomScale = useSharedValue(1),
      zoomX = useSharedValue(0),
      zoomY = useSharedValue(0),
      zoomPhoto = useSharedValue({ width: media?.width ?? 0, height: media?.height ?? 0 }),
      zoomFrame = useSharedValue({ width, height: pageHeight });
    // Stable, so the native recognizer isn't rebuilt on every render.
    const zoom = useMemo(
      () => ({ scale: zoomScale, x: zoomX, y: zoomY, photo: zoomPhoto, frame: zoomFrame }),
      [zoomScale, zoomX, zoomY, zoomPhoto, zoomFrame],
    );
    const zoomRef = useRef(zoom);
    const [zoomed, setZoomed] = useState(false);
    const zoomedRef = useRef(false);
    useEffect(() => {
      zoomRef.current.photo.value = { width: media?.width ?? 0, height: media?.height ?? 0 };
    }, [media?.width, media?.height]);
    useEffect(() => {
      zoomRef.current.frame.value = { width, height: pageHeight };
    }, [width, pageHeight]);
    const setZoom = useCallback(
      (value: boolean) => {
        if (zoomedRef.current === value) return;
        zoomedRef.current = value;
        setZoomed(value);
        onZoom(id, value);
      },
      [id, onZoom],
    );
    const unzoom = useCallback(
      (animated: boolean) => {
        const z = zoomRef.current,
          to = (value: number) => (animated ? withTiming(value, ZOOM_OUT) : value);
        z.scale.value = to(1);
        z.x.value = to(0);
        z.y.value = to(0);
        setZoom(false);
      },
      [setZoom],
    );
    // An arriving photo mounts where it comes in from, so it never flashes in place first.
    const start = (from: NonNullable<Props["entrance"]>) =>
      from === "below" || from === "above"
        ? { x: 0, y: (from === "below" ? 1 : -1) * pageHeight }
        : { x: (from === "left" ? -1 : 1) * width * 1.5, y: EXIT_DRIFT };
    const x = useSharedValue(entrance ? start(entrance).x : 0),
      y = useSharedValue(entrance ? start(entrance).y : 0),
      // Hidden only once the flying photograph has taken its place, so the handover is
      // invisible: for a frame the two are the same picture in the same spot.
      shown = useSharedValue(1),
      locked = useSharedValue(!!entrance),
      arriving = useSharedValue(!!entrance),
      // From release until the flying copy takes over, the card itself rides the flight's
      // curve on the UI thread, so the photograph never pauses where the finger left it.
      follow = useSharedValue<{ path: FlightPath; reduced: boolean } | null>(null),
      along = useSharedValue(0);
    const arrival = useRef<{ from: Props["entrance"]; animating: boolean }>({
      from: entrance,
      animating: false,
    });
    const [phase, setPhase] = useState<"loading" | "loaded" | "failed">(
      media ? "loading" : "failed",
    );
    const inFlight = useRef(false),
      started = useRef(false),
      alive = useRef(true);
    const flightRef = useRef(flight);
    flightRef.current = flight;
    useEffect(() => {
      alive.current = true;
      reviewTrace("card.mount", { photo: tracePhoto(id) });
      return () => {
        reviewTrace("card.unmount", { photo: tracePhoto(id), started: started.current, inFlight: inFlight.current });
        alive.current = false;
      };
    }, []);
    useEffect(() => {
      if (!media) setPhase("failed");
    }, [media]);
    useEffect(() => {
      onAvailability(id, phase === "loaded");
    }, [id, phase, onAvailability]);
    const unavailableCallback = useRef(onUnavailable); unavailableCallback.current = onUnavailable;
    // Shown again after failing: the image retries at once, so it reads as loading, not failed.
    useLayoutEffect(() => {
      if (active && media) setPhase(current => (current === "failed" ? "loading" : current));
    }, [active]);
    useEffect(() => { if (active && phase === "failed") unavailableCallback.current?.(); }, [active, phase, id]);
    const cancel = useCallback(() => {
      reviewTrace("card.cancel", { photo: tracePhoto(id), inFlight: inFlight.current, started: started.current, locked: locked.value, x: x.value, y: y.value });
      if (inFlight.current) return;
      started.current = false;
      locked.value = false;
      x.value = withSpring(0, SPRING);
      y.value = withSpring(0, SPRING);
    }, [id, locked, x, y]);
    // Not gated on `active`: that prop trails the scroll, and the feed decides from the live
    // offset whether this is the photo on screen.
    const begin = useCallback((offset?: number) => {
      started.current = !arriving.value && phase === "loaded" && onBegin(id, offset);
      reviewTrace("card.begin", { photo: tracePhoto(id), accepted: started.current, offset, arriving: arriving.value, phase, locked: locked.value });
      if (!started.current) cancel();
    }, [arriving, phase, onBegin, id, cancel]);
    const discard = useCallback(
      (direction: "left" | "right", velocity = 0) => {
        reviewTrace("card.discard", { photo: tracePhoto(id), direction, velocity, inFlight: inFlight.current, started: started.current, locked: locked.value, x: x.value, y: y.value });
        if (inFlight.current) return;
        unzoom(false);
        if (!started.current) begin();
        if (!started.current) {
          cancel();
          return;
        }
        inFlight.current = true;
        locked.value = true;
        let finish!: () => void;
        const animation = new Promise<void>((resolve) => {
          finish = resolve;
        });
        const launcher = flightRef.current;
        if (launcher && media) {
          // The photograph itself flies to the trash from exactly where the finger left it.
          // This card stops drawing it the moment the flight is on screen and is removed from
          // the feed right after, so the next photograph is swipeable almost at once.
          const watchdog = setTimeout(finish, 400);
          reviewTrace("flight.launch", { photo: tracePhoto(id), direction, velocity });
          const flightRun = launcher.launch({ id, media, offset: { x: x.value, y: y.value }, direction, velocity });
          if (flightRun.path) {
            along.value = 0;
            follow.value = { path: flightRun.path, reduced: !!flightRun.reduced };
            along.value = withTiming(1, { duration: flightRun.path.duration, easing: Easing.linear, reduceMotion: ReduceMotion.Never });
          }
          void flightRun.handoff
            .catch(() => {})
            .then(() => {
              if (alive.current && inFlight.current) shown.value = 0;
              clearTimeout(watchdog);
              reviewTrace("flight.handoff", { photo: tracePhoto(id), alive: alive.current, inFlight: inFlight.current });
              finish();
            });
          void onAction(id, direction, animation, flightRun.landed).then(() => {
            reviewTrace("card.action.saved", { photo: tracePhoto(id) });
          }).catch((error: unknown) => {
            reviewTrace("card.action.rejected", { photo: tracePhoto(id), errorType: error instanceof Error ? error.name : typeof error });
            launcher.cancel(id);
            if (alive.current) {
              inFlight.current = false;
              follow.value = null;
              shown.value = 1;
              cancel();
            }
          });
          return;
        }
        // A stopped animation (for example OS backgrounding) must not strand a saved action.
        const watchdog = setTimeout(finish, 700);
        // Fly well past the edge, still tilted, drifting slightly down like the review deck.
        const exit = { duration: 220, easing: Easing.out(Easing.quad), reduceMotion: ReduceMotion.System };
        x.value = withTiming((direction === "left" ? -1 : 1) * width * 1.5, exit, () =>
          runOnJS(finish)(),
        );
        y.value = withTiming(y.value + EXIT_DRIFT, exit);
        // The departed card stays offscreen; the feed resets it once the next page shows.
        void onAction(id, direction, animation)
          .catch(() => {
            if (alive.current) {
              inFlight.current = false;
              cancel();
            }
          })
          .finally(() => {
            clearTimeout(watchdog);
          });
      },
      [along, begin, cancel, follow, id, locked, media, onAction, shown, unzoom, width, x, y],
    );
    const reset = useCallback(() => {
      reviewTrace("card.reset", { photo: tracePhoto(id), started: started.current, inFlight: inFlight.current });
      unzoom(false);
      x.value = 0;
      y.value = 0;
      follow.value = null;
      shown.value = 1;
      locked.value = false;
      arriving.value = false;
      arrival.current = { from: undefined, animating: false };
      inFlight.current = false;
      started.current = false;
    }, [id, x, y, follow, shown, locked, arriving, unzoom]);
    const arrived = useCallback(() => {
      reviewTrace("card.arrived", { photo: tracePhoto(id), started: started.current, inFlight: inFlight.current });
      arrival.current = { from: undefined, animating: false };
      follow.value = null;
      shown.value = 1;
      locked.value = false;
      arriving.value = false;
      inFlight.current = false;
      started.current = false;
      onEntered(id);
    }, [arriving, follow, id, locked, onEntered, shown]);
    // Out of view first, before paint: the feed waits for this before revealing the slot.
    useLayoutEffect(() => {
      if (!entrance) {
        // The feed moved on before this photo became active: just put it back in place.
        if (arriving.value && !arrival.current.animating) reset();
        return;
      }
      if (arrival.current.from === entrance && (arriving.value || arrival.current.animating)) return;
      arrival.current = { from: entrance, animating: false };
      locked.value = true;
      arriving.value = true;
      inFlight.current = false;
      started.current = false;
      const from = start(entrance);
      x.value = from.x;
      y.value = from.y;
      follow.value = null;
      shown.value = 1;
    }, [entrance]);
    useEffect(() => {
      if (!entrance || !active || arrival.current.animating) return;
      arrival.current.animating = true;
      // Sideways is the reverse of the fly-out, settling without overshoot. Vertically it
      // moves like the pager's own page scroll. Gestures stay locked until it has landed.
      const vertical = entrance === "below" || entrance === "above";
      const timing = vertical ? SLIDE : ENTER;
      x.value = withTiming(0, timing, () => runOnJS(arrived)());
      y.value = withTiming(0, timing);
    }, [entrance, active]);
    // Moving to another photo (Next, Previous, a discard elsewhere) returns this one to 1×.
    useEffect(() => {
      if (!active) unzoom(false);
    }, [active, unzoom]);
    useEffect(() => () => {
      if (zoomedRef.current) onZoom(id, false);
    }, []);
    // Every discard path (swipe, buttons, accessibility) stops a playing video at once; the
    // card then leaves the shown slot, which releases its player.
    const discardShown = useCallback(
      (direction: "left" | "right", velocity?: number) => {
        if (videoRef.current) setVideoPlaying(false);
        discard(direction, velocity);
      },
      [discard],
    );
    useImperativeHandle(ref, () => ({ discard: discardShown, reset }), [discardShown, reset]);
    // Stable handlers, so the native recognizer is configured once per photo rather than
    // rebuilt (and briefly reconfigured on the UI thread) whenever the shown photo changes.
    const handlers = useRef({ begin, discard: discardShown, cancel, onTap, onBegin, onZoomBegin, setZoom, unzoom });
    handlers.current = { begin, discard: discardShown, cancel, onTap, onBegin, onZoomBegin, setZoom, unzoom };
    const gestureTrace = useCallback((samples: ReviewGestureSample[]) => traceNativeGesture(id, samples), [id]);
    const gestureStart = useCallback((offset?: number) => handlers.current.begin(offset), []);
    const gestureCommit = useCallback(
      (direction: "left" | "right", velocity: number) => handlers.current.discard(direction, velocity),
      [],
    );
    const gestureCancel = useCallback(() => handlers.current.cancel(), []);
    // While zoomed, a tap returns the photo to its original size instead of undoing.
    // A video's tap plays or pauses it; photos keep their existing tap behaviour.
    const gestureTap = useCallback(() => {
      if (zoomedRef.current) handlers.current.unzoom(true);
      else if (videoRef.current) setVideoPlaying((p) => !p);
      else handlers.current.onTap(id);
    }, [id]);
    // Zooming claims the photo like a swipe does (snapping a page still settling); a photo
    // that isn't the one on screen, or a feed mid-discard, springs straight back.
    const zoomStart = useCallback(() => {
      if (zoomedRef.current) return;
      // Videos have no zoom: pinching one springs straight back.
      if (videoRef.current) return handlers.current.unzoom(true);
      if ((handlers.current.onZoomBegin ?? handlers.current.onBegin)(id)) handlers.current.setZoom(true);
      else handlers.current.unzoom(true);
    }, [id]);
    const zoomEnd = useCallback(() => handlers.current.setZoom(false), []);
    const zoomStyle = useAnimatedStyle(() => ({
      transform: [
        { translateX: zoom.x.value },
        { translateY: zoom.y.value },
        { scale: zoom.scale.value },
      ],
    }));
    const style = useAnimatedStyle(() => {
      const riding = follow.value;
      if (riding) {
        const at = flightAt(riding.path, along.value);
        return {
          opacity: shown.value * (riding.reduced ? Math.max(0, 1 - along.value) : at.opacity),
          transform: [
            { translateX: at.x },
            { translateY: at.y },
            { scale: at.scale },
            { rotate: `${at.rotate}deg` },
          ],
        };
      }
      return {
        opacity: shown.value,
        transform: [
          { translateX: x.value },
          { translateY: y.value },
          { scale: 1 },
          // Tilts toward the side it is dragged to, matching the review deck.
          { rotate: `${x.value / 22}deg` },
        ],
      };
    });
    // Either side means discard (a reversible mark, never a deletion): the label appears on
    // whichever side the photo uncovers.
    // Gone the instant the photograph is handed to its flight, so no label is left behind.
    const discardLeft = useAnimatedStyle(() =>
      labelStyle(arriving.value || !shown.value || follow.value ? 0 : x.value),
    );
    const discardRight = useAnimatedStyle(() =>
      labelStyle(arriving.value || !shown.value || follow.value ? 0 : -x.value),
    );
    return (
      // Active accessibility must not flatten/unflatten this ancestor during a live pan.
      // Keep its native parent stable while the touched photograph is claimed.
      <View style={styles.fill} collapsable={false} accessible={active} accessibilityRole="image" accessibilityLabel="Photograph"
        accessibilityActions={[{ name: "increment", label: "Next photograph" }, { name: "decrement", label: "Previous photograph" }, { name: "mark", label: "Discard photograph" }, { name: "undo", label: "Undo last discard" }]}
        onAccessibilityAction={event => {
          switch (event.nativeEvent.actionName) {
            case "increment": onAccessibleNext?.(); break;
            case "decrement": onAccessiblePrevious?.(); break;
            case "mark": discardShown("left"); break;
            case "undo": onAccessibleUndo?.(); break;
          }
        }}>
      <ExploreGesture
        x={x}
        y={y}
        locked={locked}
        // Live on every loaded photo, including one the pager has only just reached, so the
        // first sideways swipe after scrolling can claim the live native position.
        enabled={phase === "loaded" && !marked}
        tapEnabled
        zoom={zoom}
        zoomed={zoomed}
        nativeScroll={nativeScroll}
        motion={motion}
        onTap={gestureTap}
        onZoomStart={zoomStart}
        onZoomEnd={zoomEnd}
        onTrace={gestureTrace}
        onStart={gestureStart}
        onCommit={gestureCommit}
        onCancel={gestureCancel}
      >
        <Animated.View style={[styles.fill, style]}>
          {media && (
            <Animated.View style={[styles.fill, zoomStyle, marked ? styles.marked : undefined]}>
              <MediaImage
                key={id}
                media={media}
                fit="contain"
                style={styles.fill}
                showLoading
                active={active}
                network={active || nearby}
                quietFailure={!active}
                allowRetry
                failureContent={isVideo ? <View className="flex-1 bg-background" /> : undefined}
                // A video is reviewed and discarded by its poster, like a photo by its pixels:
                // playback (and any iCloud download) is never required. A poster failure
                // can't undo a first frame that playback already displayed.
                onSettled={state => setPhase(current => {
                  if (state !== "failed") return state;
                  if (isVideo && current === "loaded") return current;
                  return activeRef.current ? "failed" : "loading";
                })}
              />
            </Animated.View>
          )}
          {media && isVideo && (
            <VideoPage media={media} active={active} playing={videoPlaying} onPlayingChange={setVideoPlaying} onReady={() => setPhase("loaded")} nativeScroll={nativeScroll} />
          )}
          {phase === "failed" && active && !isVideo && (
            <View
              style={StyleSheet.absoluteFill}
              className="items-center justify-center bg-background px-8"
            >
              <Text className="text-h3 text-center text-foreground">Photo unavailable</Text>
              <Text className="mt-3 text-body text-center text-muted-foreground">
                It may be in iCloud, removed, or outside your allowed photos. Scroll to another photo. You can come back later.
              </Text>
            </View>
          )}
          {phase === "loading" && active && !isVideo && (
            <View className="absolute bottom-4 self-center rounded-full bg-background px-4 py-2">
              <Text className="text-caption text-muted-foreground">
                Loading photo · scroll to continue
              </Text>
            </View>
          )}
        </Animated.View>
      </ExploreGesture>
        {/* Drawn with the page itself, so it is already there as the photo scrolls into view. */}
        {marked && (
          <View pointerEvents="box-none" style={StyleSheet.absoluteFill} className="items-center justify-center">
            <View className="items-center gap-3 rounded-3xl bg-background/90 px-6 py-5">
              <View className="flex-row items-center gap-2">
                <Icon name="Trash2" size={20} className="text-destructive" />
                <Text className="text-h4 text-foreground">Discarded</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Restore this photo"
                onPress={() => onRestore?.(id)}
                className="min-h-12 flex-row items-center gap-2 rounded-full bg-sun px-5 active:opacity-80"
              >
                <Icon name="Undo2" size={18} className="text-primary-foreground" />
                <Text className="text-button text-primary-foreground">Restore</Text>
              </Pressable>
            </View>
          </View>
        )}
        {active && zoomed && (
          <View
            pointerEvents="none"
            accessibilityLiveRegion="polite"
            className="absolute top-3 self-center rounded-full bg-background/80 px-4 py-2"
          >
            <Text className="text-caption text-foreground">Pinch out or tap to return</Text>
          </View>
        )}
        {active && (
          <>
            <DiscardLabel style={[styles.label, styles.left, discardLeft]} />
            <DiscardLabel style={[styles.label, styles.right, discardRight]} />
          </>
        )}
      </View>
    );
  }),
);
const EXIT_DRIFT = 40;
const ENTER = { duration: 340, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System };
// Reads as the feed scrolling the next photo up into the freed slot: a soft start and a long,
// gentle settle, so the travel is seen rather than landing almost at once.
const SLIDE = {
  duration: 460,
  easing: Easing.bezier(0.3, 0.1, 0.2, 1),
  reduceMotion: ReduceMotion.System,
};
const ZOOM_OUT = { duration: 180, reduceMotion: ReduceMotion.System };
const SPRING = { damping: 18, stiffness: 220, mass: 0.7, reduceMotion: ReduceMotion.System };
/** Fades in with the drag and reaches full size at the discard threshold (64 px). */
function labelStyle(uncovered: number) {
  "worklet";
  const progress = Math.min(1, Math.max(0, (uncovered - 12) / 52));
  return { opacity: progress, transform: [{ scale: 0.85 + 0.15 * progress }] };
}
function DiscardLabel({ style }: { style: ComponentProps<typeof Animated.View>["style"] }) {
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={style}
      className="items-center rounded-3xl bg-background/85 px-5 py-4"
    >
      <Icon name="Trash2" size={40} className="text-destructive" />
      <Text className="mt-2 text-h3 text-destructive">Discard</Text>
    </Animated.View>
  );
}
const styles = StyleSheet.create({
  fill: { flex: 1 },
  marked: { opacity: 0.35 },
  label: { position: "absolute", top: "40%" },
  left: { left: 16 },
  right: { right: 16 },
});
