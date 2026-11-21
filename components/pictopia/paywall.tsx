import { Pressable, StyleSheet, View } from "react-native";
import { Icon, Text } from "@/components/pictopia/ui";
import { Illustration } from "@/components/pictopia/illustration";
import { periodLabel } from "@/lib/pictopia/onboarding";
import { PAYWALL_COPY, PAYWALL_VALUE, planName, yearlySavings } from "@/lib/pictopia/paywall";
import type { Offer } from "@/lib/pictopia/types";

/** The shared Pictopia+ plan picker pieces, used by the paywall and onboarding's plan step so
 * every upgrade offer looks and reads the same. */

/** Shared brand artwork, a quiet value proposition and a short feature overview. */
export function PaywallHero({ headline = PAYWALL_COPY.headline }: { headline?: string }) {
  return (
    <View className="items-center gap-3">
      <View className="h-24 w-28" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Illustration name="upgrade" square />
      </View>
      <Text accessibilityRole="header" className="text-center text-h1 text-foreground">{headline}</Text>
      <Text accessibilityLabel={PAYWALL_VALUE} className="max-w-xs text-center text-h4 leading-7 text-muted-foreground">
        {PAYWALL_VALUE}
      </Text>
      <Text className="max-w-xs text-center text-caption leading-6 text-muted-foreground">
        {PAYWALL_COPY.features}
      </Text>
    </View>
  );
}

/** Two selectable plans from the store. The yearly plan carries "Best value" only when its real
 * price saves money over the other plan. */
export function PlanOptions({ plans, selected, onSelect, disabled }: {
  plans: readonly Offer[];
  selected?: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
}) {
  const savings = yearlySavings(plans);
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Pictopia+ plans" className="gap-3.5">
      {plans.map(o => {
        const on = o.id === selected;
        const best = o.kind === "annual" && savings > 0;
        const period = periodLabel(o.kind);
        const note = o.trialDays ? `${o.trialDays}-day free trial` : best ? `Save ${savings}%` : period ? `Billed every ${period}` : "One payment";
        return (
          <Pressable
            key={o.id}
            accessibilityRole="radio"
            accessibilityState={{ checked: on, disabled }}
            accessibilityLabel={`${planName(o.kind)}, ${o.price}${period ? ` per ${period}` : ""}${o.trialDays ? `, ${o.trialDays}-day free trial` : ""}${best ? `, best value, save ${savings}%` : ""}`}
            disabled={disabled}
            onPress={() => onSelect(o.id)}
            className={`flex-row items-center gap-3 rounded-[20px] border-2 bg-card px-4 py-4 ${on ? "border-foreground" : "border-border"} ${best ? "mt-2" : ""}`}
          >
            <View className={`h-6 w-6 items-center justify-center rounded-full border-2 ${on ? "border-foreground bg-foreground" : "border-foreground/30"}`}>
              {on ? <Icon name="Check" size={14} className="text-background" /> : null}
            </View>
            <View className="flex-1">
              <Text className="text-h4 text-foreground">{planName(o.kind)}</Text>
              <Text className={`text-caption ${o.trialDays || best ? "text-grass" : "text-muted-foreground"}`}>{note}</Text>
            </View>
            <View className="items-end">
              <Text className="text-h4 text-foreground">{o.price}</Text>
              {period ? <Text className="text-caption text-muted-foreground">per {period}</Text> : null}
            </View>
            {best ? (
              <View className="absolute -top-3 right-4 rounded-full bg-sun px-2.5 py-1">
                <Text className="text-[11px] tracking-wider text-sun-ink" style={styles.stamp}>BEST VALUE</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Restore · Terms · Privacy (and Manage when there's a subscription to manage). */
export function PaywallLinks({ links, disabled }: { links: { title: string; run: () => void }[]; disabled?: boolean }) {
  return (
    <View className="flex-row flex-wrap justify-center">
      {links.map(l => (
        <Pressable key={l.title} accessibilityRole="link" disabled={disabled} onPress={l.run} className="min-h-11 justify-center px-3">
          <Text className="text-caption text-muted-foreground">{l.title}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stamp: { fontFamily: "Inter_700Bold" },
});
