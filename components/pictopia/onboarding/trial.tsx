import { useEffect, useState } from "react";
import { Platform, View } from "react-native";
import { Button, Icon, Loading, Text } from "@/components/pictopia/ui";
import { usePictopia } from "@/components/pictopia/provider";
import { periodLabel, trialTimeline } from "@/lib/pictopia/onboarding";
import { defaultPlan, paywallPlans, planAction, planTerms } from "@/lib/pictopia/paywall";
import { plural } from "@/lib/pictopia/text";
import { PaywallHero, PaywallLinks, PlanOptions } from "@/components/pictopia/paywall";
import { openLegal } from "@/lib/pictopia/links";
import type { Offer } from "@/lib/pictopia/types";
import { purchaseService } from "@/services/purchases";
import { usePaywallAnalytics } from "@/components/pictopia/use-paywall-analytics";
import { lifetimeTestStore } from "@/services/lifetime-testing";
import { OnboardingFrame, QuietAction } from "./frame";
import { SwipeDemo } from "./demos";

type Part = "intro" | "reminder" | "plans";
/** Like SwipeWipe, the last screen's ✕ appears after a few seconds. */
export const CLOSE_DELAY_MS = 4000;
const inDays = (n: number) => `In ${plural(n, "day")}`;
/** "3 days free, then <price>/week", or "Only <price>/week" without a trial. */
function priceLine(offer: Offer) {
  const period = periodLabel(offer.kind);
  const price = period ? `${offer.price}/${period}` : offer.price;
  return offer.trialDays ? `${offer.trialDays} days free, then ${price}` : `Only ${price}`;
}

/** The onboarding trial offer, in SwipeWipe and Picnic's three steps: "We want you to try
 * Pictopia+", a nudge to set their own reminder before the trial ends, then Picnic's Today → In 2 days → In 3 days
 * timeline with one button. There's no way out on the first two; the last one's ✕ appears after
 * a few seconds and leads to the free version. Every price and trial length comes from the
 * store; without a store trial the last step is a plain plan choice. */
export function TrialOffer({ onDone, start = "intro" }: { onDone: () => void; start?: Part }) {
  const app = usePictopia();
  const [part, setPart] = useState<Part>(start);
  const [offers, setOffers] = useState<Offer[]>();
  const [selected, setSelected] = useState<string>();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string>();
  const [closable, setClosable] = useState(false);
  useEffect(() => {
    void purchaseService.offers().then(o => { const plans = paywallPlans(o); setOffers(plans); setSelected(defaultPlan(plans)?.id); }).catch(() => setOffers([]));
  }, []);
  useEffect(() => {
    if (part !== "plans") return;
    setClosable(false);
    const t = setTimeout(() => setClosable(true), CLOSE_DELAY_MS);
    return () => clearTimeout(t);
  }, [part]);
  const lead = offers ? defaultPlan(offers) : undefined;
  const leadTrial = lead?.trialDays;
  // With a trial the last screen offers just that plan, like Picnic; otherwise the picker.
  const offer = leadTrial ? lead : offers?.find(o => o.id === selected);
  const trial = offer?.trialDays;
  const selectAnalytics = usePaywallAnalytics("Onboarding", app.pro, !!offers && app.ready, offers ?? [], offer, part === "plans");

  async function buy() {
    if (!offer) return;
    if (lifetimeTestStore.snapshot()) { setError("Reset the lifetime simulation before making a real purchase."); return; }
    setWorking(true);
    setError(undefined);
    try {
      const e = await purchaseService.purchase(offer.id);
      await app.setEntitlement(e);
      if (!e.active) { setError("The store hasn’t confirmed Pictopia+ yet. It unlocks as soon as it does."); return; }
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  }

  if (!offers) return <OnboardingFrame footer={<QuietAction onPress={onDone}>Continue with the free version</QuietAction>}><Loading /></OnboardingFrame>;

  const caption = (o: Offer | undefined) => (o ? <Text className="pt-1 text-center text-caption text-muted-foreground">{priceLine(o)}</Text> : null);

  if (part === "intro" || !offers.length) {
    return (
      <OnboardingFrame
        footer={offers.length ? <>
          {leadTrial ? <Text className="text-center text-caption text-muted-foreground">No payment due now</Text> : null}
          <Button large onPress={() => setPart(leadTrial ? "reminder" : "plans")}>Continue</Button>
          {caption(lead)}
        </> : <Button large onPress={onDone}>Continue</Button>}
      >
        <View className="gap-8">
          <Text accessibilityRole="header" className="text-center text-h1 text-foreground">{leadTrial ? "We want you to try Pictopia+ for free" : "We want you to try Pictopia+"}</Text>
          <View className="h-[340px]"><SwipeDemo /></View>
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
    return (
      <OnboardingFrame
        footer={<>
          <Text className="text-center text-body text-foreground">Cancel anytime.</Text>
          <Button large onPress={() => setPart("plans")}>Continue</Button>
          {caption(lead)}
        </>}
      >
        <View className="items-center gap-10">
          <Text accessibilityRole="header" className="text-center text-h1 text-foreground">Set a reminder before your trial ends</Text>
          <View className="h-36 w-36 items-center justify-center rounded-full bg-sun"><Icon name="BellRing" size={72} className="text-foreground" /></View>
        </View>
      </OnboardingFrame>
    );
  }

  const close = closable ? onDone : undefined;
  const links = (
    <PaywallLinks disabled={working} links={[
      { title: "Restore", run: () => app.restorePurchases().then(onDone) },
      { title: "Terms", run: () => openLegal("terms") },
      { title: "Privacy", run: () => openLegal("privacy") },
    ].map(l => ({ title: l.title, run: () => void l.run().catch(e => setError((e as Error).message)) }))} />
  );
  const action = (
    <Button large disabled={!offer || working || app.pro} onPress={() => void buy()}>
      {app.pro ? "Pictopia+ is unlocked" : working ? "Waiting for the store…" : planAction(offer)}
    </Button>
  );
  const errorLine = error ? <Text accessibilityRole="alert" className="text-center text-body text-destructive">{error}</Text> : null;

  if (trial && offer) {
    const timeline = trialTimeline(trial, Date.now());
    const rows = [
      { icon: "LockOpen" as const, title: "Today", text: "Unlock everything in Pictopia+" },
      { icon: "Sparkles" as const, title: inDays(timeline.reminderDay), text: "Keep enjoying everything in Pictopia+" },
      { icon: "Check" as const, title: inDays(trial), text: "You won’t be charged before. Cancel anytime." },
    ];
    return (
      <OnboardingFrame
        onClose={close}
        footer={<>
          <Text className="text-center text-caption text-muted-foreground">No payment due now</Text>
          {action}
          {caption(offer)}
          {links}
        </>}
      >
        <View className="gap-8">
          <Text accessibilityRole="header" className="text-center text-h1 text-foreground">{`Start your ${trial}-day free trial`}</Text>
          <View>
            {rows.map((row, i) => (
              <View key={row.title} className="flex-row gap-4">
                <View className="items-center">
                  <View className={`h-12 w-12 items-center justify-center rounded-full ${i === 0 ? "bg-grass" : "bg-sun"}`}><Icon name={row.icon} size={22} className="text-foreground" /></View>
                  {i < rows.length - 1 ? <View className="w-1.5 flex-1 bg-sun/50" /> : null}
                </View>
                <View className="flex-1 gap-1 pb-7 pt-2.5">
                  <Text className="text-h4 text-foreground">{row.title}</Text>
                  <Text className="text-body leading-6 text-muted-foreground">{row.text}</Text>
                </View>
              </View>
            ))}
          </View>
          {errorLine}
          <Text className="text-center text-caption leading-5 text-muted-foreground">{planTerms(offer, Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : "web")}</Text>
        </View>
      </OnboardingFrame>
    );
  }

  return (
    <OnboardingFrame onClose={close} footer={<>{action}{links}</>}>
      <View className="gap-5">
        <PaywallHero />
        <PlanOptions plans={offers} selected={selected} onSelect={id => { selectAnalytics(id); setSelected(id); }} disabled={working} />
        {errorLine}
        {offer ? <Text className="text-center text-caption leading-5 text-muted-foreground">{planTerms(offer, Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : "web")}</Text> : null}
      </View>
    </OnboardingFrame>
  );
}
