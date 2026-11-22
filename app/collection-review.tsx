import { useCallback, useEffect, useRef, useState } from "react";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { AdventureReview, type FinishActions } from "@/components/pictopia/adventure-review";
import { AdventureFinish } from "@/components/pictopia/adventure-finish";
import { Button, Loading, Page, Text } from "@/components/pictopia/ui";
import { usePictopia } from "@/components/pictopia/provider";
import { moreCollectionLabel } from "@/lib/pictopia/review-flow";
import { canReviewAgain, collectionStore, collectionTitle, currentBatch, hasPreviousCollectionGroup, isPhotoCollection, type CollectionGroup, type CollectionReview, type PhotoCollection } from "@/services/collections";

type Summary = Awaited<ReturnType<typeof collectionStore.summary>>;

export default function CollectionRoute() {
  const { scope, title } = useLocalSearchParams<{ scope?: string; title?: string }>();
  const app = usePictopia();
  const [state, setState] = useState<CollectionReview>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [previousGroup, setPreviousGroup] = useState<{ key: string; count: number }>();
  const opening = useRef(false);
  const valid = typeof scope === "string" && isPhotoCollection(scope);
  const requiresPlus = scope === "screenshots" || scope === "videos" || scope === "videos-large";
  const allowed = !requiresPlus || app.pro;
  const open = useCallback(async () => {
    if (!valid || !app.ready || !allowed || opening.current) return;
    opening.current = true;
    setError(undefined);
    try {
      setState(await collectionStore.open(scope, typeof title === "string" ? title : undefined));
    } catch { setError("This collection couldn’t be opened. Your saved place is safe."); }
    finally { opening.current = false; }
  }, [valid, scope, title, app.ready, allowed]);
  useEffect(() => { void open(); }, [open]);
  useEffect(() => {
    if (!state || state.scope !== scope || !hasPreviousCollectionGroup(state)) return;
    let active = true;
    const key = currentBatch(state).sessionKey;
    void collectionStore.previousGroupCount(state).then(count => {
      if (active) setPreviousGroup({ key, count });
    }).catch(() => {});
    return () => { active = false; };
  }, [state, scope, app.revision]);

  async function moveGroup(direction: "next" | "previous", savePosition?: () => Promise<boolean>) {
    if (!valid || !state || opening.current) return;
    opening.current = true;
    setBusy(true);
    setError(undefined);
    try {
      if (savePosition && !await savePosition()) {
        setError("Couldn’t save your place. Please try again.");
        return;
      }
      const key = currentBatch(state).sessionKey;
      const value = direction === "previous"
        ? await collectionStore.previous(scope, key)
        : await collectionStore.next(scope, false, key);
      if (!value) {
        setPreviousGroup(undefined);
        setError("That group is no longer available.");
        return;
      }
      setState(value);
      if (currentBatch(value).sessionKey === key && !currentBatch(value).browse) setError("No more items are available right now. Try again after your library updates.");
    } catch { setError("This review couldn’t be opened. Please try again."); }
    finally { opening.current = false; setBusy(false); }
  }

  if (!valid) return <Page fallback="/(tabs)/explore" title="Photo collection"><Text className="text-body text-muted-foreground">This collection is unavailable.</Text><Button onPress={() => router.replace("/(tabs)/explore")}>Explore</Button></Page>;
  const name = collectionTitle(scope, state?.title ?? (typeof title === "string" ? title : undefined));
  if (!allowed && app.ready) return <Page fallback="/(tabs)/explore" title={name}><Text className="mb-4 text-body text-foreground">{name} is part of Pictopia+.</Text><Button onPress={() => router.push({ pathname: "/paywall", params: { entry: "Explore" } })}>See Pictopia+</Button></Page>;
  if (!state || state.scope !== scope) return <Page fallback="/(tabs)/explore" title={name}>{error ? <><Text className="mb-5 text-body text-destructive">{error}</Text><Button onPress={() => void open()}>Try again</Button></> : <Loading />}</Page>;

  const batch = currentBatch(state);
  const previousCount = previousGroup?.key === batch.sessionKey ? previousGroup.count : 0;
  const firstReviewOnly = canReviewAgain(scope);
  const isReplay = batch.replayStart !== undefined;
  return <AdventureReview key={batch.sessionKey} id={scope}
    collection={{ sessionKey: batch.sessionKey, title: name, firstReviewOnly, replay: isReplay, group: batch.group }}
    previousGroup={previousCount > 0 ? { count: previousCount, busy, onConfirm: savePosition => void moveGroup("previous", savePosition) } : undefined}
    showCompletionOnOpen={firstReviewOnly}
    reviewError={error}
    finishContent={actions => <CollectionFinish {...actions} scope={scope} name={name} busy={busy}
      error={error} firstReviewOnly={firstReviewOnly} allMode={batch.mode === "all"} hasNext={batch.hasMore}
      group={batch.group}
      onPreviousGroup={previousCount > 0 ? () => void moveGroup("previous") : undefined}
      onNext={() => void moveGroup("next")} />} />;
}

const completionMessage: Partial<Record<PhotoCollection, string>> = {
  "videos-large": "You’ve reviewed all your largest videos!",
  videos: "You’ve reviewed all your videos!",
  recent: "You’ve reviewed all your photos!",
  screenshots: "You’ve reviewed all your screenshots!",
};

function CollectionFinish({
  scope, name, busy, error, firstReviewOnly, allMode, hasNext, group, onPreviousGroup, onNext, ...actions
}: FinishActions & {
  scope: PhotoCollection; name: string; busy: boolean; error?: string;
  firstReviewOnly: boolean;
  allMode: boolean; hasNext?: boolean; group?: CollectionGroup;
  onPreviousGroup?(): void; onNext(): void;
}) {
  const app = usePictopia();
  const [summary, setSummary] = useState<Summary>();
  const [failed, setFailed] = useState(false), [retry, setRetry] = useState(0);
  useFocusEffect(useCallback(() => {
    if (group) return;
    let alive = true;
    void collectionStore.summary(scope).then(value => { if (alive) { setSummary(value); setFailed(false); } })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [scope, retry, app.revision, group]));

  if (!summary && !group) return <Page title={name} fallback="/(tabs)/explore">{failed ? <><Text className="text-body text-foreground">Couldn’t load your progress.</Text><Button onPress={() => { setFailed(false); setRetry(n => n + 1); }}>Try again</Button></> : <Loading />}</Page>;
  const complete = group ? group.count > 0 && !hasNext : !!summary?.total && summary.remaining === 0;
  const more = allMode ? hasNext : scope !== "recents" && !!summary?.remaining;
  const groupRange = group && group.count > 0
    ? `${(group.offset + 1).toLocaleString()}–${(group.offset + group.count).toLocaleString()} of ${group.total.toLocaleString()}`
    : undefined;
  return <AdventureFinish
    title={name}
    scope={{ complete, explored: summary?.explored ?? actions.explored, total: group?.total ?? summary?.total ?? 0 }}
    headingOverride={groupRange ? (complete ? "End of collection" : "Group complete") : undefined}
    headlineOverride={group ? groupRange : complete ? completionMessage[scope] : undefined}
    doneLabel={group && hasNext ? "Finish for now" : undefined}
    onPreviousGroup={onPreviousGroup}
    photoIds={actions.photoIds}
    discarded={actions.discarded}
    onBackToPhotos={actions.canReview ? actions.onBackToPhotos : undefined}
    onDeleteNow={actions.onDeleteNow}
    explored={actions.explored}
    marked={actions.marked}
    unavailable={actions.unavailable}
    libraryBefore={actions.libraryBefore}
    canUndo={actions.canUndo}
    pending={actions.pending || busy}
    more={more ? { label: group ? "Continue" : allMode ? "Review next batch" : firstReviewOnly ? "Continue Reviewing" : moreCollectionLabel(scope), busy, onPress: onNext } : undefined}
    moreAfterCompletion={allMode}
    reviewError={error}
    onReview={actions.onReview}
    onDone={actions.onDone}
    onUndo={actions.onUndo}
    onPrevious={actions.onPreviousPhoto}
  />;
}
