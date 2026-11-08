import { useCallback, useRef, useState } from "react";
import { AccessibilityInfo, Pressable, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import Animated, { FadeInDown, ReduceMotion } from "react-native-reanimated";
import { Text } from "@/components/ui/text";
import Icon from "@/lib/icons/LucideIcon";
import { BadgeArt } from "./badge-art";
import { useTheme } from "@/theming/ThemeProvider";
import { BADGES, ROMAN, type BadgeFamily } from "@/lib/pictopia/badges";
import { plural } from "@/lib/pictopia/text";

export interface Recap {
  viewed: number;
  marked: number;
  /** Today's streak length, when today already qualifies. */
  streakDay?: number;
  badge?: { family: BadgeFamily; tier: number };
}
let pending: Recap | undefined;
const listeners = new Set<(recap: Recap) => void>();
/** Delivered once to the next focused screen header, in normal scrollable page flow. */
export function showRecap(recap: Recap) {
  pending = recap;
  for (const listener of listeners) listener(recap);
}

const SHOWN_FOR = 6000;
/** The recap after a meaningful visit reserves its own space below the tab header.
 * It stays for 6 s (until dismissed with a screen reader); Review opens the queue. */
export function RecapHost() {
  const [recap, setRecap] = useState<Recap>();
  const { theme } = useTheme();
  const lift = { boxShadow: `0px 4px 0px ${theme.colors.tint ?? theme.colors.border}` };
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useFocusEffect(useCallback(() => {
    let alive = true, revision = 0;
    const show = (value: Recap) => {
      pending = undefined;
      const ticket = ++revision;
      setRecap(value);
      clearTimeout(timer.current);
      // Screen-reader users get longer: the card is announced and stays until dismissed.
      void AccessibilityInfo.isScreenReaderEnabled().then(reader => {
        if (alive && ticket === revision && !reader) timer.current = setTimeout(() => setRecap(undefined), SHOWN_FOR);
      }).catch(() => { if (alive && ticket === revision) timer.current = setTimeout(() => setRecap(undefined), SHOWN_FOR); });
      AccessibilityInfo.announceForAccessibility(recapLine(value));
    };
    listeners.add(show);
    if (pending) show(pending);
    return () => { alive = false; revision++; listeners.delete(show); clearTimeout(timer.current); setRecap(undefined); };
  }, []));
  if (!recap) return null;
  const badge = recap.badge && BADGES.find(b => b.family === recap.badge?.family);
  return <View className="mt-6 w-full max-w-md self-center">
    <Animated.View entering={FadeInDown.duration(280).reduceMotion(ReduceMotion.System)} style={fullWidth}>
      <View style={lift} className="w-full rounded-[22px] bg-card p-4">
      <View className="flex-row items-start gap-3">
        <View className="h-11 w-11 items-center justify-center rounded-full bg-sun">
          <Icon name="Compass" size={22} className="text-foreground" />
        </View>
        <View className="flex-1">
          <Text className="text-headline text-foreground">Nice exploring!</Text>
          <Text className="mt-0.5 text-body text-muted-foreground">{recapLine(recap)}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" onPress={() => setRecap(undefined)} className="-mr-1 -mt-1 h-10 w-10 items-center justify-center">
          <Icon name="X" size={18} className="text-muted-foreground" />
        </Pressable>
      </View>
      {badge && recap.badge && <View className="mt-3 flex-row items-center gap-3 rounded-2xl bg-sun-soft p-2.5">
        <BadgeArt family={badge.family} tier={recap.badge.tier} size={40} />
        <Text className="flex-1 text-body text-foreground">{`New badge · ${badge.name} ${ROMAN[recap.badge.tier] ?? ""}`}</Text>
      </View>}
      {recap.marked > 0 && <Pressable accessibilityRole="button" onPress={() => { setRecap(undefined); router.push("/queue"); }} className="mt-3 min-h-12 flex-row items-center justify-center gap-2 rounded-2xl bg-primary active:opacity-80">
        <Icon name="Trash2" size={18} className="text-primary-foreground" />
        <Text className="text-button text-primary-foreground">{`Review ${recap.marked} marked`}</Text>
      </Pressable>}
      </View>
    </Animated.View>
  </View>;
}
export function recapLine(r: Recap) {
  return [
    `${plural(r.viewed, "photo")} explored`,
    ...(r.marked ? [`${r.marked} marked`] : []),
    ...(r.streakDay ? [`Day ${r.streakDay}`] : []),
  ].join(" · ");
}

const fullWidth = { width: "100%" as const };
