import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { AppState, Linking, Platform, View } from "react-native";
import { router, Stack } from "expo-router";
import { Button, Icon, Text } from "@/components/pictopia/ui";
import { usePictopia } from "@/components/pictopia/provider";
import { OrBadge, Postcard } from "@/components/pictopia/playful";
import { Welcome } from "@/components/pictopia/onboarding/welcome";
import { OnboardingFrame, QuietAction } from "@/components/pictopia/onboarding/frame";
import { ScrollDemo, SpaceDemo, SwipeDemo } from "@/components/pictopia/onboarding/demos";
import { LibraryReveal } from "@/components/pictopia/onboarding/reveal";
import { Planning } from "@/components/pictopia/onboarding/planning";
import { TrialOffer, type OfferStep } from "@/components/pictopia/onboarding/trial";
import { ConfettiBurst, Sunrays } from "@/components/pictopia/onboarding/celebrate";
import { adventureName } from "@/lib/pictopia/catalog";
import { STORY_STEPS, yearTotals, type OnboardingStep } from "@/lib/pictopia/onboarding";
import type { IconName } from "@/lib/icons/LucideIcon";
import { adventureStore, type AdventureSlot } from "@/services/adventures";
import { notificationService } from "@/services/notifications";
import { storage } from "@/services/repository";
import { homeTourStore } from "@/services/home-tour";
import { mediaService } from "@/services/media";
import { trackOnboarding } from "@/services/analytics";
import { ONBOARDING_STEPS, librarySizeBucket, stepSeconds, type OnboardingStepName } from "@/lib/pictopia/onboarding-analytics";

const STORY: Record<"scroll" | "swipe" | "space", { kicker?: string; title: string; body: string; demo: () => ReactElement }> = {
  scroll: { kicker: "There’s a better way", title: "Scroll your photos. Swipe the clutter.", body: "Enjoy your memories one after another, like a feed.", demo: ScrollDemo },
  swipe: { title: "Swipe away what you don’t need", body: "Nothing is deleted until you say so.", demo: SwipeDemo },
  space: { title: "Watch the space add up", body: "Delete in one go, free up space, and earn streaks and badges.", demo: SpaceDemo },
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

/** First launch: the problem → three-step story → photo/reminder access → the user's own library
 * reveal → picking two adventures → Pictopia+ offer → "Your Pictopia is ready!" → Home, where a
 * short tour points out the adventures, Timeline and Explore. No questions: Pictopia picks. */
export default function Onboarding() {
  const app = usePictopia();
  const replay = app.devTools && app.prefs.replayOnboarding === true;
  const canReuseLibrary = !!app.permission?.granted && app.libraryReliable && app.stats.total > 0;
  // Someone who already gave access (e.g. reopened mid-way) continues from the reveal.
  const [step, setStep] = useState<OnboardingStep>(() => !replay && canReuseLibrary ? "reveal" : "welcome");
  const [connecting, setConnecting] = useState(false);
  const [accessError, setAccessError] = useState<string>();
  // Home's own two recommendations, prepared (and saved) by the same logic Home uses.
  const [slots, setSlots] = useState<AdventureSlot[] | null>();
  const [leaving, setLeaving] = useState(false);
  const years = useMemo(() => yearTotals(app.months), [app.months]);
  const [purchased, setPurchased] = useState(false);

  // Funnel analytics: each step's view, and the time spent on the one before it.
  const current = useRef<{ name: OnboardingStepName; at: number } | undefined>(undefined);
  const viewStep = useCallback((name: OnboardingStepName) => {
    const previous = current.current;
    if (previous?.name === name) return;
    if (previous) trackOnboarding("onboarding_step_completed", { step: previous.name, index: ONBOARDING_STEPS.indexOf(previous.name), seconds: stepSeconds(previous.at, Date.now()) });
    current.current = { name, at: Date.now() };
    trackOnboarding("onboarding_step_viewed", { step: name, index: ONBOARDING_STEPS.indexOf(name) });
  }, []);
  useEffect(() => {
    trackOnboarding("onboarding_started", { replay, resumed: step !== "welcome" });
    const sub = AppState.addEventListener("change", state => {
      if (state === "background" && current.current) trackOnboarding("onboarding_backgrounded", { step: current.current.name, index: ONBOARDING_STEPS.indexOf(current.current.name) });
    });
    return () => sub.remove();
    // Once per visit to onboarding.
  }, []);
  useEffect(() => {
    // The offer reports its own parts (showcase, reminder, plans) through `onStep`.
    if (step !== "trial") viewStep(step === "welcome" ? "problem" : step);
  }, [step, viewStep]);
  const onOfferStep = useCallback((s: OfferStep) => viewStep(s), [viewStep]);

  // Everyone finishes on Home, where the tour introduces the three ways in.
  const finish = useCallback(async () => {
    if (leaving) return;
    setLeaving(true);
    const last = current.current;
    if (last) trackOnboarding("onboarding_step_completed", { step: last.name, index: ONBOARDING_STEPS.indexOf(last.name), seconds: stepSeconds(last.at, Date.now()) });
    trackOnboarding("onboarding_completed", { outcome: "explore_home", pro: app.pro, purchased_in_onboarding: purchased, recommendations: slots?.length ?? 0 });
    await homeTourStore.start("onboarding").catch(() => {});
    await app.updatePrefs(replay ? { onboarded: true, replayOnboarding: false } : { onboarded: true });
    router.replace("/(tabs)/home");
  }, [app, replay, purchased, slots, leaving]);

  // Pictopia picks Home's two adventures while the planning screen plays. `home()` saves them,
  // and Home's next `home()` returns these same two rather than creating new ones.
  useEffect(() => {
    if (step !== "planning" || slots !== undefined) return;
    let alive = true;
    void adventureStore.home(Date.now(), app.pro).then(h => {
      if (!alive) return;
      setSlots(h.slots);
      trackOnboarding("onboarding_planning_result", { picked: h.slots.length > 0, recommendations: h.slots.length });
    }).catch(() => {
      if (!alive) return;
      setSlots(null);
      trackOnboarding("onboarding_planning_result", { picked: false, recommendations: 0 });
    });
    return () => { alive = false; };
  }, [step, slots]);

  async function allowAccess() {
    if (replay && canReuseLibrary) {
      setStep("reveal");
      return;
    }
    setConnecting(true);
    setAccessError(undefined);
    try {
      const connected = await app.connect();
      const total = connected ? (await storage.stats()).total : 0;
      const access = await mediaService.permission().catch(() => null);
      const result = !connected ? (access && !access.granted ? "denied" : "error") : !total ? "empty" : access?.limited ? "limited" : "full";
      if (!connected || !total) {
        trackOnboarding("onboarding_access_result", { access: result, library_size: librarySizeBucket(total) });
        setAccessError(!connected ? "Your library isn’t ready yet. Check photo access and try again; incomplete counts won’t be shown as final." : Platform.OS === "web" ? "No photos were chosen. Choose some photos and videos to begin." : "Pictopia needs access to your photos to show them to you. You can allow it in Settings.");
        return;
      }
      const reminders = await notificationService.request().catch(() => undefined);
      trackOnboarding("onboarding_access_result", { access: result, library_size: librarySizeBucket(total), notifications: reminders === "granted" });
      setStep("reveal");
    } finally {
      setConnecting(false);
    }
  }

  const screen = <Stack.Screen options={{ title: "Welcome to Pictopia", headerShown: false, gestureEnabled: false }} />;

  if (step === "welcome") return <>{screen}
    <Welcome onStart={() => setStep("scroll")} />
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
            {story.kicker ? <Text className="text-center text-h4 text-tomato">{story.kicker}</Text> : null}
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
        {connecting ? (app.syncProgress ? `Getting to know your photos… ${app.syncProgress}` : "Opening your library…") : replay && canReuseLibrary ? "Continue with current access" : Platform.OS === "web" ? "Choose photos & videos" : "Allow access"}
      </Button>
      {accessError && Platform.OS !== "web" ? <QuietAction onPress={() => void Linking.openSettings()}>Open Settings</QuietAction> : null}
    </>}>
      <View className="gap-7">
        <Text accessibilityRole="header" className="text-center text-h1 text-foreground">Let’s meet your photos</Text>
        <View className="gap-5">
          <AccessRow icon="Images" title="Your photos" body={Platform.OS === "web" ? "Choose photos and videos from this device. Nothing is uploaded, and originals are never deleted here." : "So Pictopia can show you your memories. They stay on your phone: no account, nothing uploaded."} />
          {Platform.OS !== "web" ? <AccessRow icon="Bell" title="Reminders" body="A gentle nudge to keep your streak going. You can manage reminders in Settings." /> : null}
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
      <Planning ready={slots !== undefined} picked={slots?.length ?? 0} total={app.stats.total} onDone={() => setStep(replay || !app.pro ? "trial" : "ready")} />
    </OnboardingFrame>
  </>;

  if (step === "trial") return <>{screen}<TrialOffer onStep={onOfferStep} onDone={bought => { if (bought) setPurchased(true); setStep("ready"); }} /></>;

  const [first, second] = slots ?? [];
  return <>{screen}
    <OnboardingFrame footer={<Button large disabled={leaving} icon="ArrowRight" onPress={() => void finish()}>Let’s explore Pictopia</Button>}>
      <View className="items-center gap-6">
        <View className="items-center gap-2">
          {purchased ? (
            <View className="mb-1 flex-row items-center gap-1.5 rounded-full bg-sun px-4 py-2">
              <Icon name="Sparkles" size={16} className="text-sun-ink" />
              <Text className="text-h5 text-sun-ink">Pictopia+ unlocked</Text>
            </View>
          ) : null}
          <Text accessibilityRole="header" className="text-center text-display text-foreground">Your Pictopia is ready!</Text>
          <Text className="text-center text-body leading-6 text-muted-foreground">{readyLine(slots?.length ?? 0)}</Text>
        </View>
        {first ? (
          // The same pair Home will show, as a preview: Home is where they're opened.
          <View accessible accessibilityLabel={`Picked for you: ${[first, second].filter(Boolean).map(s => adventureName(s!.adventure.kind)).join(" and ")}`} className="w-full items-center justify-center">
            <View pointerEvents="none" className="absolute inset-0 items-center justify-center"><Sunrays size={440} /></View>
            <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" className={`relative flex-row items-start gap-2.5 ${second ? "w-full" : "w-64"}`}>
              <Postcard kind={first.adventure.kind} ids={first.session.ids} title={adventureName(first.adventure.kind)} hint={first.adventure.hint.detail} rotate={-3} variant="pick" onPress={noop} />
              {second ? <OrBadge /> : null}
              {second ? <Postcard kind={second.adventure.kind} ids={second.session.ids} title={adventureName(second.adventure.kind)} hint={second.adventure.hint.detail} rotate={3} variant="alt" onPress={noop} /> : null}
            </View>
            <View pointerEvents="none" className="absolute inset-0"><ConfettiBurst delay={200} /></View>
          </View>
        ) : null}
      </View>
    </OnboardingFrame>
  </>;
}

const noop = () => {};
/** The ready screen's promise matches what was actually prepared. */
function readyLine(picked: number) {
  return picked >= 2 ? "We’ve explored your library and picked two adventures just for you."
    : picked === 1 ? "We’ve explored your library and picked an adventure just for you."
    : "We’ve explored your library. Let’s take a look around.";
}
