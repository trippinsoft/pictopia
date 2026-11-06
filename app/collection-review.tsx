import { useCallback, useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { AdventureReview } from "@/components/pictopia/adventure-review";
import { AdventureFinish } from "@/components/pictopia/adventure-finish";
import { Button, Icon, Loading, Page, Text } from "@/components/pictopia/ui";
import { usePictopia } from "@/components/pictopia/provider";
import { moreCollectionLabel } from "@/lib/pictopia/review-flow";
import { collectionStore, collectionTitle, currentBatch, isPhotoCollection, type CollectionReview, type PhotoCollection } from "@/services/collections";

type Summary = Awaited<ReturnType<typeof collectionStore.summary>>;

/** A collection (a month, year, album or folder, videos…) in the shared review, in stretches
 * of up to 120. "Keep going" opens the next stretch; Finish shows the collection's progress. */
export default function CollectionRoute() {
  const { scope, title } = useLocalSearchParams<{ scope?: string; title?: string }>();
  const app = usePictopia();
  const [state, setState] = useState<CollectionReview>();
  const [summary, setSummary] = useState<Summary>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const valid = typeof scope === "string" && isPhotoCollection(scope);
  const open = useCallback(async () => {
    if (!valid || !app.ready) return;
    setError(undefined);
    try {
      const opened = await collectionStore.open(scope, typeof title === "string" ? title : undefined);
      setSummary(await collectionStore.summary(scope).catch(() => undefined));
      setState(opened);
    } catch { setError("This collection couldn’t be opened. Your saved place is safe."); }
  }, [valid, scope, title, app.ready]);
  useEffect(() => { void open(); }, [open]);
  async function next(all = false) {
    if (!valid || busy) return;
    setBusy(true); setError(undefined);
    try {
      const value = await collectionStore.next(scope, all);
      if (value && currentBatch(value).sessionKey !== (state && currentBatch(state).sessionKey)) {
        setSummary(await collectionStore.summary(scope).catch(() => undefined));
        setState(value);
      } else setError("No more photos to show right now. Some may be marked or temporarily unavailable.");
    } catch { setError("The next photos couldn’t be opened. Please try again."); }
    finally { setBusy(false); }
  }
  if (!valid) return <Page fallback="/(tabs)/explore" title="Photo collection"><Text className="text-body text-muted-foreground">This collection is unavailable.</Text><Button onPress={() => router.replace("/(tabs)/explore")}>Explore</Button></Page>;
  const name = collectionTitle(scope, state?.title ?? (typeof title === "string" ? title : undefined));
  if (!state || state.scope !== scope) return <Page fallback="/(tabs)/explore" title={name}>{error ? <><Text className="mb-5 text-body text-destructive">{error}</Text><Button onPress={() => void open()}>Try again</Button></> : <Loading />}</Page>;
  const batch = currentBatch(state);
  const more = !!summary && summary.remaining > 0;
  return <AdventureReview key={batch.sessionKey} id={scope} collection={{ sessionKey: batch.sessionKey, title: name, progress: summary }} onContinue={more ? () => void next() : undefined}
    finishContent={actions => <CollectionFinish {...actions} scope={scope} name={name} busy={busy} error={error} onNext={more ? () => void next() : undefined} onAll={() => void next(true)} />} />;
}

function CollectionFinish({ scope, name, busy, error, onNext, onAll, ...actions }: Parameters<NonNullable<Parameters<typeof AdventureReview>[0]["finishContent"]>>[0] & { scope: PhotoCollection; name: string; busy: boolean; error?: string; onNext?: () => void; onAll(): void }) {
  const [summary, setSummary] = useState<Summary>();
  useEffect(() => {
    let alive = true;
    void collectionStore.summary(scope).then(value => { if (alive) setSummary(value); }).catch(() => {});
    return () => { alive = false; };
  }, [scope]);
  const complete = !!summary?.total && summary.remaining === 0;
  const headline = complete ? `${name}, fully explored` : "This batch is reviewed";
  return <>
    <AdventureFinish
      title={name}
      headlineOverride={headline}
      art={<View className="h-48 w-full items-center justify-center bg-card">
        <View className={`h-24 w-24 items-center justify-center rounded-full ${complete ? "bg-grass" : "bg-sun"}`}>
          <Icon name={complete ? "Check" : "Images"} size={44} className={complete ? "text-white" : "text-foreground"} />
        </View>
      </View>}
      explored={actions.explored}
      marked={actions.marked}
      unavailable={actions.unavailable}
      libraryBefore={actions.libraryBefore}
      canUndo={actions.canUndo}
      pending={actions.pending || busy}
      more={onNext ? { label: moreCollectionLabel(scope), busy, onPress: onNext } : complete ? { label: "Browse them all again", busy, onPress: onAll } : undefined}
      onReview={actions.onReview}
      onDone={actions.onDone}
      onUndo={actions.onUndo}
      onPrevious={actions.onPreviousPhoto}
    />
    {!!error && <Text accessibilityRole="alert" className="absolute left-6 right-6 top-6 rounded-2xl bg-card p-3 text-body text-destructive">{error}</Text>}
  </>;
}
