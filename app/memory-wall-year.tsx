import { lifetimeTestStore } from "@/services/lifetime-testing";
import { useLifetimeTest } from "@/components/pictopia/use-lifetime-test";
import { Pressable, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Button, Loading, Page, Text } from "@/components/pictopia/ui";
import { WallCanvas } from "@/components/pictopia/memory-wall";
import { BigPercent, PeekButton, WallFrame } from "@/components/pictopia/memory-wall-parts";
import { useMemoryWall } from "@/components/pictopia/use-memory-wall";
import { usePeek } from "@/components/pictopia/use-peek";
import { frameFor, nextBlock, UNDATED, YEAR_TILE, yearLabel, type WallBlock, type WallYear } from "@/lib/pictopia/memory-wall";
import { wallPercent } from "@/lib/pictopia/library-progress";
import { plural } from "@/lib/pictopia/text";

const MONTHS = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1));
const monthName = (m: number, style: "long" | "narrow" = "long") => MONTHS[m - 1].toLocaleDateString(undefined, { month: style });

/** Reviewing stays month by month (there is no whole-year review): months open their own review. */
const openScope = (scope: string) => { if (!lifetimeTestStore.snapshot()) router.push({ pathname: "/collection-review", params: { scope } }); };

export default function MemoryWallYear() {
  const simulation = useLifetimeTest();
  const { year: param } = useLocalSearchParams<{ year?: string }>();
  const { model, error, initialLoading } = useMemoryWall();
  const { peek, peeking, start } = usePeek();
  const year = model?.years.find((y) => y.key === param);
  const title = param === UNDATED ? "Undated photos" : param ?? "The Big Picture";
  return (
    <Page title={title} fallback="/memory-wall">
      {simulation ? <Text className="text-caption text-primary">Simulated library · no test photos to open</Text> : null}
      {!model ? (
        <View className="pt-8">{error ? <Text className="text-body text-destructive">This year couldn’t be loaded.</Text> : initialLoading ? <Loading /> : null}</View>
      ) : !year ? (
        <View className="gap-4 pt-4">
          <Text className="text-body leading-6 text-muted-foreground">{param === UNDATED ? "There are no undated photos in your big picture right now." : `There are no photos from ${param} in your big picture right now.`}</Text>
          <Button secondary onPress={() => router.canGoBack() ? router.back() : router.replace("/memory-wall")}>Back to The Big Picture</Button>
        </View>
      ) : (
        <YearDetail year={year} model={model} peek={peek} peeking={peeking} onPeek={start} />
      )}
    </Page>
  );
}

function YearDetail({ year, model, peek, peeking, onPeek }: { year: WallYear; model: NonNullable<ReturnType<typeof useMemoryWall>["model"]>; peek: ReturnType<typeof usePeek>["peek"]; peeking: boolean; onPeek: () => void }) {
  const frame = frameFor(year.rect);
  const name = yearLabel(year.key);
  const photos = year.total + year.cleared;
  const next = nextBlock(year);
  const undated = year.key === UNDATED;
  return (
    <View className="gap-4">
      <WallFrame>
        <WallCanvas model={model} view={frame} tileSize={YEAR_TILE} labels={false} highlight={year.key} dimOthers monthLines={!undated} peek={peek} gap={2} />
      </WallFrame>
      <View className="-mt-1 flex-row items-center justify-between gap-3">
        <Text className="flex-1 text-caption text-muted-foreground">{undated ? "Outlined: where undated photos sit in your big picture" : `Outlined: where ${name} sits in your big picture`}</Text>
        <PeekButton peeking={peeking} onPress={onPeek} label="Peek at this part of the picture for two seconds" />
      </View>
      <BigPercent value={wallPercent(year)} label="explored" detail={`${(year.explored + year.cleared).toLocaleString()} of ${plural(photos, "photo")}${year.cleared ? ` · ${year.cleared.toLocaleString()} cleared` : ""}`} />
      {!undated && <MonthStrip year={year} />}
      {next ? (
        <View className="gap-1.5">
          <Button large icon="ArrowRight" onPress={() => openScope(undated ? UNDATED : `month:${next.key}`)}>
            {undated ? "Review undated photos" : `Continue with ${monthName(next.month!)} ${year.key}`}
          </Button>
          <Text className="text-center text-caption text-muted-foreground">
            {undated ? "Photos without a usable date, reviewed like any month." : `The first month of ${year.key} with photos still to explore.`}
          </Text>
        </View>
      ) : (
        <View className="flex-row items-center justify-center gap-2 rounded-2xl bg-card px-4 py-3.5">
          <Text className="text-h5 text-foreground">{undated ? "Every undated photo explored" : `Every photo from ${name} explored`}</Text>
        </View>
      )}
    </View>
  );
}

function MonthStrip({ year }: { year: WallYear }) {
  const byMonth = new Map(year.blocks.map((b) => [b.month!, b]));
  const complete = year.blocks.filter((b) => b.remaining === 0).length;
  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <Text className="text-h6 text-foreground">Months</Text>
        <Text className="text-caption text-muted-foreground">{complete} of {plural(year.blocks.length, "month")} complete</Text>
      </View>
      <View className="flex-row gap-1">
        {MONTHS.map((_, i) => <MonthBar key={i} month={i + 1} block={byMonth.get(i + 1)} year={year.key} />)}
      </View>
    </View>
  );
}

function MonthBar({ month, block, year }: { month: number; block?: WallBlock; year: string }) {
  const letter = monthName(month, "narrow");
  if (!block) {
    return (
      <View accessible accessibilityLabel={`${monthName(month)} ${year}, no photos`} className="min-h-[58px] flex-1 items-center gap-1">
        <View className="h-9 w-full rounded-[7px] border border-dashed border-foreground/15" />
        <Text className="text-[12px] text-muted-foreground/60">{letter}</Text>
      </View>
    );
  }
  const pct = wallPercent(block) ?? 0, done = block.remaining === 0;
  const fillHeight = pct > 0 ? Math.max(10, pct) : 0;
  const content = (
    <>
      <View className="h-9 w-full justify-end overflow-hidden rounded-[7px] bg-foreground/10">
        <View className={done ? "bg-grass" : "bg-sun"} style={{ height: `${fillHeight}%` }} />
      </View>
      <Text className="text-[12px] font-semibold text-muted-foreground">{letter}</Text>
    </>
  );
  const label = `${monthName(month)} ${year}, ${done ? "every photo explored" : `${pct}% explored, ${plural(block.remaining, "photo")} left`}`;
  // Months whose only photos were deleted have nothing left to open.
  if (block.total === 0) return <View accessible accessibilityLabel={label} className="min-h-[58px] flex-1 items-center gap-1">{content}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => openScope(`month:${block.key}`)} className="min-h-[58px] flex-1 items-center gap-1 active:opacity-70">
      {content}
    </Pressable>
  );
}
