import { type ReactNode, useCallback, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, Stack, useFocusEffect } from "expo-router";
import { Button, Icon, Loading, Text } from "@/components/pictopia/ui";
import { AdventureRating } from "@/components/pictopia/adventure-rating";
import {
  adventureComplete,
  adventurePlace,
  type Adventure,
  type AdventureDiagnostics,
  type Dimension,
  type LabExperiment,
} from "@/lib/pictopia/adventures";
import { CURATION_WEIGHTS } from "@/lib/pictopia/curation";
import { adventureStore, type AdventureSlot } from "@/services/adventures";

type Lab = Awaited<ReturnType<typeof adventureStore.lab>>;
const EXPERIMENTS: { key: LabExperiment; letter: string; name: string; brief: string }[] = [
  {
    key: "detour",
    letter: "A",
    name: "The Unexpected Detour",
    brief: "About 15 photos across many years: controlled variety, minimal repetition.",
  },
  {
    key: "capsule",
    letter: "B",
    name: "A Little Time Capsule",
    brief: "15–20 photos from the strongest month cluster, chosen for coherence.",
  },
  {
    key: "corners",
    letter: "C",
    name: "The Hidden Corners",
    brief: "15–20 photos from less-explored months with real cleanup potential.",
  },
];
const DIMENSIONS = Object.keys(CURATION_WEIGHTS) as Dimension[];

/** Developer-only: real-photo experiments and why the engine chose what it chose. */
export default function AdventureLab() {
  const [lab, setLab] = useState<Lab>();
  const [home, setHome] = useState<AdventureSlot[]>();
  const [busy, setBusy] = useState<LabExperiment>(),
    [message, setMessage] = useState<string>();
  const load = useCallback(async () => {
    try {
      const [state, pair] = await Promise.all([adventureStore.lab(), adventureStore.home()]);
      setLab(state);
      setHome(pair.slots);
    } catch {
      setMessage("The Lab couldn’t read your Adventures just now.");
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  async function generate(key: LabExperiment) {
    if (busy) return;
    setBusy(key);
    setMessage(undefined);
    try {
      const made = await adventureStore.generateLab(key);
      if (!made) setMessage("Not enough eligible photos for that experiment yet.");
      await load();
    } catch {
      setMessage("That experiment couldn’t be generated. Please try again.");
    } finally {
      setBusy(undefined);
    }
  }
  async function open(id: string) {
    try {
      await adventureStore.open(id);
      router.push({ pathname: "/vertical-explore", params: { adventure: id } });
    } catch {
      setMessage("That experiment couldn’t be opened.");
    }
  }
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "bottom", "left", "right"]}>
      <Stack.Screen options={{ title: "Adventure Lab", headerShown: false }} />
      <ScrollView>
        <View className="mx-auto w-full max-w-xl px-5 pb-12 pt-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/settings"))}
            className="-ml-3 h-12 w-12 items-center justify-center"
          >
            <Icon name="ArrowLeft" size={22} className="text-foreground" />
          </Pressable>
          <Text className="text-caption uppercase tracking-[2px] text-primary">Developer only</Text>
          <Text accessibilityRole="header" className="mt-2 text-h1 text-foreground">
            Adventure Lab
          </Text>
          <Text className="mt-2 text-body leading-6 text-muted-foreground">
            Three experiments built from your real photos. Each stays frozen until you regenerate
            it. Progress counts toward your Journey; nothing is ever deleted here.
          </Text>
          {!!message && <Text className="mt-4 text-body text-destructive">{message}</Text>}
          {!lab ? (
            <View className="mt-10">
              <Loading />
            </View>
          ) : (
            <>
              {EXPERIMENTS.map(({ key, ...e }) => (
                <Experiment
                  key={key}
                  {...e}
                  slot={lab[key]}
                  busy={busy === key}
                  onGenerate={() => void generate(key)}
                  onOpen={(id) => void open(id)}
                  onRated={() => void load()}
                />
              ))}
              {!!home?.length && (
                <View className="mt-10">
                  <Text className="text-h3 text-foreground">Home’s current pair</Text>
                  <Text className="mt-1 text-caption text-muted-foreground">
                    What Pictopia is offering right now, and why.
                  </Text>
                  {home.map((slot, i) => (
                    <View key={slot.adventure.id} className="mt-4 rounded-3xl border border-border bg-card p-5">
                      <Text className="text-caption text-primary">{i ? "B" : "A"}</Text>
                      <Text className="text-h5 text-foreground">{slot.adventure.hint.title}</Text>
                      <Text className="text-body text-muted-foreground">{slot.adventure.hint.detail}</Text>
                      <Diagnostics adventure={slot.adventure} />
                    </View>
                  ))}
                </View>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Experiment({
  letter,
  name,
  brief,
  slot,
  busy,
  onGenerate,
  onOpen,
  onRated,
}: {
  letter: string;
  name: string;
  brief: string;
  slot?: Lab[LabExperiment];
  busy: boolean;
  onGenerate(): void;
  onOpen(id: string): void;
  onRated(): void;
}) {
  const place = slot && adventurePlace(slot.session);
  const status = !slot
    ? "Not generated yet"
    : adventureComplete(slot.session)
      ? "Finished"
      : slot.adventure.startedAt
        ? `In progress · ${place!.explored} of ${place!.total}`
        : `Ready · ${slot.adventure.count} photos`;
  return (
    <View className="mt-8 rounded-3xl border border-border bg-card p-5">
      <View className="flex-row items-baseline gap-3">
        <Text className="text-mark text-primary">{letter}</Text>
        <View className="flex-1">
          <Text className="text-h4 text-foreground">{name}</Text>
          <Text className="mt-1 text-caption text-muted-foreground">{brief}</Text>
        </View>
      </View>
      {slot && (
        <View className="mt-4 rounded-2xl bg-secondary p-4">
          <Text className="text-h5 text-foreground">{slot.adventure.hint.title}</Text>
          <Text className="mt-1 text-body text-muted-foreground">{slot.adventure.hint.detail}</Text>
        </View>
      )}
      <Text className="mt-3 text-caption text-muted-foreground">{status}</Text>
      <View className="mt-4 flex-row gap-3">
        {slot && (
          <View className="flex-1">
            <Button onPress={() => onOpen(slot.adventure.id)}>
              {slot.adventure.startedAt && !adventureComplete(slot.session) ? "Resume" : "Open"}
            </Button>
          </View>
        )}
        <View className="flex-1">
          <Button secondary={!!slot} disabled={busy} onPress={onGenerate}>
            {busy ? "Curating…" : slot ? "Regenerate" : "Generate"}
          </Button>
        </View>
      </View>
      {slot && <Diagnostics adventure={slot.adventure} />}
      {slot?.adventure.startedAt && (
        <View className="mt-5 border-t border-border pt-5">
          <Text className="mb-3 text-h6 text-foreground">Your ratings (optional)</Text>
          <AdventureRating adventure={slot.adventure} initial={slot.feedback} onSaved={onRated} />
        </View>
      )}
    </View>
  );
}

function Diagnostics({ adventure }: { adventure: Adventure }) {
  const [open, setOpen] = useState(false);
  const d: AdventureDiagnostics | undefined = adventure.diagnostics;
  if (!d)
    return (
      <Text className="mt-4 text-caption text-muted-foreground">
        Made before diagnostics were recorded.
      </Text>
    );
  return (
    <View className="mt-4">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((o) => !o)}
        className="min-h-11 flex-row items-center justify-between"
      >
        <Text className="text-h6 text-foreground">
          Diagnostics · score {Math.round(d.total * 100)}
        </Text>
        <Icon name={open ? "ChevronUp" : "ChevronDown"} size={18} className="text-muted-foreground" />
      </Pressable>
      {open && (
        <View className="gap-5 pt-2">
          <Section title="Why this Adventure">
            {[...d.why, ...(d.pairing ? [d.pairing] : [])].map((line) => (
              <Line key={line} text={line} />
            ))}
          </Section>
          <Section title="Score breakdown">
            {DIMENSIONS.map((dim) => (
              <View key={dim} className="gap-1">
                <View className="flex-row justify-between">
                  <Text className="text-caption text-foreground">
                    {dim[0].toUpperCase() + dim.slice(1)} · weight {Math.round(CURATION_WEIGHTS[dim] * 100)}%
                  </Text>
                  <Text className="text-caption text-foreground">{Math.round(d.scores[dim] * 100)}</Text>
                </View>
                <View className="h-1.5 overflow-hidden rounded-full bg-secondary">
                  <View
                    className="h-1.5 rounded-full bg-primary"
                    style={{ width: `${Math.round(d.scores[dim] * 100)}%` }}
                  />
                </View>
                <Text className="text-caption leading-5 text-muted-foreground">{d.reasons[dim]}</Text>
              </View>
            ))}
          </Section>
          <Section title="Why these photos">
            {d.selection.map((line) => (
              <Line key={line} text={line} />
            ))}
            <Line text={`Read ${d.pool} eligible photos for this candidate.`} />
          </Section>
          <Section title="Sequencing">
            <Line text={d.sequencing} />
          </Section>
          <Section title="Limitations and overlap">
            {[...d.limitations, d.overlap].map((line) => (
              <Line key={line} text={line} />
            ))}
          </Section>
          {!!d.alternatives?.length && (
            <Section title="Also considered">
              {d.alternatives.map((a) => (
                <Line key={`${a.title}${a.detail}`} text={`${a.title} — ${a.detail} · score ${Math.round(a.total * 100)}`} />
              ))}
            </Section>
          )}
        </View>
      )}
    </View>
  );
}
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-2">
      <Text className="text-caption uppercase tracking-[1.5px] text-muted-foreground">{title}</Text>
      {children}
    </View>
  );
}
function Line({ text }: { text: string }) {
  return <Text className="text-body leading-6 text-foreground">{text}</Text>;
}
