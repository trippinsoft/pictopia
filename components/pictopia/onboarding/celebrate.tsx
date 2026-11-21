import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withTiming, type SharedValue } from "react-native-reanimated";
import Svg, { Circle, Path } from "react-native-svg";
import { lightArt } from "@/theming/illustration";
import { useTheme } from "@/theming/ThemeProvider";

/** The badge celebration's sunrays and confetti, for onboarding's Pictopia+ moments. Purely
 * decorative; with reduced motion the rays stand still and no confetti flies. */
const COLORS = [lightArt.sun, lightArt.terracotta, lightArt.moss, lightArt.teal, lightArt.tealLight, lightArt.sun, lightArt.coral, lightArt.rose];
const PIECES = Array.from({ length: 24 }, (_, i) => {
  const angle = -Math.PI / 2 + (i / 24 - 0.5) * Math.PI * 1.9 + Math.sin(i * 12.9) * 0.18;
  return { angle, distance: 120 + ((i * 37) % 80), spin: (i % 2 ? 1 : -1) * (240 + ((i * 53) % 300)), wide: i % 3 === 0, color: COLORS[i % COLORS.length] };
});

/** Slowly turning sunrays filling their parent. */
export function Sunrays({ size }: { size: number }) {
  const reduced = useReducedMotion();
  const { theme } = useTheme();
  const dark = theme.name === "dark" || theme.name === "adventure";
  const turn = useSharedValue(0), show = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) return;
    show.value = withTiming(1, { duration: 600 });
    turn.value = withRepeat(withTiming(360, { duration: 16000, easing: Easing.linear }), -1);
    return () => { cancelAnimation(turn); cancelAnimation(show); };
  }, [reduced, turn, show]);
  const style = useAnimatedStyle(() => ({ opacity: show.value * 0.9, transform: [{ rotate: `${turn.value}deg` }, { scale: 0.7 + show.value * 0.3 }] }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: "absolute", width: size, height: size }, style]}>
      <Svg width="100%" height="100%" viewBox="-100 -100 200 200">
        {Array.from({ length: 12 }, (_, i) => <Path key={i} d="M0 0 L-10 -98 L10 -98Z" fill={lightArt.sun} opacity={dark ? 0.14 : 0.3} transform={`rotate(${i * 30})`} />)}
        <Circle r="58" fill={lightArt.sun} opacity={dark ? 0.08 : 0.16} />
      </Svg>
    </Animated.View>
  );
}

/** One burst of confetti from the parent's center, `delay` ms after mount (and again whenever
 * `burstKey` changes). */
export function ConfettiBurst({ delay = 0, burstKey = 0 }: { delay?: number; burstKey?: number }) {
  const reduced = useReducedMotion();
  const burst = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    burst.value = 0;
    burst.value = withDelay(delay, withTiming(1, { duration: 1600, easing: Easing.out(Easing.quad) }));
    return () => cancelAnimation(burst);
  }, [reduced, delay, burst, burstKey]);
  if (reduced) return null;
  return <View pointerEvents="none" style={styles.center}>{PIECES.map((piece, i) => <Piece key={i} piece={piece} burst={burst} />)}</View>;
}

function Piece({ piece, burst }: { piece: (typeof PIECES)[number]; burst: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const p = burst.value;
    return {
      opacity: p === 0 ? 0 : p < 0.75 ? 1 : (1 - p) * 4,
      transform: [
        { translateX: Math.cos(piece.angle) * piece.distance * p },
        { translateY: Math.sin(piece.angle) * piece.distance * p + p * p * 130 },
        { rotate: `${piece.spin * p}deg` },
      ],
    };
  });
  return <Animated.View style={[piece.wide ? styles.wide : styles.tall, { backgroundColor: piece.color }, style]} />;
}

const styles = StyleSheet.create({
  center: { position: "absolute", left: "50%", top: "45%", width: 0, height: 0, overflow: "visible" },
  wide: { position: "absolute", width: 12, height: 7, borderRadius: 2, marginLeft: -6, marginTop: -3.5 },
  tall: { position: "absolute", width: 7, height: 12, borderRadius: 2, marginLeft: -3.5, marginTop: -6 },
});
