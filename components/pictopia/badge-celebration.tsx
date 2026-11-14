import { useEffect, useState } from "react";
import { AppState, Modal, ScrollView, StyleSheet, View } from "react-native";
import Animated, { cancelAnimation, Easing, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming, type SharedValue } from "react-native-reanimated";
import Svg, { Circle, Path } from "react-native-svg";
import { lightArt } from "@/theming/illustration";
import { celebrationHaptic } from "@/services/memory-haptics";
import { usePathname } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { BADGES, ROMAN } from "@/lib/pictopia/badges";
import { badgeStore, type BadgeCelebration } from "@/services/badges";
import { BadgeArt } from "./badge-art";
import { Button, Icon, Text } from "./ui";
import { usePictopia } from "./provider";

/** Saved awards survive navigation and restart until the user acknowledges them. */
export function BadgeCelebrationHost() {
  const { ready, libraryReliable, revision } = usePictopia();
  const path = usePathname();
  const [awards, setAwards] = useState<BadgeCelebration[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!ready) return;
    let alive = true, request = 0;
    const read = () => {
      const token = ++request;
      void badgeStore.pendingCelebrations().then(value => {
        if (alive && token === request) setAwards(value);
      }).catch(() => {});
    };
    const unsubscribe = badgeStore.subscribeCelebrations(read);
    const foreground = AppState.addEventListener("change", state => { if (state === "active") read(); });
    read();
    return () => { alive = false; unsubscribe(); foreground.remove(); };
  }, [ready]);
  useEffect(() => {
    if (!ready || !libraryReliable) return;
    // Reviews evaluate at completion. Elsewhere evaluate after saved activity settles.
    if (path === "/vertical-explore" || path === "/collection-review" || path === "/onboarding") return;
    const evaluate = () => { void badgeStore.evaluate().catch(() => {}); };
    const timer = setTimeout(evaluate, 400);
    const foreground = AppState.addEventListener("change", state => { if (state === "active") evaluate(); });
    return () => { clearTimeout(timer); foreground.remove(); };
  }, [ready, libraryReliable, revision, path]);
  const award = awards[0];
  const definition = BADGES.find(item => item.family === award?.family);
  const dismiss = async () => {
    if (!award || saving) return;
    setSaving(true); setError(false);
    try {
      await badgeStore.dismissCelebration(award);
      setAwards(await badgeStore.pendingCelebrations());
    } catch { setError(true); }
    finally { setSaving(false); }
  };
  if (!award || !definition) return null;
  return <Modal visible transparent animationType="fade" onRequestClose={() => void dismiss()}>
    <SafeAreaView className="flex-1 items-center justify-center bg-background/95 px-6">
      <ScrollView className="w-full max-w-md" contentContainerClassName="flex-grow items-center justify-center py-8">
        {/* Keyed per award so "Next badge" plays the whole reveal again. */}
        <BadgeReveal key={`${award.family}:${award.tier}:${award.earnedAt}`} award={award} name={`${definition.name} ${ROMAN[award.tier] ?? ""}`}
          detail={definition.unit(definition.tiers[award.tier - 1])} more={awards.length > 1} saving={saving} error={error} onDone={() => void dismiss()} />
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}

const SPIN_MS = 1700, TURNS = 4;
const CONFETTI = [lightArt.sun, lightArt.terracotta, lightArt.moss, lightArt.teal, lightArt.skyAlt, lightArt.sun, lightArt.coral, lightArt.rose];
const PIECES = Array.from({ length: 26 }, (_, i) => {
  const angle = -Math.PI / 2 + (i / 26 - 0.5) * Math.PI * 1.9 + Math.sin(i * 12.9) * 0.18;
  return { angle, distance: 110 + ((i * 37) % 70), spin: (i % 2 ? 1 : -1) * (240 + ((i * 53) % 300)), wide: i % 3 === 0, color: CONFETTI[i % CONFETTI.length] };
});

/** The celebration: a "New badge" title, then the medal spins in like a tossed coin, lands with
 * a bounce, a burst of confetti and slowly turning sunrays, and finally its name and Done. */
function BadgeReveal({ award, name, detail, more, saving, error, onDone }: {
  award: BadgeCelebration; name: string; detail: string; more: boolean; saving: boolean; error: boolean; onDone(): void;
}) {
  const { prefs } = usePictopia();
  const reduced = useReducedMotion();
  const card = useSharedValue(reduced ? 1 : 0), title = useSharedValue(reduced ? 1 : 0), spin = useSharedValue(reduced ? 1 : 0);
  const pop = useSharedValue(1), burst = useSharedValue(0), rays = useSharedValue(reduced ? 1 : 0), turn = useSharedValue(0), info = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) return;
    const landed = () => { if (prefs.haptics) celebrationHaptic(); };
    card.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.back(1.6)) });
    title.value = withDelay(120, withTiming(1, { duration: 380, easing: Easing.out(Easing.cubic) }));
    spin.value = withDelay(380, withTiming(1, { duration: SPIN_MS, easing: Easing.out(Easing.cubic) }, done => { if (done) runOnJS(landed)(); }));
    const land = 380 + SPIN_MS;
    pop.value = withDelay(land - 60, withSequence(withTiming(1.14, { duration: 160, easing: Easing.out(Easing.quad) }), withSpring(1, { damping: 7, stiffness: 180 })));
    burst.value = withDelay(land - 80, withTiming(1, { duration: 1500, easing: Easing.out(Easing.quad) }));
    rays.value = withDelay(land - 120, withTiming(1, { duration: 500 }));
    turn.value = withRepeat(withTiming(360, { duration: 14000, easing: Easing.linear }), -1);
    info.value = withDelay(land + 120, withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) }));
    const values = [card, title, spin, pop, burst, rays, turn, info];
    return () => values.forEach(value => cancelAnimation(value));
  }, [reduced, prefs.haptics, card, title, spin, pop, burst, rays, turn, info]);
  const cardStyle = useAnimatedStyle(() => ({ opacity: card.value, transform: [{ scale: 0.86 + card.value * 0.14 }] }));
  const titleStyle = useAnimatedStyle(() => ({ opacity: title.value, transform: [{ translateY: (1 - title.value) * -14 }] }));
  // A flat coin flip: the medal narrows to its edge and widens again each half turn. Real 3D
  // rotation is avoided because on iOS a rotated layer slices through the layers behind it,
  // hiding half the medal.
  const medalStyle = useAnimatedStyle(() => {
    const angle = (1 - spin.value) * TURNS * Math.PI * 2;
    const scale = (0.35 + spin.value * 0.65) * pop.value;
    return {
      opacity: Math.min(1, spin.value * 5),
      transform: [{ translateY: (1 - spin.value) * -60 }, { scaleX: scale * Math.max(0.06, Math.abs(Math.cos(angle))) }, { scaleY: scale }],
    };
  });
  const raysStyle = useAnimatedStyle(() => ({ opacity: rays.value * 0.9, transform: [{ rotate: `${turn.value}deg` }, { scale: 0.6 + rays.value * 0.4 }] }));
  const infoStyle = useAnimatedStyle(() => ({ opacity: info.value, transform: [{ translateY: (1 - info.value) * 12 }] }));
  return <Animated.View style={[styles.full, cardStyle]}><View className="w-full items-center gap-5 rounded-[28px] bg-card p-6">
    <Animated.View style={titleStyle}><View className="items-center gap-2">
      <View className="flex-row items-center gap-1.5 rounded-full bg-sun-soft px-3 py-1">
        <Icon name="Sparkles" size={14} className="text-foreground" />
        <Text className="text-caption text-foreground">New badge</Text>
      </View>
      <Text accessibilityRole="header" accessibilityLiveRegion="polite" className="text-center text-h2 text-foreground">You just earned a new badge!</Text>
    </View></Animated.View>
    <View className="h-[220px] w-[220px] items-center justify-center">
      <Animated.View pointerEvents="none" style={[styles.rays, raysStyle]}>
        <Svg width="100%" height="100%" viewBox="-100 -100 200 200" aria-hidden>
          {Array.from({ length: 12 }, (_, i) => <Path key={i} d="M0 0 L-9 -98 L9 -98Z" fill={lightArt.sun} opacity={0.35} transform={`rotate(${i * 30})`} />)}
          <Circle r="62" fill={lightArt.sun} opacity={0.18} />
        </Svg>
      </Animated.View>
      {!reduced && PIECES.map((piece, i) => <Confetti key={i} piece={piece} burst={burst} />)}
      <Animated.View style={medalStyle}><BadgeArt family={award.family} tier={award.tier} size={170} /></Animated.View>
    </View>
    <Animated.View style={[styles.full, infoStyle]}><View className="w-full items-center gap-5">
      <View className="gap-2">
        <Text className="text-center text-h1 text-foreground">{name}</Text>
        <Text className="text-center text-body text-muted-foreground">{detail}</Text>
      </View>
      {!!error && <Text accessibilityRole="alert" className="text-center text-caption text-destructive">Couldn’t save your acknowledgment. Please try again.</Text>}
      <View className="w-full"><Button large disabled={saving} onPress={onDone}>{more ? "Next badge" : "Hooray!"}</Button></View>
    </View></Animated.View>
  </View></Animated.View>;
}

function Confetti({ piece, burst }: { piece: (typeof PIECES)[number]; burst: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const p = burst.value;
    return {
      opacity: p === 0 ? 0 : p < 0.75 ? 1 : (1 - p) * 4,
      transform: [
        { translateX: Math.cos(piece.angle) * piece.distance * p },
        { translateY: Math.sin(piece.angle) * piece.distance * p + p * p * 120 },
        { rotate: `${piece.spin * p}deg` },
      ],
    };
  });
  return <Animated.View pointerEvents="none" style={[piece.wide ? styles.wide : styles.tall, { backgroundColor: piece.color }, style]} />;
}

const styles = StyleSheet.create({
  full: { width: "100%" },
  rays: { position: "absolute", width: 260, height: 260 },
  wide: { position: "absolute", width: 12, height: 6, borderRadius: 2 },
  tall: { position: "absolute", width: 7, height: 11, borderRadius: 2 },
});
