import { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Pressable, View } from "react-native";
import { useFocusEffect } from "expo-router";
import Animated, { cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { Icon, Text } from "./ui";
import { nextReviewStep, REVIEW_HINTS, REVIEW_STEPS, type ReviewGuidance, type ReviewStep } from "@/lib/pictopia/review-guidance";
import { reviewGuidance } from "@/services/review-guidance";

export function useReviewGuidance(enabled: boolean) {
  const [done, setDone] = useState<ReviewGuidance>();
  const alive = useRef(true), state = useRef(done); state.current = done;
  useFocusEffect(useCallback(() => {
    alive.current = true;
    if (enabled) void reviewGuidance.load().then(value => { if (alive.current) setDone(value); }).catch(() => {});
    return () => { alive.current = false; };
  }, [enabled]));
  const complete = useCallback((step: ReviewStep) => {
    if (!state.current || nextReviewStep(state.current) !== step) return;
    const next = { ...state.current, [step]: true }; state.current = next; setDone(next);
    void reviewGuidance.complete(step).catch(() => {});
  }, []);
  const skip = useCallback(() => {
    setDone(REVIEW_STEPS.reduce<ReviewGuidance>((all, step) => ({ ...all, [step]: true }), {}));
    void reviewGuidance.skip().catch(() => {});
  }, []);
  return { step: enabled && done ? nextReviewStep(done) : undefined, complete, skip };
}

/** The two-step coach. Each step completes when the user actually does it (or taps Got it);
 * nothing here makes a decision about a photo. */
export function ReviewHint({ step, onNext, onSkip }: { step?: ReviewStep; onNext(step: ReviewStep): void; onSkip(): void }) {
  const reduced = useReducedMotion(), motion = useSharedValue(0);
  useEffect(() => {
    motion.value = 0;
    if (step && !reduced) motion.value = withRepeat(withSequence(withTiming(1, { duration: 650 }), withTiming(0, { duration: 650 })), -1);
    if (step) AccessibilityInfo.announceForAccessibility(`${REVIEW_HINTS[step].title}. ${REVIEW_HINTS[step].body}`);
    return () => cancelAnimation(motion);
  }, [step, reduced, motion]);
  const animated = useAnimatedStyle(() => ({ transform: step === "browse" ? [{ translateY: -10 * motion.value }] : [{ translateX: 14 * motion.value }, { rotate: `${8 * motion.value}deg` }] }));
  if (!step) return null;
  const hint = REVIEW_HINTS[step];
  return <View pointerEvents="box-none" className="absolute bottom-3 left-4 right-4 items-center">
    <View accessibilityLiveRegion="polite" className="w-full max-w-sm flex-row items-center gap-3 rounded-[22px] bg-card/95 p-3 pr-2">
      <View className="h-12 w-12 items-center justify-center rounded-full bg-sun">
        <Animated.View style={animated}><Icon name={step === "browse" ? "Hand" : "MoveHorizontal"} size={22} className="text-primary-foreground" /></Animated.View>
      </View>
      <View className="flex-1">
        <Text className="text-caption text-muted-foreground">{`Tip ${REVIEW_STEPS.indexOf(step) + 1} of ${REVIEW_STEPS.length}`}</Text>
        <Text className="text-headline text-foreground">{hint.title}</Text>
        <Text className="text-caption leading-5 text-muted-foreground">{hint.body}</Text>
      </View>
      <View className="items-end">
        <Pressable accessibilityRole="button" accessibilityLabel={step === "discard" ? "Got it, finish tips" : "Got it, next tip"} onPress={() => onNext(step)} className="min-h-11 justify-center rounded-full bg-sun px-4">
          <Text className="text-button text-primary-foreground">Got it</Text>
        </Pressable>
        {step === "browse" && <Pressable accessibilityRole="button" accessibilityLabel="Skip tips" onPress={onSkip} className="min-h-9 justify-center px-2">
          <Text className="text-caption text-muted-foreground">Skip</Text>
        </Pressable>}
      </View>
    </View>
  </View>;
}
