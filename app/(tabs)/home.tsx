import { useCallback, useRef, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { HomeContent, type HomeResume } from "@/components/pictopia/home-content";
import { useAdventures } from "@/components/pictopia/use-adventures";
import { adventureComplete, adventurePlace, meaningfulReview } from "@/lib/pictopia/adventures";
import { adventureLabel, catalogEntry } from "@/lib/pictopia/catalog";
import type { StreakState } from "@/lib/pictopia/daily";
import { useLibraryProgress } from "@/components/pictopia/use-library-progress";
import { collectionQuery, collectionStore, collectionTitle, type CollectionReview } from "@/services/collections";
import { storage } from "@/services/repository";
import { dailyStore } from "@/services/daily";
import { adventureStore, type AdventureSlot } from "@/services/adventures";
import type { Media } from "@/lib/pictopia/types";

/** Home: streak and progress, one Continue, two adventures, and pending deletions when any.
 * The retired one-at-a-time Swipe flow is no longer offered; its saved data is untouched. */
export default function Home() {
  const { app, slots, error, hasPhotos, reload, refresh } = useAdventures();
  const { percent } = useLibraryProgress();
  const [collection, setCollection] = useState<CollectionReview>();
  const [collectionCover, setCollectionCover] = useState<Media>();
  const [adventureActivity, setAdventureActivity] = useState<Record<string, number>>({});
  const [parked, setParked] = useState<AdventureSlot[]>([]);
  const [streak, setStreak] = useState<StreakState>();
  const [opening, setOpening] = useState(false);
  const [message, setMessage] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [resumeError, setResumeError] = useState<string>();
  const [retry, setRetry] = useState(0);
  const lock = useRef(false);
  useFocusEffect(useCallback(() => {
    let alive = true;
    void dailyStore.streak().then((s) => { if (alive) setStreak(s); }).catch(() => {});
    if (!hasPhotos) return () => { alive = false; };
    void Promise.all([adventureStore.unfinished(), collectionStore.latest()]).then(async ([value, latest]) => {
      const activities = Object.fromEntries(await Promise.all(value.map(async slot => [slot.adventure.id, (await storage.getValue<number>(`activity:adventure:${slot.adventure.id}:explore`)) ?? slot.adventure.openedAt ?? slot.adventure.startedAt ?? 0])));
      const cover = latest ? (await storage.query({ ...collectionQuery(latest.scope), limit: 1 }))[0] : undefined;
      if (!alive) return;
      setCollection(latest); setCollectionCover(cover); setAdventureActivity(activities); setParked(value); setResumeError(undefined);
    }).catch(() => { if (alive) setResumeError("Saved adventures couldn’t be loaded."); });
    return () => { alive = false; };
  }, [hasPhotos, app.revision, retry]));
  const lastActive = (slot: AdventureSlot) => Math.max(adventureActivity[slot.adventure.id] ?? 0, slot.adventure.openedAt ?? slot.adventure.startedAt ?? 0);
  const unfinished = [...(slots ?? []), ...parked]
    .filter(slot => slot.adventure.startedAt && !adventureComplete(slot.session) && meaningfulReview(slot.session))
    .sort((a, b) => lastActive(b) - lastActive(a))[0];
  const resumeCollection = !!collection && (!unfinished || collection.openedAt >= lastActive(unfinished));
  const place = unfinished ? adventurePlace(unfinished.session) : undefined;
  const resume: HomeResume | undefined = resumeCollection && collection
    ? { title: collectionTitle(collection.scope, collection.title), detail: "Resume your review", media: collectionCover }
    : unfinished && place
      ? { title: `${adventureLabel(unfinished.adventure)} · ${Math.max(1, unfinished.session.ids.indexOf(unfinished.session.activeId ?? "") + 1)} of ${place.total}`, detail: "Resume your review", kind: unfinished.adventure.kind }
      : undefined;
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
    await adventureStore.open(id);
    router.push({ pathname: "/vertical-explore", params: { adventure: id } });
  }
  async function resumeLatest() {
    if (resumeCollection && collection) { router.push({ pathname: "/collection-review", params: { scope: collection.scope } }); return; }
    if (unfinished) await openAdventure(unfinished.adventure.id);
  }
  return <HomeContent
    percent={percent}
    streak={streak}
    pending={app.stats.pending}
    ready={app.ready} hasPhotos={hasPhotos} busy={opening || app.busy} connecting={opening || app.busy}
    resume={resume}
    features={slots?.map(slot => ({ id: slot.adventure.id, kind: slot.adventure.kind, hint: slot.adventure.kind === "year" || slot.adventure.kind === "month" ? catalogEntry("time-machine").blurb : slot.adventure.hint.detail, ids: slot.session.ids }))}
    error={message ?? app.error ?? undefined} adventureError={resumeError ?? error}
    onConnect={() => void run(() => app.connect().then(() => undefined))}
    onResume={() => void run(resumeLatest)}
    onAdventure={id => {
      const adventure = slots?.find(slot => slot.adventure.id === id)?.adventure;
      if (adventure?.kind === "year" || adventure?.kind === "month") router.push("/time-machine");
      else void run(() => openAdventure(id));
    }}
    notice={notice}
    shuffling={opening}
    onShuffle={() => void run(async () => {
      setNotice(undefined);
      const result = await refresh();
      if (result === "busy") setNotice("Still preparing your adventures. Try again in a moment.");
      else if (result === "unchanged") setNotice("These two are the freshest picks right now. Explore has more ways in.");
      else if (result === "error") setMessage("New adventures couldn’t be prepared just now. Please try again.");
    })}
    onStreak={() => router.push("/(tabs)/progress")}
    onProgress={() => router.push("/(tabs)/progress")}
    onPending={() => router.push("/queue")}
    onRetry={() => { setRetry(n => n + 1); void reload(); }}
  />;
}
