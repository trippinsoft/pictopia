import { useLifetimeTest } from "./use-lifetime-test";
import { lifetimeTestStore } from "@/services/lifetime-testing";
import { useEffect, useState } from "react";
import { Modal, ScrollView, View } from "react-native";
import { Button, Icon, Text } from "./ui";
import { usePictopia } from "./provider";
import { lifetimePlusStore } from "@/services/lifetime-plus";
import { isLifetimeAward } from "@/lib/pictopia/lifetime-plus";
import { storage } from "@/services/repository";
import { manageSubscription } from "@/lib/pictopia/links";
const KEY = "lifetimePlusNotice:v1";
/** The acknowledgement is local UI state; it never grants access. */
export function LifetimeAwardNotice() {
  const app = usePictopia();
  const simulation = useLifetimeTest();
  const [award, setAward] = useState(lifetimePlusStore.snapshot);
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => lifetimePlusStore.subscribe(() => setAward(lifetimePlusStore.snapshot())), []);
  useEffect(() => {
    let active = true;
    setVisible(false);
    if (simulation) { setVisible(simulation.award === "earned" && !simulation.acknowledged); return; }
    if (isLifetimeAward(award)) void storage.getValue<number>(KEY).then(seen => {
      if (active && seen !== award?.awardedAt) setVisible(true);
    }).catch(() => { if (active) setVisible(true); });
    return () => { active = false; };
  }, [award, simulation]);
  async function done() {
    if (simulation) { lifetimeTestStore.acknowledge(); setVisible(false); return; }
    try { await storage.setValue(KEY, award?.awardedAt); setVisible(false); }
    catch { setError("Couldn’t save your acknowledgement. Your lifetime award is unchanged."); }
  }
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={() => void done()}>
    <View className="flex-1 items-center justify-center bg-black/60 px-5 py-12">
      <ScrollView className="max-h-full w-full max-w-md rounded-[24px] bg-card" contentContainerClassName="items-center gap-4 p-6" accessibilityViewIsModal>
        <View className="h-16 w-16 items-center justify-center rounded-full bg-sun-soft"><Icon name="Medal" size={32} className="text-foreground" /></View>
        <Text className="text-center text-h2 text-foreground">You earned Pictopia+ for Life</Text>
        <Text className="text-center text-body text-foreground">Your permanent access is active. Your paid subscription may still renew and is no longer needed. This award does not cancel billing.</Text>
        {simulation ? <Text className="text-center text-caption text-primary">Simulated award · nothing saved to your real membership</Text> : null}
        <Button secondary disabled={!!simulation} onPress={() => { void manageSubscription(app.entitlement?.managementURL).catch(e => setError((e as Error).message)); }}>Manage subscription</Button>
        {error ? <Text accessibilityRole="alert" className="text-caption text-destructive">{error}</Text> : null}
        <Button onPress={() => void done()}>Got it</Button>
      </ScrollView>
    </View>
  </Modal>;
}
