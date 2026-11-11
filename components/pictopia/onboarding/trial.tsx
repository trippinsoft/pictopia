import { useEffect, useState } from "react";
import { Platform, Pressable, View } from "react-native";
import { Button, Icon, Loading, Text } from "@/components/pictopia/ui";
import { usePictopia } from "@/components/pictopia/provider";
import type { IconName } from "@/lib/icons/LucideIcon";
import { leadOffer, periodLabel, trialTimeline, TRIAL_REMINDER_DAYS_BEFORE } from "@/lib/pictopia/onboarding";
import { openLegal } from "@/lib/pictopia/links";
import type { Offer } from "@/lib/pictopia/types";
import { notificationService } from "@/services/notifications";
import { purchaseService } from "@/services/purchases";
import { OnboardingFrame, QuietAction } from "./frame";
import { SwipeDemo } from "./demos";

type Part = "intro" | "reminder" | "plans";
const BENEFITS: { icon: IconName; text: string }[] = [
  { icon: "Infinity", text: "Explore as many photos as you like, every day" },
  { icon: "CalendarDays", text: "Open any recent On This Day, not just today’s" },
  { icon: "Heart", text: "Support an independent app with no ads" },
];
const day = (t: number) => new Date(t).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

/** The onboarding trial offer, in Picnic's three steps: what you get, a reminder before the
 * trial ends, then a timeline and the plans. Every price and trial length comes from the
 * store; without a store trial it's a plain plan choice, and the free version is always one
 * tap away. */
export function TrialOffer({ onDone, start = "intro" }: { onDone: () => void; start?: Part }) {
  const app = usePictopia();
  const [part, setPart] = useState<Part>(start);
  const [offers, setOffers] = useState<Offer[]>();
  const [selected, setSelected] = useState<string>();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    void purchaseService.offers().then(o => { setOffers(o); setSelected(leadOffer(o)?.id); }).catch(() => setOffers([]));
  }, []);
  const offer = offers?.find(o => o.id === selected);
  const trial = offer?.trialDays;
  const lead = offers ? leadOffer(offers) : undefined;
  const leadTrial = lead?.trialDays;
  const free = <QuietAction onPress={onDone}>Continue with the free version</QuietAction>;

  async function buy() {
    if (!offer) return;
    setWorking(true);
    setError(undefined);
    try {
      const startedAt = Date.now();
      const e = await purchaseService.purchase(offer.id);
      await app.setEntitlement(e);
      if (!e.active) { setError("The store hasn’t confirmed Pictopia+ yet. It unlocks as soon as it does."); return; }
      if (offer.trialDays) {
        const { reminderAt, chargeAt } = trialTimeline(offer.trialDays, startedAt);
        await notificationService.scheduleOnce({
          id: "pictopia-trial-end", at: reminderAt, url: "/settings",
          title: `Your Pictopia+ trial ends in ${TRIAL_REMINDER_DAYS_BEFORE} days`,
          body: `Your first payment of ${offer.price} is on ${day(chargeAt)}. Cancel anytime in your store account.`,
        }).catch(() => {});
      }
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  }

  if (!offers) return <OnboardingFrame footer={free}><Loading /></OnboardingFrame>;

  if (part === "intro" || !offers.length) {
    return (
      <OnboardingFrame
        footer={offers.length ? <>
          {leadTrial ? <Text className="text-center text-caption text-muted-foreground">No payment due now</Text> : null}
          <Button large onPress={() => setPart(leadTrial ? "reminder" : "plans")}>{leadTrial ? `Try ${leadTrial} days for free` : "See plans"}</Button>
          {free}
        </> : <Button large onPress={onDone}>Continue</Button>}
      >
        <View className="gap-6">
          <View className="h-[300px]"><SwipeDemo /></View>
          <View className="gap-2">
            <Text accessibilityRole="header" className="text-center text-h1 text-foreground">{leadTrial ? "Try Pictopia+ for free" : "Get more from Pictopia+"}</Text>
          </View>
          <View className="gap-3">
            {BENEFITS.map(b => (
              <View key={b.text} className="flex-row items-center gap-3">
                <View className="h-9 w-9 items-center justify-center rounded-full bg-sun-soft"><Icon name={b.icon} size={18} className="text-foreground" /></View>
                <Text className="flex-1 text-body leading-6 text-foreground">{b.text}</Text>
              </View>
            ))}
          </View>
          {!offers.length ? (
            <Text className="text-center text-caption leading-5 text-muted-foreground">
              {Platform.OS === "web" ? "Pictopia+ is available in the Pictopia app for iPhone and Android." : "Plans couldn’t load from the store right now. You can find Pictopia+ in Settings anytime."}
            </Text>
          ) : null}
        </View>
      </OnboardingFrame>
    );
  }

  if (part === "reminder" && leadTrial) {
    const { reminderAt } = trialTimeline(leadTrial, Date.now());
    return (
      <OnboardingFrame
        topAction="Back" onTopAction={() => setPart("intro")}
        footer={<>
          <Text className="text-center text-caption text-muted-foreground">No payment due now</Text>
          <Button large icon="Bell" onPress={() => void notificationService.request().catch(() => "denied").finally(() => setPart("plans"))}>Remind me</Button>
          <QuietAction onPress={() => setPart("plans")}>Not now</QuietAction>
        </>}
      >
        <View className="items-center gap-5">
          <View className="h-28 w-28 items-center justify-center rounded-full bg-sun"><Icon name="BellRing" size={52} className="text-foreground" /></View>
          <Text accessibilityRole="header" className="text-center text-h1 text-foreground">We’ll remind you before your trial ends</Text>
          <Text className="text-center text-body leading-6 text-muted-foreground">
            You’ll get a reminder on {day(reminderAt)}, {TRIAL_REMINDER_DAYS_BEFORE} days before your first payment. Cancel anytime before then and you won’t be charged.
          </Text>
        </View>
      </OnboardingFrame>
    );
  }

  const timeline = trial ? trialTimeline(trial, Date.now()) : undefined;
  return (
    <OnboardingFrame
      topAction="Not now" onTopAction={onDone}
      footer={<>
        {trial ? <Text className="text-center text-caption text-muted-foreground">No payment due now</Text> : null}
        <Button large disabled={!offer || working || app.pro} onPress={() => void buy()}>
          {app.pro ? "Pictopia+ is unlocked" : working ? "Waiting for the store…" : trial ? `Start my ${trial}-day free trial` : "Continue"}
        </Button>
        {free}
      </>}
    >
      <View className="gap-5">
        <Text accessibilityRole="header" className="text-center text-h1 text-foreground">{trial ? `Start your ${trial}-day free trial` : "Choose your plan"}</Text>
        {timeline && offer ? (
          <View className="gap-0">
            {[
              { icon: "LockOpen" as const, title: "Today", text: "Full Pictopia+ access" },
              { icon: "Bell" as const, title: day(timeline.reminderAt), text: "We remind you your trial is ending" },
              { icon: "Star" as const, title: day(timeline.chargeAt), text: `You’re charged ${offer.price}, unless you cancel before` },
            ].map((row, i, all) => (
              <View key={row.title} className="flex-row gap-3">
                <View className="items-center">
                  <View className={`h-9 w-9 items-center justify-center rounded-full ${i === 0 ? "bg-grass" : "bg-sun"}`}><Icon name={row.icon} size={17} className="text-foreground" /></View>
                  {i < all.length - 1 ? <View className="w-1 flex-1 bg-foreground/10" /> : null}
                </View>
                <View className="flex-1 pb-4">
                  <Text className="text-h5 text-foreground">{row.title}</Text>
                  <Text className="text-caption text-muted-foreground">{row.text}</Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}
        <View accessibilityRole="radiogroup" className="gap-2.5">
          {offers.map(o => {
            const on = o.id === selected;
            return (
              <Pressable key={o.id} accessibilityRole="radio" accessibilityState={{ checked: on }} disabled={working} onPress={() => setSelected(o.id)}
                className={`flex-row items-center gap-3 rounded-2xl border-2 bg-card px-4 py-3.5 ${on ? "border-foreground" : "border-transparent"}`}>
                <View className={`h-5 w-5 items-center justify-center rounded-full border-2 ${on ? "border-foreground bg-foreground" : "border-foreground/30"}`}>
                  {on ? <Icon name="Check" size={12} className="text-background" /> : null}
                </View>
                <View className="flex-1">
                  <Text className="text-h5 text-foreground">{o.kind === "weekly" ? "Weekly" : o.kind === "monthly" ? "Monthly" : o.kind === "annual" ? "Yearly" : "Lifetime"}</Text>
                  {o.trialDays ? <Text className="text-caption text-grass">{o.trialDays}-day free trial</Text> : null}
                </View>
                <Text className="text-h5 text-foreground">{o.price}{periodLabel(o.kind) ? ` / ${periodLabel(o.kind)}` : ""}</Text>
              </Pressable>
            );
          })}
        </View>
        {error ? <Text accessibilityRole="alert" className="text-center text-body text-destructive">{error}</Text> : null}
        <Text className="text-center text-caption leading-5 text-muted-foreground">
          Payment is charged to your {Platform.OS === "ios" ? "Apple ID" : "Google Play account"}{trial ? " when the trial ends" : ""}. Subscriptions renew automatically unless cancelled at least 24 hours before the end of the period. Manage or cancel in your store account.
        </Text>
        <View className="flex-row flex-wrap justify-center">
          {[
            { title: "Restore purchases", run: () => app.restorePurchases().then(onDone) },
            { title: "Terms", run: () => openLegal("terms") },
            { title: "Privacy", run: () => openLegal("privacy") },
          ].map(l => (
            <Pressable key={l.title} accessibilityRole="link" disabled={working} onPress={() => void l.run().catch(e => setError((e as Error).message))} className="min-h-11 justify-center px-3">
              <Text className="text-caption text-tertiary">{l.title}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </OnboardingFrame>
  );
}
