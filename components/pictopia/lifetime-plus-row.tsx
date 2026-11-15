import { useLifetimeTest } from "./use-lifetime-test";
import { lifetimeTestStore } from "@/services/lifetime-testing";
import { testAchievementVisible } from "@/lib/pictopia/lifetime-testing";
import { useEffect, useState } from "react";
import { AppState, Modal, Pressable, ScrollView, View } from "react-native";
import { Text, Icon, Button } from "./ui";
import { usePictopia } from "./provider";
import { useLibraryProgress } from "./use-library-progress";
import { useLift } from "./playful";
import { lifetimePlusStore } from "@/services/lifetime-plus";
import { isLifetimeAward, showLifetimeAchievement } from "@/lib/pictopia/lifetime-plus";
import { manageSubscription } from "@/lib/pictopia/links";

/** Current paid subscribers and already-earned lifetime members only. */
export function LifetimePlusRow() {
  const app = usePictopia();
  const simulation = useLifetimeTest();
  const { progress } = useLibraryProgress();
  const [membership, setMembership] = useState(lifetimePlusStore.snapshot);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [syncing, setSyncing] = useState(false);
  const lift = useLift();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    refresh();
    const expires = membership && !isLifetimeAward(membership)
      ? Math.min(membership.paidUntil ?? 0, membership.issuedAt + 15 * 60000) : 0;
    const timer = expires > Date.now() ? setTimeout(refresh, expires - Date.now() + 1) : undefined;
    const foreground = AppState.addEventListener("change", refresh);
    return () => { if (timer) clearTimeout(timer); foreground.remove(); };
  }, [membership]);
  useEffect(() => lifetimePlusStore.subscribe(() => setMembership(lifetimePlusStore.snapshot())), []);
  // In particular, app.pro and developer overrides are never evidence of payment.
  if (simulation ? !testAchievementVisible(simulation) : !membership || !showLifetimeAchievement(membership, now)) return null;
  const earned = simulation ? simulation.award === "earned" : isLifetimeAward(membership);
  const count = (progress?.accessible ?? 0) + (progress?.deleted ?? 0);
  const remaining = Math.max(0, (progress?.accessible ?? 0) - (progress?.accessibleExplored ?? 0));
  const full = !!simulation || app.permission?.granted === true && !app.permission.limited;
  const scanned = !!simulation || app.scan.status === "complete" && app.scan.skipped === 0;
  const awardedAt = simulation ? simulation.awardedAt : membership?.awardedAt;
  const date = earned && awardedAt ? new Date(awardedAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : null;
  async function check() {
    setSyncing(true); setError(undefined);
    try { if (simulation) { if (!lifetimeTestStore.complete()) setError("Test completion needs an active paid subscription, 100% progress and at least 10,000 photos."); } else await lifetimePlusStore.sync(); }
    catch (e) { setError((e as Error).message); }
    finally { setSyncing(false); }
  }
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={`Pictopia+ for Life. ${earned ? `Earned ${date}` : "View requirements and status"}`} onPress={() => setOpen(true)} style={lift}
      className="mt-3 min-h-11 flex-row items-center gap-2 self-center rounded-full bg-card py-2 pl-2.5 pr-4 active:opacity-80">
      <View className="h-7 w-7 items-center justify-center rounded-full bg-sun-soft"><Icon name={earned ? "Medal" : "Infinity"} size={16} className="text-foreground" /></View>
      <Text className="shrink text-h5 text-foreground">Pictopia+ for Life{earned ? " · Earned" : ""}</Text>
      <Icon name="ChevronRight" size={16} className="text-muted-foreground" />
    </Pressable>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View className="flex-1 items-center justify-center bg-black/60 px-5 py-12">
        <ScrollView className="max-h-full w-full max-w-md rounded-[24px] bg-card" contentContainerClassName="gap-4 p-5" accessibilityViewIsModal>
          <View className="items-center gap-2">
            <View className="h-16 w-16 items-center justify-center rounded-full bg-sun-soft"><Icon name={earned ? "Medal" : "Infinity"} size={32} className="text-foreground" /></View>
            <Text className="text-center text-h2 text-foreground">Pictopia+ for Life</Text>
            {date ? <Text className="text-center text-caption text-muted-foreground">Awarded {date}</Text> : null}
          </View>
          {simulation ? <Text className="text-caption text-primary">Simulated · no real award or billing changes</Text> : null}
          <Text className="text-body text-foreground">{earned ? "You earned permanent Pictopia+ access. Your award stays active when a subscription expires or is canceled." : "Complete The Big Picture with at least 10,000 distinct eligible photos while your paid Pictopia+ subscription is active. Any paid plan qualifies, and the lifetime award is free. Photos successfully deleted through Pictopia count too. A free trial alone does not qualify."}</Text>
          {!earned ? <View className="gap-2">
            <Text className="text-caption text-muted-foreground">Active paid subscription verified</Text>
            <Text className="text-caption text-muted-foreground">{count.toLocaleString()} library photos · {remaining.toLocaleString()} still unexplored</Text>
            <Text className="text-caption text-muted-foreground">Full photo-library access: {full ? "Allowed" : "Required"}</Text>
            <Text className="text-caption text-muted-foreground">Complete library scan: {scanned ? "Complete" : "Required, with no skipped items"}</Text>
            <Text className="text-caption text-muted-foreground">{simulation || app.libraryReliable ? "Lifetime access is awarded automatically after the completion check succeeds." : "Waiting for a reliable library refresh."}</Text>
          </View> : <>
            <Text accessibilityRole="alert" className="text-body text-foreground">Your paid subscription may still renew and is no longer needed for Pictopia+. This award does not cancel billing. Manage it with your store.</Text>
            <Button secondary disabled={!!simulation} onPress={() => { void manageSubscription(app.entitlement?.managementURL).catch(e => setError((e as Error).message)); }}>Manage subscription</Button>
          </>}
          <Text className="text-caption text-muted-foreground">Saved awards work offline on this installation. Same-store restoration depends on available purchase records; reinstall recovery cannot be guaranteed. Awards do not transfer between Apple and Google.</Text>
          {error ? <Text accessibilityRole="alert" className="text-caption text-destructive">{error}</Text> : null}
          {!earned ? <Button secondary disabled={syncing} onPress={() => void check()}>{syncing ? "Checking…" : "Check status"}</Button> : null}
          <Button onPress={() => setOpen(false)}>Done</Button>
        </ScrollView>
      </View>
    </Modal>
  </>;
}
