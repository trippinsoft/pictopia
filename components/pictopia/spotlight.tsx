import { useEffect } from "react";
import { View } from "react-native";
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withTiming } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { useTheme } from "@/theming/ThemeProvider";
import type { TourBox } from "@/lib/pictopia/home-tour";

/** Shared tutorial spotlight pieces (Home tour, reviewer tips): a translucent dim layer with
 * rounded even-odd cut-outs over the real UI, and a sun ring around each cut-out that can pulse
 * once. Pure drawing in window coordinates; nothing here measures or moves the UI underneath. */
export type SpotlightHole = TourBox & { radius: number; name: string };
const DIM = { light: "rgba(16,20,48,0.6)", dark: "rgba(0,0,0,0.72)" };

export function useSpotlightDim() {
  const { theme } = useTheme();
  return theme.name === "dark" || theme.name === "adventure" ? DIM.dark : DIM.light;
}

/** One rounded rectangle as an SVG sub-path, for the even-odd cut-outs. */
export function roundedHole({ x, y, width: w, height: h, radius }: SpotlightHole) {
  const r = Math.min(radius, w / 2, h / 2);
  return `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
}

/** The whole window dimmed except the holes. */
export function SpotlightMask({ holes, width, height }: { holes: readonly SpotlightHole[]; width: number; height: number }) {
  const dim = useSpotlightDim();
  const d = `M-10 -10H${width + 10}V${height + 10}H-10Z ${holes.map(roundedHole).join(" ")}`;
  return (
    <Svg pointerEvents="none" width={width} height={height} style={{ position: "absolute", left: 0, top: 0 }}>
      <Path d={d} fill={dim} fillRule="evenodd" />
    </Svg>
  );
}

/** The sun ring around a cut-out; with `pulse` it swells and fades once (not under reduced motion). */
export function SpotlightRing({ hole, pulse = false }: { hole: SpotlightHole; pulse?: boolean }) {
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
