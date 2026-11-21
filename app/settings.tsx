import { useLifetimeTest } from "@/components/pictopia/use-lifetime-test";
import { lifetimeTestStore } from "@/services/lifetime-testing";
import { defaultLifetimeTest, TEST_SUBSCRIPTIONS, TEST_PERCENTAGES, TEST_COUNTS, TEST_AWARDS, testQualifies } from "@/lib/pictopia/lifetime-testing";
import { ScreenHeader } from "@/components/pictopia/navigation-header";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AppState, Linking, Platform, Pressable, ScrollView, Switch, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Constants from "expo-constants";
import { router } from "expo-router";
import { Icon, Text } from "@/components/pictopia/ui";
import { usePictopia } from "@/components/pictopia/provider";
import { useLift } from "@/components/pictopia/playful";
import { AdventureCover } from "@/components/pictopia/adventure-art";
import { useTheme } from "@/theming/ThemeProvider";
import { PASTELS, nightColors, savedPastel, type PastelId } from "@/theming/pastels";
import { mediaService } from "@/services/media";
import { openLegal, manageSubscription } from "@/lib/pictopia/links";
import { REMINDER_TIMES, reminderTimeLabel } from "@/lib/pictopia/reminders";
import type { ReminderPrefs } from "@/lib/pictopia/types";
import { notificationService } from "@/services/notifications";
import { syncReminders } from "@/services/reminders";
import { allowanceStore } from "@/services/daily";
import { DEV_REVIEW_LIMITS, type DevSubscriptionMode } from "@/lib/pictopia/entitlement";
import { DEFAULT_FREE_SWIPES } from "@/lib/pictopia/daily";
import { PAYWALL_TEASER } from "@/lib/pictopia/paywall";
import type { ReminderPermission } from "@/services/notifications.types";

const SUPPORT = process.env.EXPO_PUBLIC_SUPPORT_EMAIL;

function Row({ title, value, onPress, children, last }: { title: string; value?: string; onPress?: () => void; children?: ReactNode; last?: boolean }) {
  const body = (
    <>
      <Text className="flex-1 text-body text-foreground">{title}</Text>
      {value !== undefined && <Text className="text-body text-muted-foreground">{value}</Text>}
      {children}
      {onPress && !children && <Icon name="ChevronRight" size={17} className="text-muted-foreground" />}
    </>
  );
  const cls = `min-h-14 flex-row items-center gap-3 px-4 ${last ? "" : "border-b border-border"}`;
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress} className={`${cls} active:opacity-70`}>{body}</Pressable>
  ) : (
    <View className={cls}>{body}</View>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  const lift = useLift();
  return (
    <>
      <Text accessibilityRole="header" className="mb-2.5 mt-6 text-h3 text-foreground">{title}</Text>
      <View style={lift} className="overflow-hidden rounded-[20px] bg-card">{children}</View>
    </>
  );
}

function Chips<T extends string | number | undefined>({ label, options, value, onChange }: { label: string; options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} className="flex-row flex-wrap gap-2">
      {options.map(o => {
        const on = o.value === value;
        return (
          <Pressable key={String(o.value)} accessibilityRole="radio" accessibilityState={{ checked: on }} aria-checked={on} onPress={() => onChange(o.value)} className={`min-h-10 justify-center rounded-full px-3.5 ${on ? "bg-primary" : "bg-background"} active:opacity-80`}>
            <Text className={`text-h6 ${on ? "text-primary-foreground" : "text-foreground"}`}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function LifetimeTestingPanel({ action }: { action: (work: () => Promise<unknown>) => Promise<void> }) {
  const app = usePictopia();
  const simulation = useLifetimeTest();
  const [result, setResult] = useState<string>();
  if (!lifetimeTestStore.authorized) return null;
  const s = simulation ?? defaultLifetimeTest;
  const subscriptionLabels = { free: "Free", trial: "Trial", paid: "Active paid", "canceled-active": "Canceled · active", expired: "Expired" };
  const awardLabels = { "not-earned": "Not earned", eligible: "Eligible", earned: "Earned" };
  return <View className="gap-3 border-t border-border px-4 py-4">
    <Text accessibilityRole="header" className="text-h4 text-foreground">Pictopia+ for Life testing</Text>
    <Text className="text-caption text-primary">{simulation ? "Simulation active" : "Actual device state"} · test builds only</Text>
    <Text className="text-caption leading-5 text-muted-foreground">Temporary scenarios drive Progress, The Big Picture, the lifetime achievement and premium access. Full access and a successful scan are assumed. No photos, purchases or real awards change. Reloading clears this simulation.</Text>
    <Text className="text-body text-foreground">Subscription status</Text>
    <Chips label="Test subscription status" options={TEST_SUBSCRIPTIONS.map(value => ({ value, label: subscriptionLabels[value] }))} value={simulation?.subscription} onChange={subscription => lifetimeTestStore.change({ subscription })} />
    <Text className="text-body text-foreground">Big Picture progress</Text>
    <Chips label="Test Big Picture progress" options={TEST_PERCENTAGES.map(value => ({ value, label: `${value}%` }))} value={simulation?.percent} onChange={percent => lifetimeTestStore.change({ percent })} />
    <Text className="text-body text-foreground">Eligible library count</Text>
    <Chips label="Test eligible library count" options={TEST_COUNTS.map(value => ({ value, label: value.toLocaleString() }))} value={simulation?.count} onChange={count => lifetimeTestStore.change({ count })} />
    <Text className="text-body text-foreground">Lifetime award</Text>
    <Chips label="Test lifetime award" options={TEST_AWARDS.map(value => ({ value, label: awardLabels[value] }))} value={simulation?.award} onChange={award => lifetimeTestStore.change({ award })} />
    <Text className="text-caption text-muted-foreground">Eligible stages a completion check; it grants access only after the check passes. Earned directly previews an existing award. These controls take priority over Subscription mode above.</Text>
    {simulation ? <Text accessibilityLiveRegion="polite" className="text-caption text-foreground">{s.count.toLocaleString()} photos · {s.percent}% explored · {testQualifies(s) ? "Qualifies for completion" : "Completion requirements not met"} · {app.pro ? "Premium access on" : "Free access"}</Text> : null}
    <TestAction title="Complete 15,000 photos & earn for Life" onPress={() => { setResult(undefined); lifetimeTestStore.scenario(); }} />
    <TestAction title="Run completion check" onPress={() => setResult(lifetimeTestStore.complete() ? "Simulated lifetime access earned. Expire the subscription next to verify it stays active." : "Needs active paid access, 100% explored and at least 10,000 photos.")} />
    <TestAction title="Expire subscription after award" onPress={() => { lifetimeTestStore.change({ subscription: "expired" }); setResult("Subscription expired. An earned lifetime award keeps premium access active."); }} />
    {result ? <Text accessibilityRole="alert" className="text-caption text-foreground">{result}</Text> : null}
    <TestAction title="Open real Progress screen" onPress={() => router.push("/(tabs)/progress")} />
    <TestAction title="Reset all overrides to actual device state" onPress={() => void action(async () => {
      await app.setDevOverride({ mode: "auto", reviewLimit: undefined });
      lifetimeTestStore.reset(); setResult(undefined);
    })} />
  </View>;
}
function TestAction({ title, onPress }: { title: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} className="min-h-12 justify-center rounded-xl bg-background px-3 py-3 active:opacity-70"><Text className="text-h6 text-primary">{title}</Text></Pressable>;
}

const APPEARANCES = [
  { value: "system", label: "System", icon: "SunMoon" },
  { value: "light", label: "Light", icon: "Sun" },
  { value: "dark", label: "Dark", icon: "Moon" },
] as const;

const MODES: { value: DevSubscriptionMode; label: string }[] = [
  { value: "auto", label: "Automatic" },
  { value: "free", label: "Free" },
  { value: "plus", label: "Pictopia+" },
];

/** Authorized test builds only (`app.devTools`; the entitlement layer refuses overrides
 * elsewhere). Switches Free / Pictopia+ without a purchase, and controls the daily allowance. */
function DeveloperTools({ action }: { action: (work: () => Promise<unknown>) => Promise<void> }) {
  const app = usePictopia();
  const [usage, setUsage] = useState<{ used: number; limit: number }>();
  const [replaying, setReplaying] = useState(false);
  useEffect(() => {
    let alive = true;
    void Promise.all([allowanceStore.state(), allowanceStore.limit()])
      .then(([state, limit]) => { if (alive) setUsage({ used: state.counted.length, limit }); })
      .catch(() => {});
    return () => { alive = false; };
  }, [app.revision, app.devOverride]);
  const effective = app.pro ? "Pictopia+" : "Free";
  const why = app.entitlementSource === "developer"
    ? "Developer override · not a purchase"
    : app.pro ? "Active store purchase" : "No active purchase";
  async function replayOnboarding() {
    if (!app.devTools || !app.ready || replaying) return;
    setReplaying(true);
    try {
      await app.updatePrefs({ replayOnboarding: true });
      router.replace("/onboarding");
    } finally {
      setReplaying(false);
    }
  }
  return (
    <Group title="Developer tools">
      <Row title="Photomosaic Lab" onPress={() => router.push("/photomosaic-lab")} />
      <View className="gap-1 border-b border-border px-4 py-3.5">
        <View className="flex-row items-center gap-2">
          <Text className="flex-1 text-body text-foreground">Effective access</Text>
          <View className={`rounded-full px-2.5 py-1 ${app.pro ? "bg-sun" : "bg-background"}`}><Text className="text-h6 text-foreground">{effective}</Text></View>
        </View>
        <Text className="text-caption text-muted-foreground">{why}</Text>
      </View>
      <View className="gap-2.5 border-b border-border px-4 py-3.5">
        <Text className="text-body text-foreground">Subscription mode</Text>
        <Chips label="Subscription mode" options={MODES} value={app.devOverride.mode} onChange={mode => void action(() => app.setDevOverride({ mode }))} />
        <Text className="text-caption leading-5 text-muted-foreground">Automatic uses the real App Store or Google Play purchase. Free and Pictopia+ ignore it until you switch back.</Text>
      </View>
      <Pressable accessibilityRole="button" disabled={!app.ready || replaying} onPress={() => void action(replayOnboarding)} className="min-h-14 justify-center gap-0.5 border-b border-border px-4 py-3 active:opacity-70">
        <Text className="text-body text-primary">{replaying ? "Opening onboarding…" : "Reset onboarding"}</Text>
        <Text className="text-caption leading-5 text-muted-foreground">Replay from Welcome, including the Pictopia+ offer. Photo progress and store purchases are kept.</Text>
      </Pressable>
      <View className="gap-2.5 border-b border-border px-4 py-3.5">
        <Text className="text-body text-foreground">Free daily review limit</Text>
        <Chips
          label="Free daily review limit"
          options={[{ value: undefined, label: `${DEFAULT_FREE_SWIPES} (real)` }, ...DEV_REVIEW_LIMITS.map(n => ({ value: n as number | undefined, label: String(n) }))]}
          value={app.devOverride.reviewLimit}
          onChange={reviewLimit => void action(() => app.setDevOverride({ reviewLimit }))}
        />
        <Text className="text-caption leading-5 text-muted-foreground">A lower limit reaches the daily-limit page quickly. Only applies in Free.</Text>
      </View>
      <Row title="Today’s free reviews" value={usage ? `${Math.min(usage.used, usage.limit)} of ${usage.limit} used` : "…"} />
      <Pressable accessibilityRole="button" onPress={() => void action(app.resetDailyUsage)} className="min-h-14 justify-center gap-0.5 px-4 py-3 active:opacity-70">
        <Text className="text-body text-primary">Reset today’s usage</Text>
        <Text className="text-caption text-muted-foreground">Photos, discards and deletions are kept</Text>
      </Pressable>
      <LifetimeTestingPanel action={action} />
    </Group>
  );
}

/** Settings, a sheet from the gear on every tab: Pro, theme, photos, help and legal. Reset and
 * analysis-cache controls live in the developer Adventure Lab. */
export default function Settings() {
  const app = usePictopia();
  const { theme } = useTheme();
  const lift = useLift();
  const [message, setMessage] = useState<string>();
  async function action(work: () => Promise<unknown>) {
    setMessage(undefined);
    try {
      await work();
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  // Reminders: the OS permission decides what's shown; re-read when returning from Settings.
  const [notify, setNotify] = useState<ReminderPermission>();
  const readNotify = useCallback(() => { void notificationService.permission().then(setNotify).catch(() => setNotify("unsupported")); }, []);
  useEffect(() => {
    readNotify();
    const subscription = AppState.addEventListener("change", state => { if (state === "active") readNotify(); });
    return () => subscription.remove();
  }, [readNotify]);
  const reminders = app.prefs.reminders;
  const setReminders = (p: Partial<ReminderPrefs>) => void action(() => app.updatePrefs({ reminders: { ...reminders, ...p } }));
  const reminderToggle = (key: "streak" | "onThisDay" | "discarded", title: string) => (
    <Switch
      className="self-center"
      accessibilityLabel={title}
      value={reminders[key]}
      trackColor={{ true: theme.colors.grass, false: theme.colors.tint }}
      ios_backgroundColor={theme.colors.tint}
      onValueChange={(v) => setReminders({ [key]: v })}
    />
  );
  const close = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)/home"));
  const toggle = (key: "haptics" | "autoplay", title: string) => (
    <Switch
      className="self-center"
      accessibilityLabel={title}
      value={app.prefs[key]}
      trackColor={{ true: theme.colors.grass, false: theme.colors.tint }}
      ios_backgroundColor={theme.colors.tint}
      onValueChange={(v) => void action(() => app.updatePrefs({ [key]: v }))}
    />
  );
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right", "bottom"]}>
      <View className="mx-auto w-full max-w-md px-5"><ScreenHeader title="Settings" onBack={close} action={<Pressable accessibilityRole="button" accessibilityLabel="Done with Settings" onPress={close} className="h-12 min-w-12 items-center justify-center px-2"><Text className="text-h4 text-foreground">Done</Text></Pressable>} /></View>
      <ScrollView contentContainerClassName="mx-auto w-full max-w-md px-[18px] pb-10">
        {!!message && <Text accessibilityRole="alert" className="mt-3 text-body text-destructive">{message}</Text>}

        <Pressable
          accessibilityRole="button"
          onPress={() => (app.pro && app.entitlementSource !== "developer" ? void action(() => manageSubscription(app.entitlement?.managementURL)) : router.push({ pathname: "/paywall", params: { entry: "Settings" } }))}
          style={lift}
          className="mt-4 flex-row items-center gap-3 rounded-[20px] bg-feature px-4 py-4 active:opacity-90"
        >
          <View className="h-11 w-11 items-center justify-center rounded-full bg-sun">
            <Icon name="Sparkles" size={20} className="text-sun-ink" />
          </View>
          <View className="flex-1">
            <Text className="text-h3 text-feature-foreground">{app.entitlementSource === "lifetime" ? "Pictopia+ for Life" : app.pro ? "Pictopia+ · Active" : "Pictopia+"}</Text>
            <Text className="text-caption text-feature-foreground/80">
              {app.entitlementSource === "lifetime"
                ? "Permanent access · Manage store billing"
                : app.pro && app.entitlementSource === "developer"
                ? "Developer override · not a purchase"
                : app.pro
                ? app.entitlement?.expires
                  ? `Renews or ends ${new Date(app.entitlement.expires).toLocaleDateString()} · Manage`
                  : "Unlimited swipes · Manage"
                : PAYWALL_TEASER}
            </Text>
          </View>
          <Icon name="ChevronRight" size={18} className="text-feature-foreground" />
        </Pressable>
        {Platform.OS !== "web" && (
          <Pressable accessibilityRole="button" onPress={() => void action(app.restorePurchases)} className="min-h-11 items-center justify-center">
            <Text className="text-h5 text-muted-foreground">Restore purchases</Text>
          </Pressable>
        )}

        <View style={lift} className="mt-4 overflow-hidden rounded-[20px] bg-card"><Row title="Invite a friend" onPress={() => router.push("/referrals")} last><Icon name="Handshake" size={20} className="text-foreground" /></Row></View>
        <Text accessibilityRole="header" className="mb-2.5 mt-4 text-h3 text-foreground">Theme</Text>
        <View style={lift} className="gap-4 rounded-[20px] bg-card px-3 pb-4 pt-3.5">
          <View accessibilityRole="radiogroup" accessibilityLabel="Appearance" className="flex-row gap-1 rounded-full bg-background p-1">
            {APPEARANCES.map(o => {
              const on = app.prefs.appearance === o.value;
              return (
                <Pressable
                  key={o.value}
                  accessibilityRole="radio"
                  accessibilityLabel={o.label}
                  accessibilityState={{ checked: on }}
                  aria-checked={on}
                  onPress={() => void action(() => app.updatePrefs({ appearance: o.value }))}
                  className={`min-h-10 flex-1 flex-row items-center justify-center gap-1.5 rounded-full ${on ? "bg-primary" : ""} active:opacity-80`}
                >
                  <Icon name={o.icon} size={16} className={on ? "text-primary-foreground" : "text-muted-foreground"} />
                  <Text className={`text-h6 ${on ? "text-primary-foreground" : "text-muted-foreground"}`}>{o.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <View className="relative flex-row items-center gap-2.5 rounded-[14px] bg-background p-2.5">
            <View className="flex-1 gap-1">
              <Text className="text-h4 text-foreground">Where to today?</Text>
              <Text className="text-caption text-muted-foreground">Preview · artwork never changes</Text>
            </View>
            <View className="h-14 w-11 overflow-hidden rounded-md border-[3px] border-white" style={{ transform: [{ rotate: "-4deg" }] }}><AdventureCover kind="capsule" /></View>
            <View className="h-6 w-6 items-center justify-center rounded-full bg-tomato"><Text className="text-[11px] text-white">or</Text></View>
            <View className="h-14 w-11 overflow-hidden rounded-md border-[3px] border-white" style={{ transform: [{ rotate: "4deg" }] }}><AdventureCover kind="detour" /></View>
          </View>
          <View accessibilityRole="radiogroup" accessibilityLabel="Theme colour" className="flex-row flex-wrap justify-between gap-y-3.5">
            {PASTELS.map((p) => {
              const on = savedPastel(app.prefs.theme) === p.id;
              const night = theme.name === "dark" ? nightColors(p) : undefined;
              return (
                <Pressable
                  key={p.id}
                  accessibilityRole="radio"
                  accessibilityLabel={p.name}
                  accessibilityState={{ checked: on }}
                  onPress={() => void action(() => app.updatePrefs({ theme: p.id as PastelId }))}
                  className="w-[19%] items-center gap-1.5"
                >
                  <View
                    style={{ backgroundColor: night?.border ?? p.swatch, boxShadow: on ? `0px 0px 0px 3px ${night ? theme.colors.card : "#fff"}, 0px 0px 0px 5px ${theme.colors.foreground}` : `inset 0px 0px 0px 1px ${night?.muted ?? p.tint}` }}
                    className="h-12 w-12 items-center justify-center rounded-full"
                  >
                    {on && <Icon name="Check" size={20} className="text-foreground" />}
                  </View>
                  <Text className={`text-[12px] ${on ? "text-foreground" : "text-muted-foreground"}`}>{p.name}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Group title="Reminders">
          {notify === "granted" ? (
            <>
              <Row title="Streak reminders">{reminderToggle("streak", "Streak reminders")}</Row>
              <Row title="On This Day">{reminderToggle("onThisDay", "On This Day reminders")}</Row>
              <Row title="Photos waiting in Discarded">{reminderToggle("discarded", "Discarded reminders")}</Row>
              <View className="gap-2.5 px-4 py-3.5">
                <Text className="text-body text-foreground">Time</Text>
                <View accessibilityRole="radiogroup" accessibilityLabel="Reminder time" className="flex-row flex-wrap gap-2">
                  {REMINDER_TIMES.map(hour => {
                    const on = reminders.hour === hour && reminders.minute === 0;
                    return (
                      <Pressable key={hour} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => setReminders({ hour, minute: 0 })} className={`min-h-10 justify-center rounded-full px-3.5 ${on ? "bg-primary" : "bg-secondary"} active:opacity-80`}>
                        <Text className={`text-h6 ${on ? "text-primary-foreground" : "text-foreground"}`}>{reminderTimeLabel(hour)}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text className="text-caption leading-5 text-muted-foreground">On This Day reminders arrive at 8 am. Streak and Discarded reminders use the time you choose above.</Text>
              </View>
            </>
          ) : notify === "unsupported" ? (
            <View className="px-4 py-3.5"><Text className="text-body leading-6 text-muted-foreground">Reminders work in the Pictopia app on your phone.</Text></View>
          ) : notify === "denied" ? (
            <Row title="Notifications are off for Pictopia" value="Open Settings" last onPress={() => void action(() => Linking.openSettings())} />
          ) : (
            <Row title="Turn on reminders" last onPress={() => void action(async () => { const result = await notificationService.request(); setNotify(result); if (result === "granted") await syncReminders(reminders); })} />
          )}
        </Group>

        <Group title="Photos & feel">
          <Row title="Photo access" value={app.permission?.label ?? "Checking…"} onPress={() => void action(() => (Platform.OS === "web" ? app.connect() : mediaService.manageAccess()))} />
          {Platform.OS !== "web" ? <Row title="Autoplay videos in review">{toggle("autoplay", "Autoplay videos in review")}</Row> : null}
          <Row title="Haptics" last>{toggle("haptics", "Haptics")}</Row>
        </Group>

        <Group title="Help">
          <Row title="Help & tips" onPress={() => router.push("/help")} />
          {!!SUPPORT && <Row title="Contact support" onPress={() => void action(() => Linking.openURL(`mailto:${SUPPORT}`))} />}
          <Row title="Privacy policy" onPress={() => void action(() => openLegal("privacy"))} />
          <Row title="Terms of use" last onPress={() => void action(() => openLegal("terms"))} />
        </Group>

        {app.devTools ? <DeveloperTools action={action} /> : null}

        {/* Long-press the version line to open the developer-only Adventure Lab and Device checks. */}
        <Pressable accessibilityRole="text" onLongPress={() => router.push("/adventure-lab")} delayLongPress={800} className="mt-8">
          <Text className="text-center text-caption text-muted-foreground">
            Pictopia {Constants.expoConfig?.version ?? "1.0.0"} · Build {Constants.expoConfig?.ios?.buildNumber ?? Constants.expoConfig?.android?.versionCode ?? "1"}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
