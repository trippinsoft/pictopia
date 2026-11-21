import { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Modal, Platform, Pressable, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import Animated, { cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming, type SharedValue } from "react-native-reanimated";
import { Icon, Text } from "./ui";
import { nextReviewStep, REVIEW_HINTS, REVIEW_SPOTLIGHT, reviewSteps, type ReviewGuidance, type ReviewStep } from "@/lib/pictopia/review-guidance";
import { placeCard } from "@/lib/pictopia/home-tour";
import { reviewGuidance } from "@/services/review-guidance";
import { measureTarget } from "./tour-targets";
import { SpotlightMask, SpotlightRing, type SpotlightHole } from "./spotlight";

/** The heart exists only in the native app, so only there is the heart tip shown. */
const FAVORITES = Platform.OS !== "web";
/** How long the heart tip looks for the heart before showing as a plain card instead. */
const FIND_TRIES = 10, FIND_EVERY_MS = 250;

export function useReviewGuidance(enabled: boolean, favorites = FAVORITES) {
  const steps = reviewSteps(favorites);
  const [done, setDone] = useState<ReviewGuidance>();
  const state = useRef(done); state.current = done;
  useFocusEffect(useCallback(() => {
    let alive = true;
    if (enabled) void reviewGuidance.load().then(value => { if (alive) setDone(value); }).catch(() => {});
    return () => { alive = false; };
  }, [enabled]));
  const complete = useCallback((step: ReviewStep) => {
    if (!state.current || nextReviewStep(state.current, steps) !== step) return;
    const next = { ...state.current, [step]: true }; state.current = next; setDone(next);
    void reviewGuidance.complete(step).catch(() => {});
  }, [steps]);
  return { step: enabled && done ? nextReviewStep(done, steps) : undefined, complete };
}

/** One tip's card: icon, "Tip n of N" with Got it beside it, title and body. */
function HintCard({ step, index, total, motion, onNext }: { step: ReviewStep; index: number; total: number; motion: SharedValue<number>; onNext(step: ReviewStep): void }) {
  const animated = useAnimatedStyle(() => ({
    transform: step === "browse" ? [{ translateY: -10 * motion.value }]
      : step === "favorite" ? [{ scale: 1 + 0.14 * motion.value }]
      : [{ translateX: 14 * motion.value }, { rotate: `${8 * motion.value}deg` }],
  }));
  const hint = REVIEW_HINTS[step];
  const last = index === total - 1;
  // "Got it" sits beside the tip number so the title and text get the card's full width and
  // never break a single word onto its own line.
  return (
    <View accessibilityLiveRegion="polite" className="w-full flex-row items-start gap-3 rounded-[22px] bg-card/95 p-3">
      <View className="mt-1 h-11 w-11 items-center justify-center rounded-full bg-sun">
        <Animated.View style={animated}><Icon name={step === "browse" ? "Hand" : step === "favorite" ? "Heart" : "MoveHorizontal"} size={21} className="text-primary-foreground" /></Animated.View>
      </View>
      <View className="flex-1">
        <View className="flex-row items-center justify-between">
          <Text className="text-caption text-muted-foreground">{`Tip ${index + 1} of ${total}`}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={last ? "Got it, finish tips" : "Got it, next tip"} onPress={() => onNext(step)} hitSlop={6} className="min-h-9 justify-center rounded-full bg-sun px-4">
            <Text className="text-button text-primary-foreground">Got it</Text>
          </Pressable>
        </View>
        <Text className="text-headline text-foreground">{hint.title}</Text>
        <Text className="text-caption leading-5 text-muted-foreground">{hint.body}</Text>
      </View>
    </View>
  );
}

/** Where a tip's spotlight is: `hole` once its control is found on screen, `null` when it
 * couldn't be found (the tip then shows as a plain card, never blocking the review). */
type Spot = { step: ReviewStep; hole: SpotlightHole | null };

/** Got it advances each tip. The heart tip spotlights the real control with a one-time pulse.
 * The review layout stays in place, and showing a tip never changes the photo. */
export function ReviewHint({ step, onNext, favorites = FAVORITES }: { step?: ReviewStep; onNext(step: ReviewStep): void; favorites?: boolean }) {
  const reduced = useReducedMotion(), motion = useSharedValue(0);
  const { width: windowW, height: windowH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const steps = reviewSteps(favorites);
  const target = step ? REVIEW_SPOTLIGHT[step] : undefined;
  const [spot, setSpot] = useState<Spot>();
  // Per-step card height, for placing the spotlight card. The card is never hidden while
  // waiting for it (iOS reports layout only when it changes).
  const [heights, setHeights] = useState<Partial<Record<ReviewStep, number>>>({});

  useEffect(() => {
    motion.value = 0;
    if (step && !reduced) motion.value = withRepeat(withSequence(withTiming(1, { duration: 650 }), withTiming(0, { duration: 650 })), -1);
    if (step) AccessibilityInfo.announceForAccessibility(`${REVIEW_HINTS[step].title}. ${REVIEW_HINTS[step].body}`);
    return () => cancelAnimation(motion);
  }, [step, reduced, motion]);

  // Find the spotlit control, retrying briefly while the reviewer settles.
  useEffect(() => {
    if (!step || !target) return;
    let alive = true, tries = 0, timer: ReturnType<typeof setTimeout> | undefined;
    const look = () => {
      void measureTarget(target).then(r => {
        if (!alive) return;
        const visible = !!r && r.y < windowH && r.y + r.height > 0 && r.x < windowW && r.x + r.width > 0;
        if (r && visible) {
          const pad = 6, size = Math.max(r.width, r.height) + pad * 2;
          setSpot({ step, hole: { name: target, x: r.x + r.width / 2 - size / 2, y: r.y + r.height / 2 - size / 2, width: size, height: size, radius: size / 2 } });
        } else if (++tries >= FIND_TRIES) setSpot({ step, hole: null });
        else timer = setTimeout(look, FIND_EVERY_MS);
      });
    };
    timer = setTimeout(look, 120);
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [step, target, windowW, windowH]);

  if (!step) return null;
  const index = steps.indexOf(step), total = steps.length;
  const card = <HintCard step={step} index={index} total={total} motion={motion} onNext={onNext} />;
  const inline = <View pointerEvents="box-none" className="absolute bottom-3 left-3 right-3 items-center"><View className="w-full max-w-md">{card}</View></View>;
  if (!target) return inline;
  // Briefly (at most FIND_TRIES × FIND_EVERY_MS) nothing shows while the heart is found.
  if (spot?.step !== step) return null;
  if (!spot.hole) return inline;

  const hole = spot.hole;
  const cardW = Math.min(windowW - 24, 448);
  const cardX = (windowW - cardW) / 2;
  const cardPos = placeCard([hole], { height: heights[step] ?? 120 }, { height: windowH, top: insets.top + 8, bottom: insets.bottom + 8 }, 16);
  return (
    <Modal transparent visible animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => onNext(step)}>
      {/* Taps outside the card don't reach the reviewer while the tip is up; Got it ends it. */}
      <Pressable accessible={false} style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0 }} onPress={() => {}} />
      <SpotlightMask holes={[hole]} width={windowW} height={windowH} />
      <SpotlightRing hole={hole} pulse />
      <View
        key={step}
        accessibilityViewIsModal
        onLayout={e => { const h = Math.round(e.nativeEvent.layout.height); if (h > 0 && h !== heights[step]) setHeights(all => ({ ...all, [step]: h })); }}
        style={[{ position: "absolute", left: cardX, width: cardW }, cardPos]}
      >
        {card}
      </View>
    </Modal>
  );
}
