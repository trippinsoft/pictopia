import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "@/theming/ThemeProvider";
import Animated, {
  Easing,
  SharedValue,
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Media } from "@/lib/pictopia/types";
import { swipeDecision } from "@/lib/pictopia/swipe-physics";
import { SwipeGesture } from "./swipe-gesture";
import { MediaImage, MediaSettled } from "./media-image";
import { Text, Icon } from "./ui";
const SPRING = { damping: 18, stiffness: 220, mass: 0.7 };
export interface SwipeCardHandle {
  /** Flies the card off-screen; used by the Keep / Set aside buttons. */
  fling: (direction: 1 | -1) => void;
}
interface Props {
  /** undefined while the record loads; null when the item is unavailable. */
  media: Media | null | undefined;
  isTop: boolean;
  /** The deck currently accepts a decision for this card. */
  interactive: boolean;
  /** A decision for this card is in flight. */
  committing: boolean;
  width: number;
  reduced: boolean;
  reversed: boolean;
  /** Shared drag distance of the top card, used to grow the card underneath. */
  drag: SharedValue<number>;
  /** Slides in from this side (1 right, -1 left) when it returns after an undo. */
  enterFrom?: 1 | -1;
  onCommit: (decision: "keep" | "delete") => boolean;
  onAnimated: () => void;
  onSettled: (state: MediaSettled) => void;
  onOpen: () => void;
}
export const SwipeCard = forwardRef<SwipeCardHandle, Props>(function SwipeCard(
  {
    media,
    isTop,
    interactive,
    committing,
    width,
    reduced,
    reversed,
    drag,
    enterFrom,
    onCommit,
    onAnimated,
    onSettled,
    onOpen,
  },
  ref,
) {
  const { theme } = useTheme();
  const x = useSharedValue(enterFrom && !reduced ? enterFrom * width : 0),
    y = useSharedValue(0),
    fade = useSharedValue(1);
  const callbacks = useRef({ onAnimated });
  callbacks.current = { onAnimated };
  const animatedDone = useCallback(() => callbacks.current.onAnimated(), []);
  const fling = useCallback(
    (direction: 1 | -1) => {
      if (reduced) {
        fade.value = withTiming(0, { duration: 140 }, (finished) => {
          if (finished) runOnJS(animatedDone)();
        });
        return;
      }
      // Fly well past the edge so the card fully leaves the screen.
      x.value = withTiming(
        direction * width * 1.5,
        { duration: 240, easing: Easing.out(Easing.quad) },
        (finished) => {
          if (finished) runOnJS(animatedDone)();
        },
      );
      y.value = withTiming(y.value + 30, { duration: 240 });
    },
    [reduced, width, x, y, fade, animatedDone],
  );
  useImperativeHandle(ref, () => ({ fling }), [fling]);
  const springBack = useCallback(() => {
    x.value = reduced ? 0 : withSpring(0, SPRING);
    y.value = reduced ? 0 : withSpring(0, SPRING);
    fade.value = reduced ? 1 : withTiming(1, { duration: 120 });
  }, [reduced, x, y, fade]);
  // Undo: slide the returning photo back into place.
  useEffect(() => {
    if (enterFrom && !reduced) x.value = withSpring(0, SPRING);
  }, []);
  // A failed save brings the card back instead of leaving it off-screen.
  const wasCommitting = useRef(committing);
  useEffect(() => {
    if (wasCommitting.current && !committing && isTop) springBack();
    wasCommitting.current = committing;
  }, [committing, isTop, springBack]);
  useEffect(() => {
    if (isTop) drag.value = 0;
  }, [isTop, drag]);
  useAnimatedReaction(
    () => x.value,
    (value) => {
      if (isTop) drag.value = value;
    },
    [isTop],
  );
  const handleCommit = useCallback(
    (direction: 1 | -1) => {
      if (onCommit(swipeDecision(direction, reversed))) fling(direction);
      else springBack();
    },
    [onCommit, reversed, fling, springBack],
  );
  const cardStyle = useAnimatedStyle(() => {
    if (!isTop) {
      // The next photo waits slightly smaller underneath and grows as the top card leaves.
      const progress = Math.min(1, Math.abs(drag.value) / Math.max(1, width * 0.6));
      return {
        opacity: 1,
        transform: [{ scale: interpolate(progress, [0, 1], [0.94, 1]) }],
      };
    }
    return {
      opacity: fade.value,
      transform: [
        { translateX: x.value },
        { translateY: y.value },
        { rotate: `${reduced ? 0 : x.value / 22}deg` },
      ],
    };
  }, [isTop, reduced, width]);
  const keepSide = reversed ? -1 : 1;
  const keepStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0, (keepSide * x.value) / 80)),
  }));
  const asideStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0, (-keepSide * x.value) / 80)),
  }));
  return (
    <Animated.View
      pointerEvents={isTop ? "auto" : "none"}
      // The card waiting underneath is decorative until it moves to the top.
      accessibilityElementsHidden={!isTop}
      importantForAccessibility={isTop ? "auto" : "no-hide-descendants"}
      style={[StyleSheet.absoluteFill, cardStyle]}
    >
      <SwipeGesture
        x={x}
        y={y}
        enabled={isTop && interactive}
        threshold={Math.min(120, width * 0.28)}
        onCommit={handleCommit}
        onCancel={springBack}
      >
        <Animated.View
          collapsable={false}
          style={styles.card}
          className="border border-border bg-secondary"
        >
          {media === undefined ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator color={theme.colors.primary} />
            </View>
          ) : media ? (
            <Pressable
              accessibilityLabel={isTop ? "Open a larger view" : undefined}
              disabled={!isTop}
              onPress={onOpen}
              style={styles.fill}
            >
              <MediaImage
                key={media.id}
                media={media}
                fit="contain"
                showLoading
                onSettled={onSettled}
                style={styles.fill}
              />
              <Animated.View
                pointerEvents="none"
                style={[keepStyle, styles.badge, reversed ? styles.right : styles.left]}
                className="rounded-2xl border-2 border-primary bg-card px-5 py-3"
              >
                <Text className="text-h2 text-primary">Keep</Text>
              </Animated.View>
              <Animated.View
                pointerEvents="none"
                style={[asideStyle, styles.badge, reversed ? styles.left : styles.right]}
                className="rounded-2xl border-2 border-destructive bg-card px-5 py-3"
              >
                <Text className="text-h2 text-destructive">Set aside</Text>
              </Animated.View>
              {media.type === "video" && (
                <View className="absolute bottom-4 right-4 flex-row items-center gap-2 rounded-full bg-card px-4 py-2">
                  <Icon name="Play" size={16} className="text-foreground" />
                  <Text className="text-caption text-foreground">Play video</Text>
                </View>
              )}
            </Pressable>
          ) : (
            <View className="flex-1 items-center justify-center p-8">
              <Icon name="CloudOff" size={30} className="text-muted-foreground" />
              <Text className="mt-3 text-h5 text-center text-foreground">
                This one isn’t available
              </Text>
              <Text className="mt-2 text-body text-center text-muted-foreground">
                It may have moved, or photo access changed. Skip it to keep going.
              </Text>
            </View>
          )}
        </Animated.View>
      </SwipeGesture>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  card: { flex: 1, overflow: "hidden", borderRadius: 28 },
  fill: { flex: 1 },
  badge: { position: "absolute", top: 20 },
  left: { left: 20 },
  right: { right: 20 },
});
