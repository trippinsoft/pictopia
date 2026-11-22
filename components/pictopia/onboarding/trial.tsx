import { useEffect, useRef, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Icon, Text } from "@/components/pictopia/ui";
import { usePictopia } from "@/components/pictopia/provider";
import { periodLabel, trialTimeline, type PlusScene } from "@/lib/pictopia/onboarding";
import { defaultPlan, paywallPlans, planTerms, PAYWALL_COPY } from "@/lib/pictopia/paywall";
import { plural } from "@/lib/pictopia/text";
import { PaywallLinks, PlanOptions, PlusIncluded } from "@/components/pictopia/paywall";
import { openLegal } from "@/lib/pictopia/links";
import type { Offer } from "@/lib/pictopia/types";
import { purchaseService } from "@/services/purchases";
import { usePaywallAnalytics } from "@/components/pictopia/use-paywall-analytics";
import { lifetimeTestStore } from "@/services/lifetime-testing";
import { OnboardingFrame } from "./frame";
import { PlusShowcase } from "./plus-showcase";
import { trackOnboarding } from "@/services/analytics";
import { stepSeconds } from "@/lib/pictopia/onboarding-analytics";

/** The offer’s ✕ appears after a few seconds. */
export const CLOSE_DELAY_MS = 4000;
const inDays = (n: number) => `In ${plural(n, "day")}`;
/** Which onboarding step a part of the offer is, for the funnel. */
export type OfferStep = "plus_showcase" | "trial_timeline" | "trial_plans";
const onShowcaseScene = (scene: PlusScene, seen: number) => trackOnboarding("onboarding_showcase_progress", { scene, scenes_seen: seen });
const storePlatform = Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : "web";

function redeemLabel({ trialDays, currency }: Offer): string {
  if (!trialDays) return "Continue";
  const label = `Redeem ${trialDays} day trial`;
  try {
    return `${label} for ${new Intl.NumberFormat(undefined, { style: "currency", currency }).format(0)}`;
  } catch {
    return `${label} for free`;
  }
}

/** The showcase leads into the eligible trial timeline and the shared plan picker. */
export function TrialOffer({ onDone, onStep }: { onDone: (purchased?: boolean) => void; onStep?: (step: OfferStep) => void }) {
  const app = usePictopia();
  const [inOffer, setInOffer] = useState(false);
  const [offers, setOffers] = useState<Offer[]>();
  const [selected, setSelected] = useState<string>();
  const [showPlans, setShowPlans] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string>();
  const [closable, setClosable] = useState(false);
  const offerAt = useRef(0);
  useEffect(() => {
    void purchaseService.offers().then(o => { const plans = paywallPlans(o); setOffers(plans); setSelected(defaultPlan(plans)?.id); }).catch(() => setOffers([]));
  }, []);
  const offersReady = !!offers;
  useEffect(() => {
    if (!inOffer) return;
    offerAt.current = Date.now();
    setClosable(false);
    const t = setTimeout(() => setClosable(true), CLOSE_DELAY_MS);
    return () => clearTimeout(t);
  }, [inOffer]);
  const lead = offers ? defaultPlan(offers) : undefined;
  const leadTrial = app.pro ? undefined : lead?.trialDays;
  const offer = showPlans ? offers?.find(o => o.id === selected) : lead;
  const step: OfferStep = !inOffer ? "plus_showcase" : leadTrial && !showPlans ? "trial_timeline" : "trial_plans";
  useEffect(() => {
    onStep?.(step);
  }, [step, onStep]);
  const selectAnalytics = usePaywallAnalytics("Onboarding", app.pro, offersReady && app.ready, offers ?? [], offer, inOffer);

  async function buy(plan: Offer | undefined) {
    if (!plan || working || app.pro) return;
    if (lifetimeTestStore.snapshot()) { setError("Reset the lifetime simulation before making a real purchase."); return; }
    setWorking(true);
    setError(undefined);
    try {
      const e = await purchaseService.purchase(plan.id, { remindBeforeTrialEnds: !!plan.trialDays });
      await app.setEntitlement(e);
      if (!e.active) { setError("The store hasn’t confirmed Pictopia+ yet. It unlocks as soon as it does."); return; }
      onDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  }

  const close = closable && !working ? () => {
    trackOnboarding("onboarding_offer_closed", {
      closed_from: leadTrial ? "trial_timeline" : "plan_picker",
      seconds: stepSeconds(offerAt.current, Date.now()),
    });
    onDone();
  } : undefined;
  function openPlans() {
    setError(undefined);
    setShowPlans(true);
  }
  function closePlans() {
    if (working) return;
    setShowPlans(false);
    setSelected(lead?.id);
    setError(undefined);
  }
  const links = (
    <PaywallLinks disabled={working} links={[
      { title: "Restore", run: () => app.restorePurchases().then(() => onDone()) },
      { title: "Terms", run: () => openLegal("terms") },
      { title: "Privacy", run: () => openLegal("privacy") },
    ].map(l => ({ title: l.title, run: () => void l.run().catch(e => setError((e as Error).message)) }))} />
  );
  const checkout = (plan: Offer | undefined) => (
    <Button large disabled={!plan || working || app.pro} onPress={() => void buy(plan)}>
      {working ? "Waiting for the store…" : plan?.trialDays ? redeemLabel(plan) : "Subscribe"}
    </Button>
  );
  const errorLine = error ? <Text accessibilityRole="alert" className="text-center text-body text-destructive">{error}</Text> : null;
  const terms = (plan: Offer | undefined) => plan ? (
    <Text className="text-center text-caption leading-5 text-muted-foreground">{planTerms(plan, storePlatform)}</Text>
  ) : null;
  const planOptions = (
    <PlanOptions plans={offers ?? []} selected={selected} onSelect={id => {
      selectAnalytics(id);
      setSelected(id);
      setError(undefined);
    }} disabled={working} />
  );

  if (!inOffer) {
    return (
      <OnboardingFrame footer={
        <Button large disabled={!offers} onPress={() => {
          if (offers?.length) setInOffer(true);
          else { trackOnboarding("onboarding_offer_closed", { closed_from: "no_offers" }); onDone(); }
        }}>{offers ? "Continue" : "Loading plans…"}</Button>
      }>
        <View className="gap-5">
          <Text accessibilityRole="header" className="text-center text-h1 text-foreground">{`Clean up to ${PAYWALL_COPY.speedup} faster with Pictopia+`}</Text>
          <PlusShowcase onScene={onShowcaseScene} />
          {offers?.length === 0 ? (
            <Text className="text-center text-caption leading-5 text-muted-foreground">
              {Platform.OS === "web" ? "Pictopia+ is available in the Pictopia app for iPhone and Android." : "Plans couldn’t load from the store right now. You can find Pictopia+ in Settings anytime."}
            </Text>
          ) : null}
        </View>
      </OnboardingFrame>
    );
  }

  const period = lead ? periodLabel(lead.kind) : undefined;
  const price = lead && period ? `${lead.price}/${period}` : lead?.price;
  const rows = leadTrial ? [
    { icon: "LockOpen" as const, title: "Today", text: "Unlock everything in Pictopia+." },
    { icon: "Bell" as const, title: inDays(trialTimeline(leadTrial, Date.now()).reminderDay), text: purchaseService.supportsTrialReminders
      ? "We’ll remind you before your trial ends if notifications are on."
      : "Keep enjoying everything in Pictopia+." },
    { icon: "Check" as const, title: inDays(leadTrial), text: "Your subscription begins unless you cancel." },
  ] : [];

  return (
    <OnboardingFrame onClose={close} footer={<>
      {showPlans ? null : errorLine}
      {leadTrial ? (
        <>
          <View className="items-center gap-1 pb-2">
            <View className="flex-row items-center gap-2">
              <Icon name="Check" size={18} className="text-success" />
              <Text className="text-h5 text-foreground">No payment due now</Text>
            </View>
            <Text className="text-h4 text-foreground" accessibilityLabel={`Price after trial: ${price}`}>{price}</Text>
          </View>
          {checkout(lead)}
        </>
      ) : null}
      {app.pro ? <Button large disabled={working} onPress={() => onDone()}>Continue</Button> : null}
      {leadTrial || app.pro ? (
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: showPlans }} disabled={working} onPress={openPlans} className="min-h-11 items-center justify-center">
          <Text className="text-h5 text-foreground underline">View all plans</Text>
        </Pressable>
      ) : (
        <Button large disabled={working} onPress={openPlans}>View all plans</Button>
      )}
      {links}
    </>}>
      <View className="gap-6">
        <View className="items-center gap-4">
          <Text accessibilityRole="header" className="text-center text-h1 text-foreground">
            {app.pro ? "Pictopia+ is unlocked" : leadTrial ? `Try Pictopia+ free for ${plural(leadTrial, "day").replace(" ", "\u00a0")}` : "Unlock Pictopia+"}
          </Text>
          <PlusIncluded />
        </View>
        {leadTrial ? (
          <View>
            {rows.map((row, i) => (
              <View key={row.icon} className="flex-row gap-4">
                <View className="items-center">
                  <View className={`h-12 w-12 items-center justify-center rounded-full ${i === 0 ? "bg-grass" : "bg-sun"}`}><Icon name={row.icon} size={22} className="text-foreground" /></View>
                  {i < rows.length - 1 ? <View className="w-1.5 flex-1 bg-primary" /> : null}
                </View>
                <View className="flex-1 gap-1 pb-7 pt-2.5">
                  <Text className="text-h4 text-foreground">{row.title}</Text>
                  <Text className="text-body leading-6 text-muted-foreground">{row.text}</Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}
      </View>
      {showPlans ? <Modal visible transparent animationType="fade" onRequestClose={closePlans}>
        <View className="flex-1 justify-end bg-overlay/50">
          <Pressable accessible={false} disabled={working} onPress={closePlans} className="absolute inset-0" />
          <SafeAreaView edges={["bottom", "left", "right"]} accessibilityViewIsModal className="mx-auto max-h-[90%] w-full max-w-md rounded-t-3xl border border-border bg-background">
            <View className="flex-row items-center justify-between gap-2 px-6 pt-3">
              <Text accessibilityRole="header" className="flex-1 text-h2 text-foreground">Choose your plan</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Close plan options" disabled={working} onPress={closePlans} className="h-11 w-11 items-center justify-center">
                <Icon name="X" size={22} className="text-foreground" />
              </Pressable>
            </View>
            <ScrollView bounces={false} contentContainerClassName="gap-4 px-6 pb-5 pt-3">
              {planOptions}
              {terms(offer)}
              {errorLine}
              {app.pro ? null : checkout(offer)}
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal> : null}
    </OnboardingFrame>
  );
}
