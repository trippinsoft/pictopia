import React, { useEffect, useState } from "react";
import { View, Pressable, Platform } from "react-native";
import { router } from "expo-router";
import { Page, Text, Icon, Button, Loading } from "@/components/pictopia/ui";
import { usePictopia } from "@/components/pictopia/provider";
import { purchaseService } from "@/services/purchases";
import { openLegal, manageSubscription } from "@/lib/pictopia/links";
import { Offer } from "@/lib/pictopia/types";
export default function Paywall() {
  const app = usePictopia();
  const [offers, setOffers] = useState<Offer[]>([]),
    [selected, setSelected] = useState(""),
    [loading, setLoading] = useState(true),
    [working, setWorking] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    void purchaseService
      .offers()
      .then((o) => {
        setOffers(o);
        setSelected(o.find((x) => x.kind === "annual")?.id ?? o[0]?.id ?? "");
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  const monthly = offers.find((o) => o.kind === "monthly"),
    annual = offers.find((o) => o.kind === "annual");
  const savings =
    monthly && annual && monthly.currency === annual.currency && monthly.amount > 0
      ? Math.floor((1 - annual.amount / (monthly.amount * 12)) * 100)
      : 0;
  /** Back to exactly where Pro was offered. A review stopped by the daily limit is still
   * open underneath, at the same photo, and now continues without a limit. */
  function leave() {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/home");
  }
  async function buy() {
    setWorking(true);
    setError("");
    try {
      const e = await purchaseService.purchase(selected);
      await app.setEntitlement(e);
      if (e.active) leave();
      else
        setError(
          "The store has not confirmed active Pictopia+ access yet. Try Restore Purchases after approval.",
        );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  }
  return (
    <Page title="A little extra brilliance">
      <View className="mx-auto max-w-xl">
        <View className="items-center">
          <View className="mb-5 h-20 w-20 items-center justify-center rounded-3xl bg-accent">
            <Icon name="Sparkles" size={38} className="text-primary" />
          </View>
          <Text className="text-h1 text-center text-foreground">
            Less searching.{"\n"}More space.
          </Text>
          <Text className="mt-4 text-body text-center leading-6 text-muted-foreground">
            Pictopia+ finds the clutter, so you can focus on the keepers.
          </Text>
        </View>
        <View className="my-7 gap-4">
          {[
            "Find exact duplicates with file-content hashes",
            "Compare similar shots and best-shot suggestions",
            "Review likely blurry photos and large videos",
            "Keep every photo analysis on your device",
          ].map((t) => (
            <View key={t} className="flex-row items-center gap-3">
              <Icon name="CircleCheck" size={20} className="text-primary" />
              <Text className="flex-1 text-body leading-6 text-foreground">{t}</Text>
            </View>
          ))}
        </View>
        {loading ? (
          <Loading />
        ) : (
          <View className="gap-3">
            {(["monthly", "annual", "lifetime"] as const).map((kind) => {
              const o = offers.find((x) => x.kind === kind);
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: o?.id === selected, disabled: !o || working }}
                  disabled={!o || working}
                  key={kind}
                  onPress={() => {
                    if (o) setSelected(o.id);
                  }}
                  className={`flex-row items-center justify-between rounded-2xl border p-5 ${o?.id === selected ? "border-primary bg-accent" : "border-border bg-card"}`}
                >
                  <View className="w-full gap-1">
                    <View className="flex-row items-start justify-between gap-3">
                      <Text className="min-w-0 flex-1 text-h5 text-foreground">
                        {kind === "monthly" ? "Pictopia+ Monthly" : kind === "annual" ? "Pictopia+ Yearly" : "Pictopia+ Lifetime"}
                      </Text>
                      <Text className="max-w-[50%] text-right text-h5 text-primary">{o?.price ?? "Unavailable"}</Text>
                    </View>
                    <Text className="text-caption text-muted-foreground">
                      {kind === "lifetime" ? "One payment. Ongoing Pictopia+ access." : kind === "annual" && savings > 0 ? `Save ${savings}% compared with monthly` : "Renews automatically. Cancel anytime."}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
        {!!error && (
          <Text accessibilityRole="alert" className="mt-5 text-body leading-6 text-destructive">
            {error}
          </Text>
        )}
        {Platform.OS === "web" && (
          <Text className="mt-5 text-body leading-6 text-muted-foreground">
            Store prices, purchases, and restoration are available in the native app. No purchase is
            simulated in this preview.
          </Text>
        )}
        <View className="mt-6">
          <Button disabled={working || !selected || app.pro} onPress={() => void buy()}>
            {app.pro
              ? "Pictopia+ is already unlocked"
              : working
                ? "Waiting for the store…"
                : "Continue with selected plan"}
          </Button>
        </View>
        <Text className="mt-4 text-caption text-center leading-5 text-muted-foreground">
          Payment is charged to your store account. Subscriptions renew unless cancelled at least 24
          hours before the end of the current period. Manage or cancel in your store account.
        </Text>
        <View className="mt-5 flex-row flex-wrap justify-center gap-1">
          {[
            {
              title: "Restore purchases",
              action: () => {
                setWorking(true);
                void app
                  .restorePurchases()
                  .then(leave)
                  .catch((e) => setError(e.message))
                  .finally(() => setWorking(false));
              },
            },
            {
              title: "Manage subscription",
              action: () =>
                void manageSubscription(app.entitlement?.managementURL).catch((e) =>
                  setError(e.message),
                ),
            },
            {
              title: "Privacy",
              action: () => void openLegal("privacy").catch((e) => setError(e.message)),
            },
            {
              title: "Terms",
              action: () => void openLegal("terms").catch((e) => setError(e.message)),
            },
          ].map((l) => (
            <Pressable disabled={working} key={l.title} onPress={l.action} className="p-3">
              <Text className="text-caption text-primary">{l.title}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </Page>
  );
}
