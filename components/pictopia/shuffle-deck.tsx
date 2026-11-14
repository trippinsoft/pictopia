import { useEffect, useRef, useState } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { CardBack } from "./memory-card";
import { MEMORY_DECK } from "@/lib/pictopia/memory-match";

const CARDS = 5;
const IDS = Array.from({ length: CARDS }, (_, id) => id);
const OUT_MS = 170, BACK_MS = 210, EVERY_MS = 480;
/** Resting angle of each deck card, so the stack looks handled rather than machine-perfect. */
const REST = [-4, 2.5, -1.5, 3.5, -0.5];

/** Memory Match's deck while photos are prepared: the bottom card slides out to one side and
 * tucks back in on top, alternating sides, like a brisk overhand shuffle. Still with reduced
 * motion or when paused. */
export function ShuffleDeck({ reduced, paused = false }: { reduced: boolean; paused?: boolean }) {
  const [order, setOrder] = useState(IDS);
  const [move, setMove] = useState<{ id: number; dir: 1 | -1; n: number }>();
  const current = useRef(order);
  useEffect(() => {
    if (reduced || paused) return;
    let n = 0, swap: ReturnType<typeof setTimeout> | undefined;
    const cycle = () => {
      const id = current.current[0], dir = n % 2 ? -1 : 1;
      setMove({ id, dir, n: ++n });
      // Out at the side, the card changes layers so it slides back in on top of the stack.
      swap = setTimeout(() => { current.current = [...current.current.slice(1), id]; setOrder(current.current); }, OUT_MS);
    };
    const first = setTimeout(cycle, 120), interval = setInterval(cycle, EVERY_MS);
    return () => { clearTimeout(first); clearInterval(interval); if (swap) clearTimeout(swap); };
  }, [reduced, paused]);
  return <View accessible accessibilityRole="progressbar" accessibilityLabel="Shuffling your photos" style={styles.deck}>
    {IDS.map(id =>
      <DeckCard key={id} id={id} position={order.indexOf(id)} move={move?.id === id ? move : undefined} reduced={reduced} />)}
  </View>;
}

function DeckCard({ id, position, move, reduced }: { id: number; position: number; move?: { dir: 1 | -1; n: number }; reduced: boolean }) {
  const x = useSharedValue(0), lift = useSharedValue(0), dir = useSharedValue(1), y = useSharedValue(-position * 2.2);
  useEffect(() => {
    y.value = reduced ? -position * 2.2 : withTiming(-position * 2.2, { duration: 220 });
  }, [position, reduced, y]);
  const n = move?.n, side = move?.dir ?? 1;
  useEffect(() => {
    if (n === undefined || reduced) return;
    dir.value = side;
    x.value = withSequence(withTiming(side * MEMORY_DECK.width * 0.7, { duration: OUT_MS, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: BACK_MS, easing: Easing.inOut(Easing.cubic) }));
    lift.value = withSequence(withTiming(1, { duration: OUT_MS }), withTiming(0, { duration: BACK_MS }));
    return () => { cancelAnimation(x); cancelAnimation(lift); };
  }, [n, side, reduced, x, lift, dir]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value - lift.value * 8 }, { rotate: `${REST[id] + lift.value * dir.value * 12}deg` }],
  }));
  const shadow = { boxShadow: `${(id % 3) - 1}px ${2 + position * 0.6}px ${6 + position}px rgba(28,36,87,0.18)` } as ViewStyle;
  return <Animated.View pointerEvents="none" style={[styles.card, shadow, { zIndex: position }, style]}><CardBack /></Animated.View>;
}

const styles = StyleSheet.create({
  deck: { width: MEMORY_DECK.width, height: MEMORY_DECK.height },
  card: { ...StyleSheet.absoluteFillObject, borderRadius: 16 },
});
