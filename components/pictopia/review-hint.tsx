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
const HINT_ICONS: Record<ReviewStep, "ArrowUp" | "ArrowRight" | "Trash2" | "Undo2" | "Heart"> = {
  browse: "ArrowUp", discard: "ArrowRight", trash: "Trash2", restore: "Undo2", actions: "Heart",
};
export function ReviewHint({ step, onNext, onSkip }: { step?: ReviewStep; onNext(step: ReviewStep): void; onSkip(): void }) {
  const reduced = useReducedMotion(), motion = useSharedValue(0);
  useEffect(() => {
    motion.value = 0;
    if (step && !reduced && (step === "browse" || step === "discard")) motion.value = withRepeat(withSequence(withTiming(9, { duration: 600 }), withTiming(0, { duration: 600 })), 2);
    if (step) AccessibilityInfo.announceForAccessibility(REVIEW_HINTS[step]);
    return () => cancelAnimation(motion);
  }, [step, reduced, motion]);
  const animated = useAnimatedStyle(() => ({ transform: step === "browse" ? [{ translateY: -motion.value }] : [{ translateX: motion.value }] }));
  if (!step) return null;
  return <View className="mx-4 flex-row items-center gap-2 rounded-2xl bg-card px-3 py-1">
    <Animated.View style={animated}><Icon name={HINT_ICONS[step]} size={18} className="text-primary" /></Animated.View>
    <Text accessibilityLiveRegion="polite" className="flex-1 text-body text-foreground">{REVIEW_HINTS[step]}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={step === "actions" ? "Finish review tips" : "Next review tip, no photo decision required"} onPress={() => onNext(step)} className="h-11 w-9 items-center justify-center"><Icon name="Check" size={17} className="text-primary" /></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Skip all review tips" onPress={onSkip} className="h-11 w-9 items-center justify-center"><Icon name="X" size={17} className="text-muted-foreground" /></Pressable>
  </View>;
}
