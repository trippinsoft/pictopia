import React, { useCallback, useState } from "react";
import { View, Pressable, Switch, Modal, Platform, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Constants from "expo-constants";
import { router, useFocusEffect } from "expo-router";
import { Text, Icon, Button } from "@/components/pictopia/ui";
import { usePictopia } from "@/components/pictopia/provider";
import { useTheme } from "@/theming/ThemeProvider";
import { repository } from "@/services/repository";
import { mediaService } from "@/services/media";
import { Preferences } from "@/lib/pictopia/types";
import { openLegal, manageSubscription } from "@/lib/pictopia/links";
import { bytes } from "@/lib/pictopia/logic";
import { plural } from "@/lib/pictopia/text";
import { adventureStore } from "@/services/adventures";
export default function Settings() {
  const app = usePictopia();
  const { theme } = useTheme();
  const [confirm, setConfirm] = useState<"reset" | "cache" | null>(null),
    [working, setWorking] = useState(false);
  const [journey, setJourney] = useState<Awaited<ReturnType<typeof adventureStore.journey>>>();
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void adventureStore
        .journey()
        .then((j) => alive && setJourney(j))
        .catch(() => {});
      return () => {
        alive = false;
      };
    }, []),
  );
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
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
    <ScrollView><View className="mx-auto w-full max-w-md px-6 pb-8 pt-6">
      <Text accessibilityRole="header" className="text-h1 text-foreground">Settings</Text>
      <Text className="mb-7 mt-2 text-body text-muted-foreground">Your photos. Your preferences. Your pace.</Text>
      <Pressable accessibilityRole="button" onPress={() => router.push("/queue")} className="mb-5 flex-row items-center gap-4 rounded-3xl border border-border bg-card p-4">
        <View className="h-12 w-12 items-center justify-center rounded-2xl bg-secondary"><Icon name="Trash2" size={23} className="text-destructive" /></View>
        <View className="flex-1"><Text className="text-h5 text-foreground">Pending deletions</Text><Text className="mt-1 text-caption text-muted-foreground">{plural(app.stats.pending, "photo")} in your deletion queue</Text></View>
        <Icon name="ChevronRight" size={18} className="text-muted-foreground" />
      </Pressable>
      <Text className="mb-3 text-h3 text-foreground">Preferences</Text>
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
              ios_backgroundColor={theme.colors.border}
              thumbColor={
                app.prefs[t.key] ? theme.colors.primaryForeground : theme.colors.mutedForeground
              }
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
            : "Limited access is welcome. You control which memories Pictopia can see."}
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
      {!!journey?.adventures && (
        <>
          <Text className="mb-3 text-h3 text-foreground">Your journey</Text>
          <View className="mb-7 rounded-3xl border border-border bg-card p-5">
            {[
              ["Explored on Adventures", plural(journey.explored, "photo")],
              ["Decided", plural(journey.reviewed, "photo")],
              ["Set aside (reversible)", plural(journey.setAside, "photo")],
              ["In the deletion queue", plural(journey.queued, "photo")],
              ["Deleted from your library", plural(journey.deleted, "photo")],
              [
                "Space recovered",
                journey.deleted
                  ? `${bytes(journey.recoveredBytes)}${journey.unknownSizes ? ` + ${plural(journey.unknownSizes, "item")} of unknown size` : ""}`
                  : "None yet",
              ],
            ].map(([label, value], i) => (
              <View
                key={label}
                className={`flex-row items-center justify-between py-3 ${i ? "border-t border-border" : ""}`}
              >
                <Text className="text-body text-foreground">{label}</Text>
                <Text className="text-body text-muted-foreground">{value}</Text>
              </View>
            ))}
            <Text className="mt-2 text-caption leading-5 text-muted-foreground">
              Each photo counts once, however many Adventures it appears in. Space is only counted
              after a deletion your device confirmed, using sizes Pictopia knows.
            </Text>
          </View>
        </>
      )}
      <Text className="mb-3 text-h3 text-foreground">The important stuff</Text>
      <View className="mb-7 overflow-hidden rounded-3xl border border-border bg-card">
        {[
          { title: "Photos set aside on adventures", onPress: () => router.push("/set-aside") },
          { title: "Classic timed sessions", onPress: () => router.push("/(tabs)/swipe") },
          { title: "Smart Clean", onPress: () => router.push("/(tabs)/smart") },
          { title: "Deletion queue", onPress: () => router.push("/queue") },
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
      <View className="mb-7 flex-row items-center justify-between rounded-3xl bg-accent p-6">
        <View>
          <View className="mb-2 flex-row items-center gap-2">
            <Icon name="Sparkles" size={20} className="text-primary" />
            <Text className="text-h3 text-foreground">
              {app.pro ? "Pictopia Pro" : "A smarter kind of clean"}
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
      {/* Long-press the version line to open the developer-only Adventure Lab on any build. */}
      <Pressable
        accessibilityRole="text"
        onLongPress={() => router.push("/adventure-lab")}
        delayLongPress={800}
      >
      <Text className="text-caption text-center text-muted-foreground">
        Pictopia {Constants.expoConfig?.version ?? "1.0.0"} • Build{" "}
        {Constants.expoConfig?.ios?.buildNumber ??
          Constants.expoConfig?.android?.versionCode ??
          "1"}
        {"\n"}Keep the memories. Lose the clutter.
      </Text>
      </Pressable>
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
    </View></ScrollView></SafeAreaView>
  );
}
