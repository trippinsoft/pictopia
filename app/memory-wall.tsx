import { useLifetimeTest } from "@/components/pictopia/use-lifetime-test";
import { useMemo } from "react";
import { Platform, View } from "react-native";
import { router } from "expo-router";
import { Button, Loading, Page, Text } from "@/components/pictopia/ui";
import { Sticker } from "@/components/pictopia/playful";
import { usePictopia } from "@/components/pictopia/provider";
import { WallCanvas } from "@/components/pictopia/memory-wall";
import { BigPercent, PeekButton, WallFrame } from "@/components/pictopia/memory-wall-parts";
import { useMemoryWall } from "@/components/pictopia/use-memory-wall";
import { usePeek } from "@/components/pictopia/use-peek";
import { progressResource } from "@/services/progress";
import { blockTiles, OVERVIEW_TILE, UNDATED, yearComplete } from "@/lib/pictopia/memory-wall";
import { bytes } from "@/lib/pictopia/logic";
import { plural } from "@/lib/pictopia/text";

/** The Big Picture: the whole photo library as one picture, one rectangle per year, revealed tile by
 * tile as photos are explored anywhere in Pictopia. Tap a year to look closer. */
export default function MemoryWall() {
  const simulation = useLifetimeTest();
  const app = usePictopia();
  const { model, percent, progress, snapshot, error, initialLoading } = useMemoryWall();
  const { peek, peeking, start } = usePeek();
  const tiles = useMemo(() => model?.years.reduce((n, y) => n + y.blocks.reduce((m, b) => m + blockTiles(b, OVERVIEW_TILE).length, 0), 0) ?? 0, [model]);
  const dated = model?.years.filter((y) => y.key !== UNDATED) ?? [];
  const completeYears = dated.filter(yearComplete).length;
  const perTile = model && tiles ? Math.max(1, Math.round(model.photos / tiles)) : 1;
  const open = (year: string) => router.push({ pathname: "/memory-wall-year", params: { year } });
  const allDone = !!model && model.photos > 0 && model.remaining === 0;
  return (
    <Page title="The Big Picture" fallback="/(tabs)/progress">
      {simulation ? <Text className="text-caption text-primary">Simulated library · test builds only</Text> : null}
      {!model ? (
        error ? (
          <View className="gap-3 pt-4"><Text className="text-body text-destructive">The Big Picture couldn’t be loaded.</Text><Button onPress={() => void progressResource.refresh()}>Try again</Button></View>
        ) : initialLoading || !app.ready || !app.libraryReliable ? (
          <View className="gap-3 pt-8"><Loading />{!app.busy && app.ready && !app.libraryReliable && <Button onPress={() => void app.connect()}>Connect library</Button>}</View>
        ) : null
      ) : model.photos === 0 ? (
        <View className="gap-4 pt-4">
          <Text className="text-body leading-6 text-muted-foreground">The Big Picture appears once Pictopia can see your photos. Each year becomes part of one big picture that fills in as you explore.</Text>
          <Button onPress={() => void app.connect()}>{Platform.OS === "web" ? "Choose photos" : "Manage photo access"}</Button>
        </View>
      ) : (
        <View className="gap-4">
          {!!app.permission?.limited && <Text className="text-caption text-muted-foreground">Showing the photos you’ve shared with Pictopia.</Text>}
          <WallFrame>
            <WallCanvas model={model} tileSize={OVERVIEW_TILE} onYear={open} peek={peek} />
          </WallFrame>
          <View className="-mt-1 flex-row items-center justify-between gap-3">
            <Text className="flex-1 text-caption text-muted-foreground">Tap a year to look closer</Text>
            <PeekButton peeking={peeking} onPress={start} />
          </View>
          <BigPercent value={percent} label={app.permission?.limited ? "of your shared photos explored" : "of your photos explored"}
            detail={`${model.explored.toLocaleString()} of ${plural(model.photos, "photo")}`} />
          {allDone && <Text className="text-body leading-6 text-foreground">Every photo in your big picture has been explored.</Text>}
          <View className="flex-row items-stretch gap-2.5">
            <Sticker className="flex-1 gap-1 p-3" rotate={0}>
              <Text className="text-h3 text-foreground">{completeYears}<Text className="text-h6 text-muted-foreground"> of {dated.length}</Text></Text>
              <Text className="text-caption text-muted-foreground">{dated.length === 1 ? "year complete" : "years complete"}</Text>
            </Sticker>
            <Sticker className="flex-1 gap-1 p-3" rotate={0}>
              <Text numberOfLines={1} adjustsFontSizeToFit className="text-h3 text-foreground">{(progress?.deleted ?? 0).toLocaleString()}</Text>
              <Text className="text-caption text-muted-foreground">{progress?.deletedBytes ? `photos cleared · ${bytes(progress.deletedBytes)}` : "photos cleared"}</Text>
            </Sticker>
            {!!snapshot?.stats.pending && (
              <Sticker className="flex-1 gap-1 p-3" rotate={0} onPress={() => router.push("/queue")} label={`${snapshot.stats.pending} waiting in Discarded`}>
                <Text className="text-h3 text-foreground">{snapshot.stats.pending.toLocaleString()}</Text>
                <Text className="text-caption text-muted-foreground">in Discarded ›</Text>
              </Sticker>
            )}
          </View>
          <Text className="text-caption leading-5 text-muted-foreground">
            {perTile > 1 ? `Each tile is about ${plural(perTile, "photo")}` : "Each tile is a photo"} and fills in as you explore, wherever you explore it. Photos you delete keep their tile. Videos aren’t part of your big picture yet.
            {Platform.OS === "web" ? " Browser dates are file-modified dates." : ""}
          </Text>
        </View>
      )}
    </Page>
  );
}
