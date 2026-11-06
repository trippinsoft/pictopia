import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { cancelAnimation, Easing, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { badgeView, ROMAN, type BadgeDefinition } from "@/lib/pictopia/badges";
import type { badgeStore } from "@/services/badges";
import { BadgeArt } from "./badge-art";
import { Button, Icon, Text } from "./ui";

type BadgeResult = Awaited<ReturnType<typeof badgeStore.evaluate>>;

/** A centered, two-sided badge. This view only reads saved achievement facts. */
export function BadgeDetail({ definition, badges, onClose }: { definition: BadgeDefinition; badges?: BadgeResult; onClose(): void }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const systemReduced = useReducedMotion();
  const [reduced, setReduced] = useState(systemReduced);
  const [reverse, setReverse] = useState(true);
  const [settled, setSettled] = useState(reduced);
  const first = useRef(true);
  const flip = useSharedValue(reduced ? 1 : 0), scale = useSharedValue(reduced ? 1 : 0.5);
  useEffect(() => {
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    scale.value = reduced ? 1 : withTiming(1, { duration: 280, easing: Easing.out(Easing.cubic) });
    const delay = first.current ? 300 : 0;
    first.current = false;
    setSettled(reduced);
    flip.value = reduced ? Number(reverse) : withDelay(delay, withTiming(Number(reverse), { duration: 560, easing: Easing.inOut(Easing.cubic) }, finished => { if (finished) runOnJS(setSettled)(true); }));
    return () => { cancelAnimation(scale); cancelAnimation(flip); };
  }, [reverse, reduced, scale, flip]);
  const enlarged = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const front = useAnimatedStyle(() => ({ opacity: flip.value < 0.5 ? 1 : 0, transform: [{ perspective: 1200 }, { rotateY: `${flip.value * 180}deg` }] }));
  const back = useAnimatedStyle(() => ({ opacity: flip.value >= 0.5 ? 1 : 0, transform: [{ perspective: 1200 }, { rotateY: `${(flip.value - 1) * 180}deg` }] }));
  const v = badgeView(definition, badges?.state, badges?.values[definition.family] ?? 0);
  const legacy = badges?.state.legacy?.[definition.family];
  const unsupported = !!legacy && legacy.tier > v.tier;
  const level = badges ? v.earned ? `Level ${ROMAN[v.tier]} earned` : "Not yet earned" : "Loading achievements…";
  const rules = definition.family === "explorer" ? "Each photo counts once across all reviews and adventures. Videos are separate. Saved views and choices were included when badges were introduced."
    : definition.family === "adventurer" ? `${badges?.audit.verified.length ?? 0} distinct saved completions verified. ${badges?.audit.unverified.length ?? 0} endings lack supporting evidence. The older counter recorded ${badges?.audit.legacyCount ?? 0}. Reopening never adds another completion.`
    : definition.family === "declutterer" ? "Only confirmed photo deletions count. Marking, restoring and pending deletions earn no deletion credit."
    : definition.family === "streak" ? "A day qualifies after 10 distinct photos or videos viewed, or a confirmed deletion. Your best streak includes eligible restored days."
    : "Based on fully explored photos in your accessible library. Earned levels stay saved if your library changes.";
  const cardWidth = Math.min(360, width - 40);
  const cardHeight = Math.max(180, Math.min(560, height - insets.top - insets.bottom - 48));
  return <Modal transparent visible animationType="none" onRequestClose={onClose} onShow={() => AccessibilityInfo.announceForAccessibility(`${definition.name}. ${level}. Badge details.`)}>
    <View className="flex-1 bg-black/50">
      <Pressable accessibilityRole="button" accessibilityLabel="Close badge details" onPress={onClose} style={StyleSheet.absoluteFill} />
      <SafeAreaView pointerEvents="box-none" style={styles.center}>
        <Animated.View accessibilityViewIsModal style={[{ width: cardWidth, height: cardHeight }, enlarged]}>
          <Animated.View pointerEvents={reverse ? "none" : "auto"} accessibilityElementsHidden={reverse} importantForAccessibility={reverse ? "no-hide-descendants" : "auto"} style={[styles.face, front]}>
            <Pressable accessibilityRole="button" accessibilityLabel={`${definition.name}. ${level}. Turn over for details.`} onPress={() => setReverse(true)} className="flex-1 items-center justify-center gap-4 rounded-[32px] border border-border bg-card p-6">
              <BadgeArt family={definition.family} tier={v.tier} size={Math.min(200, cardWidth - 80)} />
              <Text className="text-center text-h2 text-foreground">{definition.name}</Text>
              <Text className="text-center text-h5 text-muted-foreground">{level}</Text>
              <View className="mt-2 flex-row items-center gap-2"><Icon name="RotateCcw" size={18} className="text-primary" /><Text className="text-body text-primary">Tap to turn over</Text></View>
            </Pressable>
          </Animated.View>
          <Animated.View pointerEvents={reverse ? "auto" : "none"} accessibilityElementsHidden={!reverse} importantForAccessibility={!reverse ? "no-hide-descendants" : "auto"} style={[styles.face, back]}>
            <View className="flex-1 overflow-hidden rounded-[32px] border border-border bg-card">
              <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator>
                <View className="flex-row items-center gap-3 pr-8">
                  <BadgeArt family={definition.family} tier={v.tier} size={56} />
                  <View className="min-w-0 flex-1 gap-1"><Text accessibilityRole="header" className="text-h2 text-foreground">{definition.name}</Text><Text className="text-h5 text-muted-foreground">{level}</Text></View>
                </View>
                {v.earned && <Text className="text-body text-foreground">{`${unsupported ? "Saved level requirement: " : "Earned at "}${v.label}.`}</Text>}
                {badges && <View className="gap-1"><Text className="text-caption text-muted-foreground">Verified progress</Text><Text className="text-h3 text-foreground">{definition.unit(v.value)}</Text></View>}
                {unsupported && <Text className="text-caption leading-5 text-muted-foreground">{definition.family === "adventurer" ? "An older award is retained in your history but is not confirmed by the available adventure records. It is excluded from earned badges." : "An older award is retained in your history. Available records do not verify it, so it is excluded from earned badges."}</Text>}
                {badges && <View className="gap-2 rounded-2xl bg-secondary p-4"><Text className="text-h5 text-foreground">{v.maxed ? "Highest level reached" : `Next · Level ${ROMAN[v.tier + 1]}`}</Text>{!v.maxed && <><Text className="text-body text-foreground">{definition.unit(v.next!)}</Text><Text className="text-caption text-muted-foreground">{`${Math.max(0, v.next! - v.value).toLocaleString()} more to go`}</Text></>}</View>}
                <Text className="text-caption leading-5 text-muted-foreground">{rules}</Text>
              </ScrollView>
              {settled && reverse ? <View className="flex-row items-center gap-3 border-t border-border px-6 py-4">
                <Pressable accessibilityRole="button" accessibilityLabel="Turn badge to the front" onPress={() => setReverse(false)} className="min-h-12 flex-1 flex-row items-center justify-center gap-2"><Icon name="RotateCcw" size={18} className="text-primary" /><Text className="text-h5 text-primary">See badge</Text></Pressable>
                <View className="flex-1"><Button onPress={onClose}>Done</Button></View>
              </View> : <View className="h-20" />}
            </View>
          </Animated.View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close badge details" onPress={onClose} className="absolute right-2 top-2 h-12 w-12 items-center justify-center rounded-full"><Icon name="X" size={20} className="text-muted-foreground" /></Pressable>
        </Animated.View>
      </SafeAreaView>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  face: { ...StyleSheet.absoluteFillObject, backfaceVisibility: "hidden" },
  content: { padding: 24, paddingTop: 28, gap: 18 },
});
