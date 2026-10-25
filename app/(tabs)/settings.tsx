import React, { useState } from "react";
import { View, Pressable, Switch, Modal, Platform } from "react-native";
import Constants from "expo-constants";
import { router } from "expo-router";
import { Page, Text, Icon, Button } from "@/components/flickwell/ui";
import { useFlickWell } from "@/components/flickwell/provider";
import { useTheme } from "@/theming/ThemeProvider";
import { repository } from "@/services/repository";
import { mediaService } from "@/services/media";
import { Preferences } from "@/lib/flickwell/types";
import { openLegal, manageSubscription } from "@/lib/flickwell/links";
import { bytes } from "@/lib/flickwell/logic";
export default function Settings() {
  const app = useFlickWell();
  const { theme } = useTheme();
  const [confirm, setConfirm] = useState<"reset" | "cache" | null>(null),
    [working, setWorking] = useState(false);
  const toggles: { key: keyof Preferences; title: string; desc: string }[] = [
    { key: "haptics", title: "Gentle haptics", desc: "A little feedback with every decision" },
    { key: "autoplay", title: "Autoplay videos", desc: "Play videos when you open a preview" },
    {
      key: "includeFavorites",
      title: "Include favorites",
      desc: "Include favorite memories in suggestions",
    },
    {
      key: "showReviewed",
      title: "Show reviewed items",
      desc: "Revisit photos you have already reviewed",
    },
    {
      key: "reverseSwipe",
      title: "Reverse swipe directions",
      desc: "Swipe left to keep and right to set aside",
    },
  ];
  async function action(work: () => Promise<unknown>) {
    try {
      await work();
    } catch (e) {
      app.setError((e as Error).message);
    }
  }
  async function reset() {
    setWorking(true);
    try {
      app.pauseScan();
      await repository.reset(confirm === "cache");
      await app.refresh();
      setConfirm(null);
    } catch (e) {
      app.setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  }
  return (
    <Page title="Make yourself at home" subtitle="Your preferences. Your privacy. Your pace.">
      <View className="mb-7 flex-row items-center justify-between rounded-3xl bg-accent p-6">
        <View>
          <View className="mb-2 flex-row items-center gap-2">
            <Icon name="Sparkles" size={20} className="text-primary" />
            <Text className="text-h3 text-foreground">
              {app.pro ? "FlickWell Pro" : "A smarter kind of clean"}
            </Text>
          </View>
          <Text className="max-w-xs text-body leading-6 text-muted-foreground">
            {app.pro
              ? "Your Pro tools are unlocked."
              : "Manual cleanup is always free. Go Pro for deeper local analysis."}
          </Text>
        </View>
        <Pressable
          onPress={() => router.push("/paywall")}
          className="ml-3 rounded-full bg-primary p-3"
        >
          <Icon name="ArrowRight" size={21} className="text-primary-foreground" />
        </Pressable>
      </View>
      <Text className="mb-3 text-h3 text-foreground">A little more you</Text>
      <View className="mb-7 rounded-3xl border border-border bg-card p-5">
        <Text className="mb-3 text-h5 text-foreground">Appearance</Text>
        <View className="mb-4 flex-row gap-2">
          {(["system", "light", "dark"] as const).map((mode) => (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ selected: app.prefs.appearance === mode }}
              key={mode}
              onPress={() => void action(() => app.updatePrefs({ appearance: mode }))}
              className={`flex-1 items-center rounded-xl py-3 ${app.prefs.appearance === mode ? "bg-primary" : "bg-secondary"}`}
            >
              <Text
                className={`text-h6 ${app.prefs.appearance === mode ? "text-primary-foreground" : "text-foreground"}`}
              >
                {mode[0].toUpperCase() + mode.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>
        {toggles.map((t) => (
          <View key={t.key} className="flex-row items-center gap-4 border-t border-border py-4">
            <View className="flex-1">
              <Text className="text-h5 text-foreground">{t.title}</Text>
              <Text className="mt-1 text-caption leading-5 text-muted-foreground">{t.desc}</Text>
            </View>
            <Switch
              accessibilityLabel={t.title}
              value={Boolean(app.prefs[t.key])}
              trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
              onValueChange={(v) => void action(() => app.updatePrefs({ [t.key]: v }))}
            />
          </View>
        ))}
      </View>
      <Text className="mb-3 text-h3 text-foreground">Your library & progress</Text>
      <View className="mb-7 gap-3 rounded-3xl border border-border bg-card p-5">
        <View className="flex-row justify-between">
          <Text className="text-h5 text-foreground">Photo access</Text>
          <Text className="text-body text-primary">{app.permission?.label ?? "Checking…"}</Text>
        </View>
        <Text className="text-body leading-6 text-muted-foreground">
          {Platform.OS === "web"
            ? "The browser only sees files you select. Device deletion is unavailable here."
            : "Limited access is welcome. You control which memories FlickWell can see."}
        </Text>
        <Button
          secondary
          onPress={() =>
            void action(() => (Platform.OS === "web" ? app.connect() : mediaService.manageAccess()))
          }
        >
          {Platform.OS === "web" ? "Choose more files" : "Manage photo access"}
        </Button>
        <View className="border-t border-border pt-4">
          <Text className="text-body leading-7 text-muted-foreground">
            {app.stats.photos} photos • {app.stats.videos} videos{"\n"}
            {app.stats.reviewed} reviewed • {app.stats.pending} marked{"\n"}
            {bytes(app.stats.knownBytes)} across {app.stats.knownSizes} items with known sizes
          </Text>
        </View>
        <Pressable
          disabled={app.scan.status === "running" || app.busy}
          onPress={() => setConfirm("reset")}
          className="py-3"
        >
          <Text className="text-body text-destructive">Reset cleanup decisions</Text>
        </Pressable>
        <Pressable
          disabled={app.scan.status === "running" || app.busy}
          onPress={() => setConfirm("cache")}
          className="py-3"
        >
          <Text className="text-body text-muted-foreground">Clear local analysis cache</Text>
        </Pressable>
      </View>
      <Text className="mb-3 text-h3 text-foreground">The important stuff</Text>
      <View className="mb-7 overflow-hidden rounded-3xl border border-border bg-card">
        {[
          { title: "Cleanup insights", onPress: () => router.push("/statistics") },
          { title: "Restore purchases", onPress: () => void action(app.restorePurchases) },
          {
            title: "Manage subscription",
            onPress: () => void action(() => manageSubscription(app.entitlement?.managementURL)),
          },
          {
            title: "Privacy policy",
            onPress: () => void action(() => openLegal("privacy")),
          },
          {
            title: "Terms of service",
            onPress: () => void action(() => openLegal("terms")),
          },
          { title: "Help & support", onPress: () => router.push("/help") },
        ].map((row) => (
          <Pressable
            key={row.title}
            onPress={row.onPress}
            className="min-h-14 flex-row items-center justify-between border-b border-border px-5 py-4"
          >
            <Text className="text-body text-foreground">{row.title}</Text>
            <Icon name="ChevronRight" size={17} className="text-muted-foreground" />
          </Pressable>
        ))}
      </View>
      <Text className="text-caption text-center text-muted-foreground">
        FlickWell {Constants.expoConfig?.version ?? "1.0.0"} • Build{" "}
        {Constants.expoConfig?.ios?.buildNumber ??
          Constants.expoConfig?.android?.versionCode ??
          "1"}
        {"\n"}Keep the memories. Lose the clutter.
      </Text>
      <Modal
        visible={!!confirm}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirm(null)}
      >
        <View className="flex-1 items-center justify-center bg-overlay/70 px-5">
          <View className="w-full max-w-md gap-5 rounded-3xl bg-card p-7">
            <Text className="text-h2 text-foreground">
              {confirm === "cache" ? "Clear scan results?" : "Start fresh?"}
            </Text>
            <Text className="text-body leading-6 text-muted-foreground">
              {confirm === "cache"
                ? "This removes local analysis results. You can scan again. Your photos and cleanup decisions stay safe."
                : "This clears keep/delete decisions and your current session. No original photos or videos will be deleted."}
            </Text>
            <Button danger disabled={working} onPress={() => void reset()}>
              {working ? "Working…" : "Confirm reset"}
            </Button>
            <Button secondary disabled={working} onPress={() => setConfirm(null)}>
              Cancel
            </Button>
          </View>
        </View>
      </Modal>
    </Page>
  );
}
