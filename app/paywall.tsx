import React, { useEffect, useState } from "react";
import { View, Pressable, Platform } from "react-native";
import { router } from "expo-router";
import { Page, Text, Icon, Button, Loading } from "@/components/flickwell/ui";
import { useFlickWell } from "@/components/flickwell/provider";
import { purchaseService } from "@/services/purchases";
import { openLegal, manageSubscription } from "@/lib/flickwell/links";
import { Offer } from "@/lib/flickwell/types";
export default function Paywall() {
  const app = useFlickWell();
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
  async function buy() {
    setWorking(true);
    setError("");
    try {
      const e = await purchaseService.purchase(selected);
      await app.setEntitlement(e);
      if (e.active) router.replace("/(tabs)/smart");
      else
        setError(
          "The store has not confirmed active Pro access yet. Try Restore Purchases after approval.",
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
        <Pressable
          accessibilityLabel="Close paywall"
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/home"))}
          className="mb-4 self-end p-3"
        >
          <Icon name="X" size={24} className="text-muted-foreground" />
        </Pressable>
        <View className="items-center">
          <View className="mb-5 h-20 w-20 items-center justify-center rounded-3xl bg-accent">
            <Icon name="Sparkles" size={38} className="text-primary" />
          </View>
          <Text className="text-h1 text-center text-foreground">
            Less searching.{"\n"}More space.
          </Text>
          <Text className="mt-4 text-body text-center leading-6 text-muted-foreground">
            FlickWell Pro finds the clutter, so you can focus on the keepers.
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
                  disabled={!o || working}
                  key={kind}
                  onPress={() => {
                    if (o) setSelected(o.id);
                  }}
                  className={`flex-row items-center justify-between rounded-2xl border p-5 ${o?.id === selected ? "border-primary bg-accent" : "border-border bg-card"}`}
                >
                  <View>
                    <Text className="text-h5 text-foreground">
                      {kind === "monthly"
                        ? "Monthly Pro"
                        : kind === "annual"
                          ? "Annual Pro"
                          : "Lifetime Pro"}
                    </Text>
                    <Text className="mt-1 text-caption text-muted-foreground">
                      {kind === "lifetime"
                        ? "One payment. Ongoing Pro access."
                        : kind === "annual" && savings > 0
                          ? `Save ${savings}% compared with monthly`
                          : "Renews automatically. Cancel anytime."}
                    </Text>
                  </View>
                  <Text className="text-h5 text-primary">{o?.price ?? "Unavailable"}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
        {error && (
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
              ? "Pro is already unlocked"
              : working
                ? "Waiting for the store…"
                : "Continue with selected plan"}
          </Button>
        </View>
        <Text className="mt-4 text-caption text-center leading-5 text-muted-foreground">
          Payment is charged to your store account. Subscriptions renew unless cancelled at least 24
          hours before the end of the current period. Manage or cancel in your store account.
          Lifetime is a one-time purchase. Manual cleanup remains free.
        </Text>
        <View className="mt-5 flex-row flex-wrap justify-center gap-1">
          {[
            {
              title: "Restore purchases",
              action: () => {
                setWorking(true);
                void app
                  .restorePurchases()
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
