import { useEffect, useState } from "react";
import { AppState, Modal, ScrollView, View } from "react-native";
import { usePathname } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { BADGES, ROMAN } from "@/lib/pictopia/badges";
import { badgeStore, type BadgeCelebration } from "@/services/badges";
import { BadgeArt } from "./badge-art";
import { Button, Text } from "./ui";
import { usePictopia } from "./provider";

/** Saved awards survive navigation and restart until the user acknowledges them. */
export function BadgeCelebrationHost() {
  const { ready, libraryReliable, revision } = usePictopia();
  const path = usePathname();
  const [awards, setAwards] = useState<BadgeCelebration[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!ready) return;
    let alive = true, request = 0;
    const read = () => {
      const token = ++request;
      void badgeStore.pendingCelebrations().then(value => {
        if (alive && token === request) setAwards(value);
      }).catch(() => {});
    };
    const unsubscribe = badgeStore.subscribeCelebrations(read);
    const foreground = AppState.addEventListener("change", state => { if (state === "active") read(); });
    read();
    return () => { alive = false; unsubscribe(); foreground.remove(); };
  }, [ready]);
  useEffect(() => {
    if (!ready || !libraryReliable) return;
    // Reviews evaluate at completion. Elsewhere evaluate after saved activity settles.
    if (path === "/vertical-explore" || path === "/collection-review" || path === "/onboarding") return;
    const evaluate = () => { void badgeStore.evaluate().catch(() => {}); };
    const timer = setTimeout(evaluate, 400);
    const foreground = AppState.addEventListener("change", state => { if (state === "active") evaluate(); });
    return () => { clearTimeout(timer); foreground.remove(); };
  }, [ready, libraryReliable, revision, path]);
  const award = awards[0];
  const definition = BADGES.find(item => item.family === award?.family);
  const dismiss = async () => {
    if (!award || saving) return;
    setSaving(true); setError(false);
    try {
      await badgeStore.dismissCelebration(award);
      setAwards(await badgeStore.pendingCelebrations());
    } catch { setError(true); }
    finally { setSaving(false); }
  };
  if (!award || !definition) return null;
  return <Modal visible transparent animationType="none" onRequestClose={() => void dismiss()}>
    <SafeAreaView className="flex-1 items-center justify-center bg-background/95 px-6">
      <ScrollView className="w-full max-w-md" contentContainerClassName="flex-grow items-center justify-center py-8">
        <View className="w-full items-center gap-5 rounded-[28px] bg-card p-6">
          <Text accessibilityRole="header" accessibilityLiveRegion="polite" className="text-center text-h2 text-foreground">You earned a badge!</Text>
          <BadgeArt family={award.family} tier={award.tier} size={160} />
          <View className="gap-2">
            <Text className="text-center text-h1 text-foreground">{`${definition.name} ${ROMAN[award.tier] ?? ""}`}</Text>
            <Text className="text-center text-body text-muted-foreground">{definition.unit(definition.tiers[award.tier - 1])}</Text>
          </View>
          {!!error && <Text accessibilityRole="alert" className="text-center text-caption text-destructive">Couldn’t save your acknowledgment. Please try again.</Text>}
          <View className="w-full"><Button large disabled={saving} onPress={() => void dismiss()}>{awards.length > 1 ? "Next badge" : "Done"}</Button></View>
        </View>
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}
