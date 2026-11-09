import { useCallback, useRef, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { HomeContent } from "@/components/pictopia/home-content";
import { useAdventures } from "@/components/pictopia/use-adventures";
import type { StreakState } from "@/lib/pictopia/daily";
import { useLibraryProgress } from "@/components/pictopia/use-library-progress";
import { usePictopia } from "@/components/pictopia/provider";
import { dailyStore } from "@/services/daily";
import { adventureStore } from "@/services/adventures";
import { bytes } from "@/lib/pictopia/logic";

/** Home: streak + library progress sticker, Pictopia's pick (plus one "or try"), a Did you
 * know? tip, and a Discarded pill when anything is waiting. No separate Continue card: an
 * unfinished adventure shows up as Pictopia's pick when it's the best next step. */
export default function Home() {
  const app = usePictopia();
  const { app: adv, slots, error, hasPhotos, reload } = useAdventures();
  const { percent } = useLibraryProgress();
  const [streak, setStreak] = useState<StreakState>();
  const [opening, setOpening] = useState(false);
  const [message, setMessage] = useState<string>();
  const [retry, setRetry] = useState(0);
  const lock = useRef(false);
  useFocusEffect(useCallback(() => {
    let alive = true;
    void dailyStore.streak().then((s) => { if (alive) setStreak(s); }).catch(() => {});
    return () => { alive = false; };
  }, [retry]));
  async function run(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setOpening(true);
    setMessage(undefined);
    try { await work(); }
    catch (e) { setMessage(e instanceof Error ? e.message : "That couldn’t be opened. Please try again."); }
    finally { lock.current = false; setOpening(false); }
  }
  async function openAdventure(id: string) {
    // Home's picks are fully-formed adventures — including The Yearbook, where Pictopia has
    // already chosen the year — so open them straight into the review. No picker, no up-front
    // choice (see the "guide, not menu" principle).
    await adventureStore.open(id, adv.pro);
    router.push({ pathname: "/vertical-explore", params: { adventure: id } });
  }
  const pendingBytes = app.stats.pendingBytes;
  return <HomeContent
    percent={percent}
    streak={streak}
    pending={adv.stats.pending}
    pendingSize={pendingBytes > 0 ? bytes(pendingBytes) : undefined}
    ready={adv.ready && (!hasPhotos || !!slots)} hasPhotos={hasPhotos} busy={opening || adv.busy} connecting={opening || adv.busy}
    features={slots?.map(slot => ({ id: slot.adventure.id, kind: slot.adventure.kind, hint: slot.adventure.hint.detail, ids: slot.session.ids }))}
    error={message ?? adv.error ?? undefined} adventureError={error}
    onConnect={() => void run(() => adv.connect().then(() => undefined))}
    onAdventure={id => void run(() => openAdventure(id))}
    onStreak={() => router.push("/(tabs)/progress")}
    onProgress={() => router.push("/(tabs)/progress")}
    onPending={() => router.push("/queue")}
    onRetry={() => { setRetry(n => n + 1); void reload(); }}
  />;
}
