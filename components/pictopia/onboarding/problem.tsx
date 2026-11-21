import { useEffect } from "react";
import { View } from "react-native";
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming, type SharedValue } from "react-native-reanimated";
import { Text } from "@/components/pictopia/ui";
import type { ArtName } from "@/components/pictopia/illustration";
import { At, Print, Screenshot, Sparkle, StickyNote, TrashCan } from "./art";

/** The problem, then the promise, in one loop: prints keep landing on a growing pile ("+1",
 * "+1"…) and bury a "Clean up… later" note; then the screenshots and the blurry copy fly into
 * the trash and the keepers settle into a tidy fan with a sparkle. Reduced motion shows the pile. */
const CYCLE_MS = 8400;
type Card = { art: ArtName | "screenshot"; x: number; y: number; rot: number; keep: number; faded?: boolean };
// Keepers carry their fan slot (0–3); clutter carries -1, -2, -3 for its order into the trash.
const CARDS: Card[] = [
  { art: "autumn", x: 0.3, y: 0.56, rot: -14, keep: 0 },
  { art: "screenshot", x: 0.64, y: 0.44, rot: 12, keep: -1 },
  { art: "summer", x: 0.5, y: 0.6, rot: -4, keep: 1 },
  { art: "screenshot", x: 0.34, y: 0.4, rot: -18, keep: -2 },
  { art: "winter", x: 0.7, y: 0.62, rot: 15, keep: 3 },
  { art: "summer", x: 0.56, y: 0.66, rot: 7, keep: -3, faded: true },
  { art: "spring", x: 0.46, y: 0.5, rot: 9, keep: 2 },
];
const NOTE_AT = 1;
const FAN = [-13, -4.5, 4.5, 13];
const TRASH = { x: 0.88, y: 0.1 };
const PILE_T = 0.4;

const clamp = (v: number) => { "worklet"; return Math.min(1, Math.max(0, v)); };
const seg = (t: number, a: number, b: number) => { "worklet"; return clamp((t - a) / (b - a)); };
const out = (x: number) => { "worklet"; return 1 - Math.pow(1 - x, 3); };
const inOut = (x: number) => { "worklet"; return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const dropAt = (i: number) => { "worklet"; return 0.03 + i * 0.05; };

function PileCard({ card, i, t, w, h, pw, ph }: { card: Card; i: number; t: SharedValue<number>; w: number; h: number; pw: number; ph: number }) {
  const fanX = card.keep >= 0 ? w * 0.5 + FAN[card.keep] * 4 * (w / 320) : 0;
  const fanY = card.keep >= 0 ? h * 0.58 + Math.abs(FAN[card.keep]) * 0.9 : 0;
  const style = useAnimatedStyle(() => {
    const d = out(seg(t.value, dropAt(i), dropAt(i) + 0.06));
    let x = card.x * w, y = card.y * h - (1 - d) * h * 0.55, rot = card.rot * (0.6 + d * 0.4), scale = 1.08 - d * 0.08, opacity = d;
    if (card.keep >= 0) {
      const s = inOut(seg(t.value, 0.62, 0.72));
      x += (fanX - x) * s; y += (fanY - y) * s; rot += (FAN[card.keep] - rot) * s;
    } else {
      const start = 0.46 + (-card.keep - 1) * 0.05;
      const p = inOut(seg(t.value, start, start + 0.1));
      const tx = TRASH.x * w, ty = TRASH.y * h, cx = (x + tx) / 2, cy = Math.min(y, ty) - h * 0.2;
      const u = 1 - p;
      x = u * u * x + 2 * u * p * cx + p * p * tx;
      y = u * u * y + 2 * u * p * cy + p * p * ty;
      rot += p * 40; scale *= 1 - p * 0.8; opacity *= p >= 1 ? 0 : 1 - p * p * 0.6;
    }
    return { opacity, transform: [{ translateX: x - pw / 2 }, { translateY: y - ph / 2 }, { rotate: `${rot}deg` }, { scale }] };
  });
  const plus = useAnimatedStyle(() => {
    const p = seg(t.value, dropAt(i) + 0.035, dropAt(i) + 0.13);
    return { opacity: p > 0 && p < 1 ? 1 - p : 0, transform: [{ translateY: -p * 26 }, { scale: 0.8 + Math.min(1, p * 4) * 0.2 }] };
  });
  return (
    <Animated.View style={[{ position: "absolute", left: 0, top: 0, width: pw, height: ph }, style]}>
      {card.art === "screenshot" ? <View className="items-center"><Screenshot width={pw * 0.8} height={ph} index={i + 1} tint={i} /></View> : <Print art={card.art} width={pw} height={ph} index={i + 1} faded={card.faded} />}
      <Animated.View style={[{ position: "absolute", right: -8, top: -10 }, plus]}>
        <View className="rounded-full bg-tomato px-2 py-0.5"><Text className="text-caption text-white">+1</Text></View>
      </Animated.View>
    </Animated.View>
  );
}

function Note({ t, w, h }: { t: SharedValue<number>; w: number; h: number }) {
  const nw = w * 0.4;
  const style = useAnimatedStyle(() => {
    const d = out(seg(t.value, 0.08, 0.14));
    const gone = inOut(seg(t.value, 0.46, 0.56));
    return {
      opacity: d * (1 - gone),
      transform: [{ translateX: w * 0.22 - nw / 2 - gone * w * 0.1 }, { translateY: h * 0.28 - (1 - d) * 30 + gone * h * 0.3 }, { rotate: `${-9 - gone * 30}deg` }, { scale: 1.1 - d * 0.1 }],
    };
  });
  return <Animated.View style={[{ position: "absolute", left: 0, top: 0 }, style]}><StickyNote width={nw}>Clean up… later</StickyNote></Animated.View>;
}

export function ProblemPile({ size }: { size: number }) {
  const reduced = useReducedMotion();
  const t = useSharedValue(reduced ? PILE_T : 0);
  useEffect(() => {
    if (reduced) { t.value = PILE_T; return; }
    t.value = 0;
    t.value = withRepeat(withTiming(1, { duration: CYCLE_MS, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(t);
  }, [reduced, t]);
  const w = size, h = size * 0.92, pw = w * 0.34, ph = pw * 1.22;
  const stage = useAnimatedStyle(() => ({ opacity: 1 - seg(t.value, 0.93, 0.99) }));
  const trash = useAnimatedStyle(() => {
    const pop = seg(t.value, 0.42, 0.47);
    const bump = [0.56, 0.61, 0.66].reduce((m, at) => Math.max(m, 1 - Math.abs(t.value - at) / 0.025), 0);
    const leave = seg(t.value, 0.74, 0.8);
    return { opacity: pop * (1 - leave), transform: [{ scale: (0.4 + out(pop) * 0.6) * (1 + Math.max(0, bump) * 0.25) * (1 - leave * 0.4) }] };
  });
  const shine = useAnimatedStyle(() => {
    const p = seg(t.value, 0.71, 0.78);
    return { opacity: p > 0 ? 1 : 0, transform: [{ scale: out(p) }, { rotate: `${p * 45}deg` }] };
  });
  return (
    <Animated.View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[{ width: w, height: h }, stage]}>
      {CARDS.map((card, i) => [
        i === NOTE_AT ? <Note key="note" t={t} w={w} h={h} /> : null,
        <PileCard key={i} card={card} i={i} t={t} w={w} h={h} pw={pw} ph={ph} />,
      ])}
      <At x={TRASH.x * w} y={TRASH.y * h} w={44} h={44}><Animated.View style={trash}><TrashCan size={44} /></Animated.View></At>
      <At x={w * 0.18} y={h * 0.3} w={26} h={26}><Animated.View style={shine}><Sparkle size={26} /></Animated.View></At>
      <At x={w * 0.84} y={h * 0.4} w={20} h={20}><Animated.View style={shine}><Sparkle size={20} /></Animated.View></At>
      <At x={w * 0.76} y={h * 0.9} w={16} h={16}><Animated.View style={shine}><Sparkle size={16} /></Animated.View></At>
    </Animated.View>
  );
}
