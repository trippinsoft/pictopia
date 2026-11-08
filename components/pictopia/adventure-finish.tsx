import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenHeader } from "./navigation-header";
import { MediaImage } from "./media-image";
import { Button, Loading, Text } from "./ui";
import type { Adventure } from "@/lib/pictopia/adventures";
import type { Media } from "@/lib/pictopia/types";
import { adventureLabel } from "@/lib/pictopia/catalog";
import { sizeText } from "@/lib/pictopia/review-flow";
import { displayMediaSize } from "@/lib/pictopia/storage-size";
import { plural } from "@/lib/pictopia/text";
import { adventureStore } from "@/services/adventures";
import { badgeStore } from "@/services/badges";

interface Props {
  adventure?: Adventure; title?: string; photoIds?: string[];
  explored: number; marked: number; unavailable: number; pending: boolean;
  scope?: { complete: boolean; explored: number; total: number };
  headlineOverride?: string; art?: ReactNode;
  more?: { label: string; busy?: boolean; onPress(): void };
  /** This review's discarded photos, for the stack and the size. */
  discarded?: Media[];
  onContinueSegment?(adventure: Adventure): void;
  /** Back into the feed, everything as it was left. */
  onBackToPhotos?(): void;
  /** Delete this review's discards now (the OS still asks first). */
  onDeleteNow?(): void;
  onDone(): void;
  // Older isolated prototype callers retain their interface.
  libraryBefore?: number; canUndo: boolean; onReview(): void; onUndo(): void; onPrevious(): void;
}
/** The end of an adventure: how much of the set was reviewed, what was kept and discarded,
 * and the discards themselves, ready to delete or look through. */
export function AdventureFinish({ adventure, title, photoIds, explored, marked, unavailable, pending, scope, more, discarded = [], onContinueSegment, onBackToPhotos, onDeleteNow, onReview, onDone }: Props) {
  const [facts, setFacts] = useState<Awaited<ReturnType<typeof adventureStore.segmentStatus>>>();
  const [ready, setReady] = useState(!adventure), [error, setError] = useState<string>();
  const [retry, setRetry] = useState(0), [busy, setBusy] = useState(false);
  const alive = useRef(true), locked = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    let live = true;
    if (!adventure) return;
    setReady(false); setError(undefined);
    void (async () => {
      const status = await adventureStore.segmentStatus(adventure.id);
      await adventureStore.finish(adventure.id);
      if (live) { setFacts(status); setReady(true); }
      // Preserve badge evaluation, without injecting extra celebrations or controls.
      void badgeStore.evaluate().catch(() => {});
    })().catch(() => { if (live) setError("Couldn’t load your progress. Your discarded photos are safe."); });
    return () => { live = false; };
  }, [adventure?.id, adventure?.segment, retry]);
  const continueReview = async () => {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(undefined);
    try {
      if (more) more.onPress();
      else if (adventure && onContinueSegment) {
        const next = await adventureStore.continue(adventure.id);
        if (alive.current) onContinueSegment(next);
      }
    } catch { if (alive.current) setError("The next photos couldn’t open. Please try again."); }
    finally { locked.current = false; if (alive.current) setBusy(false); }
  };
  const name = title ?? (adventure ? adventureLabel(adventure) : "Adventure");
  const complete = scope?.complete ?? facts?.complete ?? false;
  const total = photoIds?.length ?? scope?.total ?? 0;
  const reviewed = Math.min(explored, total || explored);
  const percent = total ? Math.floor((100 * reviewed) / total) : 100;
  const discardedCount = discarded.length || marked;
  const kept = Math.max(0, reviewed - discardedCount);
  const bytes = discarded.reduce((n, m) => n + displayMediaSize(m), 0);
  const hasMore = !complete && (!!more || (!!facts?.nextCount && !!onContinueSegment));
  const moreLabel = more?.label ?? (adventure?.kind === "screenshots" ? "Next sweep" : `Keep going: ${facts?.nextCount} more`);
  return <SafeAreaView edges={["top", "bottom", "left", "right"]} className="flex-1 bg-background">
    <View className="mx-auto w-full max-w-md px-5"><ScreenHeader title={name} onBack={onDone} /></View>
    {!ready ? <View className="flex-1 items-center justify-center gap-4 px-6">
      {error ? <><Text accessibilityRole="alert" className="text-center text-body text-muted-foreground">{error}</Text><Button onPress={() => setRetry(n => n + 1)}>Try again</Button><Button secondary onPress={onDone}>Finish for Now</Button></> : <Loading />}
    </View> : <ScrollView className="flex-1" contentContainerClassName="flex-grow">
      <View className="mx-auto w-full max-w-md flex-1 px-6 pb-6">
        <View className="flex-1 items-center justify-center py-8">
          {percent >= 100 && <Text accessibilityElementsHidden importantForAccessibility="no" className="text-[48px] leading-[56px]">🎉</Text>}
          <Text accessibilityRole="header" className="text-center text-display text-foreground" style={{ fontVariant: ["tabular-nums"] }}>{`${percent}% reviewed`}</Text>
          <Text className="mt-2 text-center text-body text-muted-foreground" style={{ fontVariant: ["tabular-nums"] }}>
            {discardedCount ? `${kept} kept · ${discardedCount} discarded${bytes > 0 ? ` (${sizeText(bytes)})` : ""}` : `${plural(kept, "photo")} kept`}
          </Text>
          {unavailable > 0 && <Text className="mt-2 text-center text-caption text-muted-foreground">{`${plural(unavailable, "photo")} couldn’t load · Try again later`}</Text>}
          {discarded.length > 0 && <DiscardStack items={discarded} onPress={onReview} />}
        </View>
        {!!error && <Text accessibilityRole="alert" className="mb-4 text-center text-body text-destructive">{error}</Text>}
        <View className="gap-3">
          {discardedCount > 0 && onDeleteNow && <Button large danger icon="Trash2" disabled={pending} onPress={onDeleteNow}>{`Delete ${discardedCount} now`}</Button>}
          {hasMore && <Button large secondary={discardedCount > 0} disabled={busy || pending || more?.busy} onPress={() => void continueReview()}>{busy || more?.busy ? "Opening photos…" : moreLabel}</Button>}
          <Button large secondary={discardedCount > 0 || hasMore} onPress={onDone}>Done</Button>
          {onBackToPhotos && <Pressable accessibilityRole="button" onPress={onBackToPhotos} className="min-h-12 items-center justify-center active:opacity-70">
            <Text className="text-button text-foreground">Back to photos</Text>
          </Pressable>}
        </View>
      </View>
    </ScrollView>}
  </SafeAreaView>;
}

const TILTS = [-9, -3, 4, 10];
/** A small fanned stack of the discarded photos. Tapping it opens just these in Discarded. */
function DiscardStack({ items, onPress }: { items: Media[]; onPress(): void }) {
  const shown = items.slice(0, 4);
  return <Pressable accessibilityRole="button" accessibilityLabel={`See the ${plural(items.length, "discarded photo")}`} onPress={onPress} className="mt-7 items-center active:opacity-80">
    <View className="h-36 w-56 items-center justify-center">
      {shown.map((m, i) => <View key={m.id} className="absolute h-28 w-24 overflow-hidden rounded-2xl border-2 border-card bg-card"
        style={{ transform: [{ translateX: (i - (shown.length - 1) / 2) * 30 }, { rotate: `${TILTS[i]}deg` }] }}>
        <MediaImage media={m} fit="cover" className="flex-1" failureContent={<View className="flex-1 bg-muted" />} />
      </View>)}
    </View>
    <Text className="mt-1 text-caption text-muted-foreground">Tap to see or restore them</Text>
  </Pressable>;
}
