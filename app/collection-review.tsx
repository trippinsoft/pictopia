import { useCallback, useEffect, useRef, useState } from "react";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { AdventureReview, type FinishActions } from "@/components/pictopia/adventure-review";
import { AdventureFinish } from "@/components/pictopia/adventure-finish";
import { Button, Loading, Page, Text } from "@/components/pictopia/ui";
import { usePictopia } from "@/components/pictopia/provider";
import { moreCollectionLabel } from "@/lib/pictopia/review-flow";
import { canReviewAgain, collectionStore, collectionTitle, currentBatch, isPhotoCollection, type CollectionReview, type PhotoCollection } from "@/services/collections";

type Summary = Awaited<ReturnType<typeof collectionStore.summary>>;

export default function CollectionRoute() {
  const { scope, title } = useLocalSearchParams<{ scope?: string; title?: string }>();
  const app = usePictopia();
  const [state, setState] = useState<CollectionReview>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
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

  async function next() {
    if (!valid || !state || opening.current) return;
    opening.current = true;
    setBusy(true);
    setError(undefined);
    try {
      const key = currentBatch(state).sessionKey;
      const value = await collectionStore.next(scope, false, key);
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
  const firstReviewOnly = canReviewAgain(scope);
  const isReplay = batch.replayStart !== undefined;
  return <AdventureReview key={batch.sessionKey} id={scope}
    collection={{ sessionKey: batch.sessionKey, title: name, firstReviewOnly: firstReviewOnly, replay: isReplay }}
    showCompletionOnOpen={firstReviewOnly}
    reviewError={error}
    finishContent={actions => <CollectionFinish {...actions} scope={scope} name={name} busy={busy}
      error={error} firstReviewOnly={firstReviewOnly} allMode={batch.mode === "all"} hasNext={batch.hasMore}
      onNext={() => void next()} />} />;
}

const completionMessage: Partial<Record<PhotoCollection, string>> = {
  "videos-large": "You’ve reviewed all your largest videos!",
  videos: "You’ve reviewed all your videos!",
  recent: "You’ve reviewed all your photos!",
  screenshots: "You’ve reviewed all your screenshots!",
};

function CollectionFinish({
  scope, name, busy, error, firstReviewOnly, allMode, hasNext, onNext, ...actions
}: FinishActions & {
  scope: PhotoCollection; name: string; busy: boolean; error?: string;
  firstReviewOnly: boolean;
  allMode: boolean; hasNext?: boolean; onNext(): void;
}) {
  const app = usePictopia();
  const [summary, setSummary] = useState<Summary>();
  const [failed, setFailed] = useState(false), [retry, setRetry] = useState(0);
  useFocusEffect(useCallback(() => {
    let alive = true;
    void collectionStore.summary(scope).then(value => { if (alive) { setSummary(value); setFailed(false); } })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [scope, retry, app.revision]));

  if (!summary) return <Page title={name} fallback="/(tabs)/explore">{failed ? <><Text className="text-body text-foreground">Couldn’t load your progress.</Text><Button onPress={() => { setFailed(false); setRetry(n => n + 1); }}>Try again</Button></> : <Loading />}</Page>;
  const complete = summary.total > 0 && summary.remaining === 0;
  const more = allMode ? hasNext : scope !== "recents" && summary.remaining > 0;
  return <AdventureFinish
    title={name}
    scope={{ complete, explored: summary.explored, total: summary.total }}
    headlineOverride={complete ? completionMessage[scope] : undefined}
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
    more={more ? { label: allMode ? "Review next batch" : firstReviewOnly ? "Continue Reviewing" : moreCollectionLabel(scope), busy, onPress: onNext } : undefined}
    moreAfterCompletion={allMode}
    reviewError={error}
    onReview={actions.onReview}
    onDone={actions.onDone}
    onUndo={actions.onUndo}
    onPrevious={actions.onPreviousPhoto}
  />;
}
