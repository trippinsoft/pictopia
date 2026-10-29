import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
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
import type { Media } from "@/lib/pictopia/types";
import { ExploreGesture } from "./explore-gesture";
import { MediaImage } from "./media-image";
import { Text } from "./ui";

export interface ExploreCardHandle {
  discard(direction: "left" | "right"): void;
  reset(): void;
}
interface Props {
  id: string;
  media?: Media;
  active: boolean;
  discarded: boolean;
  nativeScroll: NativeGesture;
  /** Whether a sideways gesture may start: the feed is at rest on this photo. */
  onBegin(id: string): boolean;
  onAction(id: string, direction: "left" | "right", animation: Promise<void>): Promise<void>;
  onAvailability(id: string, available: boolean): void;
}
/** A stable page owns only its horizontal transform. The list owns vertical position. */
export const ExploreCard = memo(
  forwardRef<ExploreCardHandle, Props>(function ExploreCard(
    {
      id,
      media,
      active,
      discarded,
      nativeScroll,
      onBegin,
      onAction,
      onAvailability,
    },
    ref,
  ) {
    const x = useSharedValue(0),
      locked = useSharedValue(false);
    const { width } = useWindowDimensions();
    const [phase, setPhase] = useState<"loading" | "loaded" | "failed">(
      media ? "loading" : "failed",
    );
    const inFlight = useRef(false),
      started = useRef(false),
      alive = useRef(true);
    useEffect(() => {
      alive.current = true;
      return () => {
        alive.current = false;
      };
    }, []);
    useEffect(() => {
      if (!media) setPhase("failed");
    }, [media]);
    useEffect(() => {
      onAvailability(id, phase === "loaded");
    }, [id, phase, onAvailability]);
    useEffect(() => {
      if (phase !== "loading") return;
      const timer = setTimeout(() => setPhase("failed"), 8000);
      return () => clearTimeout(timer);
    }, [phase]);
    const cancel = useCallback(() => {
      if (inFlight.current) return;
      started.current = false;
      locked.value = false;
      x.value = withSpring(0, { damping: 22, stiffness: 260, reduceMotion: ReduceMotion.System });
    }, [locked, x]);
    const begin = useCallback(() => {
      started.current = active && phase === "loaded" && onBegin(id);
      if (!started.current) cancel();
    }, [active, phase, onBegin, id, cancel]);
    const discard = useCallback(
      (direction: "left" | "right") => {
        if (inFlight.current) return;
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
        // A stopped animation (for example OS backgrounding) must not strand a saved action.
        const watchdog = setTimeout(finish, 700);
        x.value = withTiming(
          (direction === "left" ? -1 : 1) * width * 1.4,
          { duration: 190, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System },
          () => runOnJS(finish)(),
        );
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
      [begin, cancel, id, locked, onAction, width, x],
    );
    const reset = useCallback(() => {
      x.value = 0;
      locked.value = false;
      inFlight.current = false;
      started.current = false;
    }, [x, locked]);
    useImperativeHandle(ref, () => ({ discard, reset }), [discard, reset]);
    const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
    return (
      <ExploreGesture
        x={x}
        locked={locked}
        enabled={active && phase === "loaded"}
        nativeScroll={nativeScroll}
        onStart={begin}
        onCommit={discard}
        onCancel={cancel}
      >
        <Animated.View style={[styles.fill, style]} className="bg-background">
          {media && (
            <MediaImage
              key={id}
              media={media}
              fit="contain"
              style={styles.fill}
              showLoading
              onSettled={setPhase}
            />
          )}
          {phase === "failed" && (
            <View
              style={StyleSheet.absoluteFill}
              className="items-center justify-center bg-background px-8"
            >
              <Text className="text-h3 text-center text-foreground">Photo unavailable</Text>
              <Text className="mt-3 text-body text-center text-muted-foreground">
                It may be in iCloud, removed, or outside your allowed photos. Scroll to another page
                or tap Next. You can come back later.
              </Text>
            </View>
          )}
          {phase === "loading" && active && (
            <View className="absolute bottom-4 self-center rounded-full bg-background px-4 py-2">
              <Text className="text-caption text-muted-foreground">
                Loading photo · Next is always available
              </Text>
            </View>
          )}
          {discarded && phase === "loaded" && (
            <View className="absolute left-3 top-3 rounded-full bg-background px-3 py-1">
              <Text className="text-caption text-muted-foreground">In experimental discards</Text>
            </View>
          )}
        </Animated.View>
      </ExploreGesture>
    );
  }),
);
const styles = StyleSheet.create({ fill: { flex: 1 } });
