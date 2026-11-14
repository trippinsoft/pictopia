import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import { Linking, Platform, View } from "react-native";
import { router, Stack } from "expo-router";
import { Button, Icon, Text } from "@/components/pictopia/ui";
import { usePictopia } from "@/components/pictopia/provider";
import { Postcard, Wordmark, useLift } from "@/components/pictopia/playful";
import { Illustration } from "@/components/pictopia/illustration";
import { OnboardingFrame, QuietAction } from "@/components/pictopia/onboarding/frame";
import { ScrollDemo, SpaceDemo, SwipeDemo } from "@/components/pictopia/onboarding/demos";
import { LibraryReveal } from "@/components/pictopia/onboarding/reveal";
import { Planning } from "@/components/pictopia/onboarding/planning";
import { TrialOffer } from "@/components/pictopia/onboarding/trial";
import { adventureName } from "@/lib/pictopia/catalog";
import { STORY_STEPS, TAGLINE, yearTotals, type OnboardingStep } from "@/lib/pictopia/onboarding";
import { openLegal } from "@/lib/pictopia/links";
import type { IconName } from "@/lib/icons/LucideIcon";
import { adventureStore, type AdventureSlot } from "@/services/adventures";
import { notificationService } from "@/services/notifications";
import { storage } from "@/services/repository";

const STORY: Record<"scroll" | "swipe" | "space", { title: string; body: string; demo: () => ReactElement }> = {
  scroll: { title: "Scroll through your memories", body: "Your photos, one after another, like a feed. Scroll past the ones you love and they stay put.", demo: ScrollDemo },
  swipe: { title: "Swipe away what you don’t need", body: "Swiped photos land in Discarded. Nothing is deleted until you say so.", demo: SwipeDemo },
  space: { title: "Watch the space add up", body: "Delete your discards in one go, free up storage, and earn streaks and badges along the way.", demo: SpaceDemo },
};

function AccessRow({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  return (
    <View className="flex-row gap-3.5">
      <View className="h-11 w-11 items-center justify-center rounded-full bg-sun"><Icon name={icon} size={22} className="text-foreground" /></View>
      <View className="flex-1 gap-0.5">
        <Text className="text-h4 text-foreground">{title}</Text>
        <Text className="text-body leading-6 text-muted-foreground">{body}</Text>
      </View>
    </View>
  );
}

/** First launch: welcome → three-step story → photo/reminder access → the user's own library
 * reveal → planning the first adventure → Pictopia+ trial offer → the first adventure. No
 * questions: Pictopia picks where to start. */
export default function Onboarding() {
  const app = usePictopia();
  const lift = useLift();
  // Someone who already gave access (e.g. reopened mid-way) continues from the reveal.
  const [step, setStep] = useState<OnboardingStep>(() => (app.permission?.granted && app.libraryReliable && app.stats.total > 0 ? "reveal" : "welcome"));
  const [connecting, setConnecting] = useState(false);
  const [accessError, setAccessError] = useState<string>();
  const [pick, setPick] = useState<AdventureSlot | null>();
  const [opening, setOpening] = useState(false);
  const years = useMemo(() => yearTotals(app.months), [app.months]);

  const finish = useCallback(async (then?: () => Promise<void>) => {
    await app.updatePrefs({ onboarded: true });
    router.replace("/(tabs)/home");
    if (then) await then();
  }, [app]);

  // Pictopia picks the first adventure while the planning screen plays.
  useEffect(() => {
    if (step !== "planning" || pick !== undefined) return;
    let alive = true;
    void adventureStore.home(Date.now(), app.pro).then(h => { if (alive) setPick(h.slots[0] ?? null); }).catch(() => { if (alive) setPick(null); });
    return () => { alive = false; };
  }, [step, pick]);

  async function allowAccess() {
    setConnecting(true);
    setAccessError(undefined);
    try {
      const connected = await app.connect();
      if (!connected || !(await storage.stats()).total) {
        setAccessError(!connected ? "Your library isn’t ready yet. Check photo access and try again; incomplete counts won’t be shown as final." : Platform.OS === "web" ? "No photos were chosen. Choose some photos and videos to begin." : "Pictopia needs access to your photos to show them to you. You can allow it in Settings.");
        return;
      }
      await notificationService.request().catch(() => {});
      setStep("reveal");
    } finally {
      setConnecting(false);
    }
  }
  async function startFirst() {
    if (!pick || opening) return;
    setOpening(true);
    try {
      await adventureStore.open(pick.adventure.id, app.pro);
      await finish(async () => { router.push({ pathname: "/vertical-explore", params: { adventure: pick.adventure.id } }); });
    } catch {
      setOpening(false);
      await finish();
    }
  }

  const screen = <Stack.Screen options={{ title: "Welcome to Pictopia", headerShown: false, gestureEnabled: false }} />;

  if (step === "welcome") return <>{screen}
    <OnboardingFrame footer={<>
      <Button large onPress={() => setStep("scroll")}>Get started</Button>
      <Text className="pt-1 text-center text-caption leading-6 text-muted-foreground">
        By continuing you agree to our{" "}
        <Text accessibilityRole="link" onPress={() => void openLegal("terms").catch(() => {})} className="text-caption text-tertiary">Terms</Text>
        {" "}and{" "}
        <Text accessibilityRole="link" onPress={() => void openLegal("privacy").catch(() => {})} className="text-caption text-tertiary">Privacy Policy</Text>
      </Text>
    </>}>
      <View className="items-center gap-7">
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[lift, { transform: [{ rotate: "-3deg" }] }]} className="h-72 w-56 rounded-[26px] bg-card p-2.5">
          <View className="flex-1 overflow-hidden rounded-[18px]"><Illustration name="detour" /></View>
        </View>
        <View className="items-center gap-3">
          <Wordmark />
          <Text accessibilityRole="header" className="text-center text-display text-foreground">{TAGLINE}</Text>
          <Text className="text-center text-body leading-6 text-muted-foreground">Scroll, swipe and rediscover your memories in a few minutes a day.</Text>
        </View>
      </View>
    </OnboardingFrame>
  </>;

  if (step === "scroll" || step === "swipe" || step === "space") {
    const index = STORY_STEPS.indexOf(step);
    const story = STORY[step];
    const Demo = story.demo;
    return <>{screen}
      <OnboardingFrame dots={{ count: STORY_STEPS.length, index }}
        footer={<Button large onPress={() => setStep(index < STORY_STEPS.length - 1 ? STORY_STEPS[index + 1] : "access")}>Continue</Button>}>
        <View className="gap-7">
          <Demo />
          <View className="gap-2.5">
            <Text accessibilityRole="header" className="text-center text-h1 text-foreground">{story.title}</Text>
            <Text className="text-center text-body leading-6 text-muted-foreground">{story.body}</Text>
          </View>
        </View>
      </OnboardingFrame>
    </>;
  }

  if (step === "access") return <>{screen}
    <OnboardingFrame footer={<>
      <Button large disabled={connecting} onPress={() => void allowAccess()}>
        {connecting ? (app.syncProgress ? `Getting to know your photos… ${app.syncProgress}` : "Opening your library…") : Platform.OS === "web" ? "Choose photos & videos" : "Allow access"}
      </Button>
      {accessError && Platform.OS !== "web" ? <QuietAction onPress={() => void Linking.openSettings()}>Open Settings</QuietAction> : null}
    </>}>
      <View className="gap-7">
        <Text accessibilityRole="header" className="text-center text-h1 text-foreground">Let’s meet your photos</Text>
        <View className="gap-5">
          <AccessRow icon="Images" title="Your photos" body={Platform.OS === "web" ? "Choose photos and videos from this device. Nothing is uploaded, and originals are never deleted here." : "So Pictopia can show you your memories. They stay on your phone: no account, nothing uploaded."} />
          {Platform.OS !== "web" ? <AccessRow icon="Bell" title="Reminders" body="A gentle nudge to keep your streak going. At most one a day, and you can change it in Settings." /> : null}
        </View>
        {accessError ? <Text accessibilityRole="alert" className="text-center text-body leading-6 text-destructive">{accessError}</Text> : null}
      </View>
    </OnboardingFrame>
  </>;

  if (step === "reveal") return <>{screen}
    <OnboardingFrame footer={<Button large onPress={() => setStep("planning")}>Continue</Button>}>
      <View className="gap-4">
        <Text accessibilityRole="header" className="text-center text-h2 text-muted-foreground">Your library is ready!</Text>
        <LibraryReveal years={years} total={app.stats.total} photosCount={app.stats.photos} videos={app.stats.videos} />
        <Text className="text-center text-caption leading-5 text-muted-foreground">{app.permission?.limited ? "These are the items you’ve allowed Pictopia to access. You can change access in Settings." : "These are the items Pictopia can access, including screenshots."}</Text>
        {Platform.OS === "ios" ? <Text className="text-center text-caption leading-5 text-muted-foreground">Hidden items, extra burst shots, shared albums and computer-synced items aren’t included in this view.</Text> : null}
      </View>
    </OnboardingFrame>
  </>;

  if (step === "planning") return <>{screen}
    <OnboardingFrame footer={<View className="h-14" />}>
      <Planning ready={pick !== undefined} total={app.stats.total} onDone={() => setStep(app.pro ? "ready" : "trial")} />
    </OnboardingFrame>
  </>;

  if (step === "trial") return <>{screen}<TrialOffer onDone={() => setStep("ready")} /></>;

  return <>{screen}
    <OnboardingFrame footer={pick ? <>
      <Button large disabled={opening} icon="ArrowRight" onPress={() => void startFirst()}>{opening ? "Opening…" : "Start"}</Button>
      <QuietAction onPress={() => void finish()}>Look around first</QuietAction>
    </> : <Button large onPress={() => void finish()}>Go to Home</Button>}>
      <View className="items-center gap-6">
        <View className="items-center gap-2">
          <Text accessibilityRole="header" className="text-center text-display text-foreground">{pick ? "Your first adventure is ready" : "You’re all set"}</Text>
          <Text className="text-center text-body leading-6 text-muted-foreground">{TAGLINE}.</Text>
        </View>
        {pick ? (
          <View className="w-64">
            <Postcard kind={pick.adventure.kind} ids={pick.session.ids} title={adventureName(pick.adventure.kind)} hint={pick.adventure.hint.detail} rotate={-2} variant="pick" onPress={() => void startFirst()} />
          </View>
        ) : null}
      </View>
    </OnboardingFrame>
  </>;
}
