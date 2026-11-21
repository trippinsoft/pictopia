import { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Modal, Pressable, View, useWindowDimensions } from "react-native";
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { useFocusEffect } from "expo-router";
import { Button, Text } from "@/components/pictopia/ui";
import { HOME_TOUR_TARGETS, homeTourCopy, homeTourSteps, placeCard, type HomeTourStep, type TourBox } from "@/lib/pictopia/home-tour";
import { stepSeconds } from "@/lib/pictopia/onboarding-analytics";
import { homeTourStore } from "@/services/home-tour";
import { trackOnboarding } from "@/services/analytics";
import { useTheme } from "@/theming/ThemeProvider";
import { measureTarget, type TourRect } from "./tour-targets";

/** Home's first-visit tour. A translucent overlay with rounded cut-outs over the real Home
 * (the recommended postcards, the Explore and Timeline tabs, then the percentage sticker and the
 * Progress tab together), a step card placed clear of every cut-out, Skip tutorial / Next /
 * Let's go!. It shows when `homeTour:v1` is pending, only after Home's recommendations are on
 * screen, and is marked shown at once so closing the app never brings it back uninvited.
 * Home's layout is never touched: targets are measured only while the tour is up, and the only
 * layout state lives inside this overlay. */
const DIM = { light: "rgba(16,20,48,0.6)", dark: "rgba(0,0,0,0.72)" };
const SETTLE_MS = 650;
type Hole = TourBox & { radius: number; name: string };

function holeFor(name: string, r: TourRect): Hole {
  if (name === "adventures") return { name, x: r.x - 10, y: r.y - 10, width: r.width + 20, height: r.height + 20, radius: 28 };
  if (name === "percent") return { name, x: r.x - 8, y: r.y - 8, width: r.width + 16, height: r.height + 16, radius: 26 };
  // Tab targets are the icons; widen to take in the label underneath.
  return { name, x: r.x - 12, y: r.y - 8, width: r.width + 24, height: r.height + 34, radius: 18 };
}
/** One rounded rectangle as an SVG sub-path, for the even-odd cut-outs. */
function rounded({ x, y, width: w, height: h, radius }: Hole) {
  const r = Math.min(radius, w / 2, h / 2);
  return `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
}

/** The sun ring around a cut-out; the percentage sticker's ring pulses once. */
function Ring({ hole, pulse }: { hole: Hole; pulse: boolean }) {
  const reduced = useReducedMotion();
  const p = useSharedValue(0);
  useEffect(() => {
    if (!pulse || reduced) return;
    p.value = withDelay(350, withSequence(withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) }), withTiming(0, { duration: 0 })));
    return () => cancelAnimation(p);
  }, [pulse, reduced, p]);
  const glow = useAnimatedStyle(() => ({ opacity: p.value > 0 ? 0.9 * (1 - p.value) : 0, transform: [{ scale: 1 + p.value * 0.14 }] }));
  const box = { position: "absolute" as const, left: hole.x - 3, top: hole.y - 3, width: hole.width + 6, height: hole.height + 6, borderRadius: hole.radius + 3, borderWidth: 3 };
  return <>
    <View pointerEvents="none" className="border-sun" style={box} />
    {pulse ? <Animated.View pointerEvents="none" className="border-sun" style={[box, glow]} /> : null}
  </>;
}

export function HomeTour({ ready, adventures, initialStep = 0 }: { ready: boolean; adventures: number; initialStep?: number }) {
  const reduced = useReducedMotion();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const dim = theme.name === "dark" || theme.name === "adventure" ? DIM.dark : DIM.light;
  const { width: windowW, height: windowH } = useWindowDimensions();
  const [armed, setArmed] = useState<"onboarding" | "settings">();
  const [steps, setSteps] = useState<HomeTourStep[]>();
  const [index, setIndex] = useState(0);
  const [holes, setHoles] = useState<Hole[]>();
  const [cardH, setCardH] = useState<number>();
  const fade = useSharedValue(0);
  const finishing = useRef(false);
  const stepAt = useRef(0);

  // Re-check on every Home focus, so Replay app tour in Settings starts it.
  useFocusEffect(useCallback(() => {
    let alive = true;
    void homeTourStore.load().then(s => { if (alive && s.pending) setArmed(s.source ?? "onboarding"); }).catch(() => {});
    return () => { alive = false; };
  }, []));

  // Start once Home's recommendations have rendered and had a moment to settle.
  useEffect(() => {
    if (!armed || !ready || steps) return;
    const timer = setTimeout(() => {
      const list = homeTourSteps(adventures);
      finishing.current = false;
      setIndex(Math.min(initialStep, list.length - 1));
      setSteps(list);
      void homeTourStore.shown().catch(() => {});
      trackOnboarding("home_tour_started", { source: armed, steps: list.length });
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [armed, ready, steps, adventures, initialStep]);

  const step = steps?.[index];
  const close = useCallback((outcome: "completed" | "skipped") => {
    if (finishing.current || !step) return;
    finishing.current = true;
    const props = { tour_step: step, index, source: armed };
    if (outcome === "completed") {
      trackOnboarding("home_tour_step_completed", { ...props, seconds: stepSeconds(stepAt.current, Date.now()) });
      trackOnboarding("home_tour_completed", { source: armed });
    } else trackOnboarding("home_tour_skipped", props);
    void homeTourStore.finish(outcome).catch(() => {});
    fade.value = withTiming(0, { duration: reduced ? 0 : 180 });
    setTimeout(() => { setSteps(undefined); setHoles(undefined); setArmed(undefined); }, reduced ? 0 : 190);
  }, [step, index, armed, fade, reduced]);

  const next = useCallback(() => {
    if (!steps || !step) return;
    if (index >= steps.length - 1) { close("completed"); return; }
    trackOnboarding("home_tour_step_completed", { tour_step: step, index, source: armed, seconds: stepSeconds(stepAt.current, Date.now()) });
    setCardH(undefined);
    setIndex(i => i + 1);
  }, [steps, step, index, armed, close]);

  // Measure the current stop's elements (again after rotation/resizing). Cut-outs are kept
  // above the tab bar unless they are tabs; a stop with nothing visible is passed over.
  useEffect(() => {
    if (!step) return;
    let alive = true;
    void Promise.all([...HOME_TOUR_TARGETS[step], "home"].map(measureTarget)).then(rects => {
      if (!alive) return;
      const tabTop = rects.at(-1)?.y;
      const found = HOME_TOUR_TARGETS[step].flatMap((name, i) => {
        const r = rects[i];
        if (!r) return [];
        const hole = holeFor(name, r);
        const isTab = name === "explore" || name === "timeline" || name === "progress";
        const floor = isTab ? windowH : (tabTop ?? windowH - insets.bottom - 56) - 12;
        const top = Math.max(hole.y, insets.top);
        const height = Math.min(hole.y + hole.height, floor) - top;
        return height >= 48 && hole.x < windowW && hole.x + hole.width > 0 ? [{ ...hole, y: top, height }] : [];
      });
      if (!found.length) {
        if (steps && index < steps.length - 1) setIndex(i => i + 1); else close("completed");
        return;
      }
      setHoles(found);
      stepAt.current = Date.now();
      fade.value = withTiming(1, { duration: reduced ? 0 : 240, easing: Easing.out(Easing.cubic) });
      trackOnboarding("home_tour_step_viewed", { tour_step: step, index, source: armed });
      const copy = homeTourCopy(step, adventures);
      AccessibilityInfo.announceForAccessibility(`Step ${index + 1} of ${steps?.length}. ${copy.title}. ${copy.body}`);
    });
    return () => { alive = false; };
    // `close`/`armed`/`adventures` don't change which elements are measured; `fade`/`reduced` are stable.
  }, [step, index, steps, windowW, windowH, insets.top, insets.bottom]);

  const overlay = useAnimatedStyle(() => ({ opacity: fade.value }));
  if (!steps || !step || !holes) return null;

  const last = index === steps.length - 1;
  const copy = homeTourCopy(step, adventures);
  // Nearly full width, like a sheet tucked beside the spotlight (capped for tablets/web).
  const cardW = Math.min(windowW - 32, 480);
  const anchor = holes[0];
  const cardX = Math.max(16, Math.min(windowW - cardW - 16, anchor.x + anchor.width / 2 - cardW / 2));
  const cardPos = placeCard(holes, { height: cardH ?? 220 }, { height: windowH, top: insets.top + 8, bottom: insets.bottom + 8 });
  const mask = `M-10 -10H${windowW + 10}V${windowH + 10}H-10Z ${holes.map(rounded).join(" ")}`;

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={() => close("skipped")}>
      <Animated.View style={[{ flex: 1 }, overlay]}>
        {/* Taps outside the card don't reach Home while the tour is open. */}
        <Pressable accessible={false} style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0 }} onPress={() => {}} />
        <Svg pointerEvents="none" width={windowW} height={windowH} style={{ position: "absolute", left: 0, top: 0 }}>
          <Path d={mask} fill={dim} fillRule="evenodd" />
        </Svg>
        {holes.map(h => <Ring key={`${step}:${h.name}`} hole={h} pulse={h.name === "percent"} />)}
        <View
          accessibilityViewIsModal
          onLayout={e => { const h = Math.round(e.nativeEvent.layout.height); if (h !== cardH) setCardH(h); }}
          style={[{ position: "absolute", left: cardX, width: cardW, opacity: cardH === undefined ? 0 : 1 }, cardPos]}
          className="gap-3 rounded-[28px] bg-card p-5"
        >
          <View className="flex-row">
            <View className="rounded-full bg-sun px-2.5 py-0.5"><Text className="text-caption text-sun-ink">{`${index + 1} of ${steps.length}`}</Text></View>
          </View>
          <View className="gap-1">
            <Text accessibilityRole="header" className="text-h3 text-foreground">{copy.title}</Text>
            <Text className="text-body leading-6 text-muted-foreground">{copy.body}</Text>
          </View>
          <View className="flex-row flex-wrap items-center justify-between gap-2 pt-1">
            {!last ? (
              <Pressable accessibilityRole="button" onPress={() => close("skipped")} className="min-h-11 justify-center px-1 active:opacity-60">
                <Text className="text-h5 text-muted-foreground">Skip tutorial</Text>
              </Pressable>
            ) : <View />}
            <View className="min-w-[124px]">
              <Button onPress={next}>{last ? "Let’s go!" : "Next"}</Button>
            </View>
          </View>
        </View>
      </Animated.View>
    </Modal>
  );
}
