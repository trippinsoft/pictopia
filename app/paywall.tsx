import { lifetimeTestStore } from "@/services/lifetime-testing";
import React, { useCallback, useEffect, useState } from "react";
import { View, Platform, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { usePaywallAnalytics } from "@/components/pictopia/use-paywall-analytics";
import { Page, Text, Button, Loading } from "@/components/pictopia/ui";
import { usePictopia } from "@/components/pictopia/provider";
import { NavigationBack } from "@/components/pictopia/navigation-header";
import { PaywallHero, PaywallLinks, PlanOptions } from "@/components/pictopia/paywall";
import { purchaseService } from "@/services/purchases";
import { openLegal, manageSubscription } from "@/lib/pictopia/links";
import { defaultPlan, paywallPlans, planAction, planTerms } from "@/lib/pictopia/paywall";
import { Offer } from "@/lib/pictopia/types";

/** Pictopia+: one headline, one promise, two store plans and one button. */
export default function Paywall() {
  const app = usePictopia();
  const { entry } = useLocalSearchParams<{ entry?: string }>();
  const [plans, setPlans] = useState<Offer[]>([]),
    [selected, setSelected] = useState(""),
    [loading, setLoading] = useState(true),
    [working, setWorking] = useState(false),
    [error, setError] = useState("");
  const load = useCallback(() => {
    setLoading(true);
    setError("");
    void purchaseService
      .offers()
      .then((o) => {
        const shown = paywallPlans(o);
        setPlans(shown);
        setSelected(defaultPlan(shown)?.id ?? "");
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);
  const offer = plans.find((o) => o.id === selected);
  const selectAnalytics = usePaywallAnalytics(entry, app.pro, app.ready, plans, offer);
  /** Back to exactly where Pro was offered. A review stopped by the daily limit is still
   * open underneath, at the same photo, and now continues without a limit. */
  function leave() {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/home");
  }
  async function buy() {
    if (lifetimeTestStore.snapshot()) { setError("Reset the lifetime simulation before making a real purchase."); return; }
    setWorking(true);
    setError("");
    try {
      const e = await purchaseService.purchase(selected);
      await app.setEntitlement(e);
      if (e.active) leave();
      else setError("The store hasn’t confirmed Pictopia+ yet. Try Restore purchases once it’s approved.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  }
  function restore() {
    setWorking(true);
    setError("");
    void app
      .restorePurchases()
      .then(leave)
      .catch((e) => setError(e.message))
      .finally(() => setWorking(false));
  }
  if (app.entitlementSource === "lifetime") return <Page title="Pictopia+ for Life">
    <View className="gap-4 py-6">
      <Text className="text-h2 text-foreground">Your lifetime access is active</Text>
      <Text className="text-body text-muted-foreground">You do not need another subscription. An existing paid subscription may still renew until you cancel it with your store.</Text>
      <Button secondary onPress={() => { void manageSubscription(app.entitlement?.managementURL).catch(e => setError((e as Error).message)); }}>Manage subscription</Button>
      {error ? <Text accessibilityRole="alert" className="text-body text-destructive">{error}</Text> : null}
    </View>
  </Page>;

  const links = [
    { title: "Restore purchases", run: restore },
    ...(app.pro && app.entitlementSource === "store"
      ? [{ title: "Manage subscription", run: () => void manageSubscription(app.entitlement?.managementURL).catch((e) => setError(e.message)) }]
      : []),
    { title: "Terms", run: () => void openLegal("terms").catch((e) => setError(e.message)) },
    { title: "Privacy", run: () => void openLegal("privacy").catch((e) => setError(e.message)) },
  ];
  const platform = Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : "web";
  return (
    <SafeAreaView edges={["top", "left", "right", "bottom"]} className="flex-1 bg-background">
      <View className="mx-auto w-full max-w-md px-5 pt-2">
        <NavigationBack onPress={leave} label="Close" />
      </View>
      <ScrollView contentContainerClassName="mx-auto w-full max-w-md flex-grow justify-center gap-6 px-6 pb-4" bounces={false}>
        <PaywallHero />
        {loading ? (
          <Loading />
        ) : plans.length ? (
          <PlanOptions plans={plans} selected={selected} onSelect={id => { selectAnalytics(id); setSelected(id); }} disabled={working} />
        ) : Platform.OS === "web" ? (
          <Text className="text-center text-body text-muted-foreground">Pictopia+ is available in the Pictopia app for iPhone and Android.</Text>
        ) : (
          <View className="items-center gap-2">
            <Text className="text-center text-body text-muted-foreground">Plans couldn’t load from the store.</Text>
            <Button secondary onPress={load}>Try again</Button>
          </View>
        )}
        {error ? <Text accessibilityRole="alert" className="text-center text-body leading-6 text-destructive">{error}</Text> : null}
      </ScrollView>
      <View className="mx-auto w-full max-w-md gap-2 px-6 pb-2 pt-2">
        {offer && !app.pro ? <Text className="text-center text-caption leading-5 text-muted-foreground">{planTerms(offer, platform)}</Text> : null}
        <Button large disabled={working || !offer || app.pro} onPress={() => void buy()}>
          {app.pro ? "Pictopia+ is already unlocked" : working ? "Waiting for the store…" : planAction(offer)}
        </Button>
        <PaywallLinks links={links} disabled={working} />
      </View>
    </SafeAreaView>
  );
}
