import { useCallback, useRef, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { matchMosaicPhotos, type MosaicMatches, type MosaicPhoto } from "@/lib/pictopia/mosaic-match";
import { mosaicColumns, mosaicRows, mosaicScenes } from "@/lib/pictopia/mosaic-scenes";
import { mediaService } from "@/services/media";
import type { MosaicNativeService, MosaicRender } from "@/services/mosaic-lab.types";

export const sampleSizes = [500, 1_000, 5_000, 10_000, 0] as const;
export type SampleSize = typeof sampleSizes[number];
export type Treatment = "natural" | "adjusted";

interface Benchmark {
  sample: SampleSize;
  available: number;
  selected: number;
  analyzed: number;
  hits: number;
  limited: boolean;
  scanMs: number;
  matchMs: number;
  startBytes: number;
  peakBytes: number;
  scores: { score: number; unique: number }[];
  renders: Partial<Record<number, { ms: number; missing: number }>>;
}

interface Result {
  photos: MosaicPhoto[];
  matches: MosaicMatches;
  rendered: Partial<Record<number, MosaicRender>>;
  benchmark: Benchmark;
}
interface Run {
  token: string;
  result?: Result;
}

let serial = 0;
const sleepTick = () => new Promise<void>(resolve => setTimeout(resolve, 0));
const clock = () => performance.now();
const message = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;
export const seconds = (ms: number) => `${(ms / 1_000).toFixed(2)} s`;
export const memory = (bytes: number) => bytes > 0 ? `${(bytes / 1_048_576).toFixed(1)} MiB` : "Unavailable";
export const sizeLabel = (size: SampleSize) => size === 0 ? "Full library" : size.toLocaleString();
export const matchScore = (score: number) => score.toFixed(1);

export function benchmarkText(runs: Benchmark[]) {
  return [
    "Pictopia · Photomosaic Lab",
    `${mosaicColumns} × ${mosaicRows} tiles, 48 px per tile. Match scores use natural colors.`,
    "Times are elapsed. Memory is sampled process-wide resident memory.",
    ...runs.map(run => [
      `\n${sizeLabel(run.sample)} · ${run.limited ? "limited" : "full"} Photos access`,
      `${run.analyzed}/${run.selected} analyzed (${run.available} accessible, ${run.hits} cached, ${run.selected - run.analyzed} unavailable)`,
      `Analysis ${seconds(run.scanMs)} · Matching ${seconds(run.matchMs)} · Memory ${memory(run.startBytes)} at start, ${memory(run.peakBytes)} sampled peak`,
      ...run.scores.map(({ score, unique }, index) => {
        const render = run.renders[index];
        return `${mosaicScenes[index].name} ${matchScore(score)}/100 · ${unique} distinct photos${render ? ` · both treatments rendered in ${seconds(render.ms)} · ${render.missing} unavailable tiles` : ""}`;
      }),
    ].join("\n")),
  ].join("\n");
}

export function useMosaicLab(native: MosaicNativeService) {
  const active = useRef<Run | null>(null);
  const [result, setResult] = useState<Result>();
  const [scene, setScene] = useState(0);
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [viewer, setViewer] = useState(false);
  const [inspection, setInspection] = useState<{ tile: number; uri?: string; error?: string }>();
  const [history, setHistory] = useState<Benchmark[]>([]);
  const inspecting = useRef(0);

  const closeTile = () => {
    inspecting.current++;
    setInspection(undefined);
  };
  const closeViewer = () => {
    closeTile();
    setViewer(false);
  };

  const release = useCallback(() => {
    const run = active.current;
    active.current = null;
    inspecting.current++;
    if (run) native.mosaicClear(run.token);
  }, [native]);

  const reset = useCallback((reason?: string) => {
    release();
    setBusy(undefined);
    setResult(undefined);
    setInspection(undefined);
    setViewer(false);
    setError(reason);
  }, [release]);

  useFocusEffect(useCallback(() => {
    const unsubscribe = mediaService.listen(() => {
      if (active.current) reset("Your photo library changed. Build a fresh mosaic to continue.");
    });
    const state = AppState.addEventListener("change", next => {
      if (next === "background" && active.current) reset("Build again to use the photos currently available on this device.");
    });
    return () => {
      state.remove();
      unsubscribe();
      reset();
    };
  }, [reset]));

  async function render(run: Run, index: number) {
    const current = run.result;
    if (!current || current.rendered[index]) return;
    setBusy(`Rendering ${mosaicScenes[index].name}…`);
    const ids = current.matches.scenes[index].tiles.map(tile => current.photos[tile].id);
    const output = await native.mosaicRender(
      run.token, index, ids, mosaicScenes[index].targets.flat(), mosaicColumns,
    );
    if (active.current !== run) return;
    const benchmark = {
      ...current.benchmark,
      peakBytes: Math.max(current.benchmark.peakBytes, output.peakBytes),
      renders: { ...current.benchmark.renders, [index]: { ms: output.renderMs, missing: output.missing } },
    };
    run.result = { ...current, benchmark, rendered: { ...current.rendered, [index]: output } };
    setResult(run.result);
    setHistory(prior => {
      const updated = prior.at(-1) === current.benchmark ? prior.slice(0, -1) : prior;
      return [...updated.slice(-19), benchmark];
    });
  }

  async function build(sample: SampleSize) {
    reset();
    const run: Run = { token: `mosaic:${Date.now()}:${++serial}` };
    active.current = run;
    setBusy("Reading your photo library…");
    const start = clock();
    try {
      const scope = await native.mosaicStart(run.token, sample);
      if (active.current !== run) return;
      if (!scope.selected) throw new Error("No photos are available with your current Photos access.");
      const photos: MosaicPhoto[] = [];
      let hits = 0, processed = 0, peakBytes = scope.peakBytes;
      let lastUpdate = -Infinity;
      while (processed < scope.selected) {
        if (clock() - lastUpdate >= 120) {
          setBusy(`Analyzing thumbnails · ${processed.toLocaleString()} of ${scope.selected.toLocaleString()}`);
          lastUpdate = clock();
        }
        const batch = await native.mosaicScan(run.token);
        if (active.current !== run) return;
        if (batch.processed <= processed) throw new Error("Thumbnail analysis stopped. Try building again.");
        photos.push(...batch.photos);
        hits += batch.hits;
        processed = batch.processed;
        peakBytes = Math.max(peakBytes, batch.peakBytes);
      }
      const matching = clock();
      const matches = await matchMosaicPhotos(photos, async index => {
        setBusy(`Comparing scenes · ${index + 1} of ${mosaicScenes.length}`);
        await sleepTick();
        if (active.current !== run) throw new Error("Canceled");
      });
      if (active.current !== run) return;
      const benchmark: Benchmark = {
        sample, available: scope.available, selected: scope.selected, analyzed: photos.length,
        hits, limited: scope.limited, scanMs: matching - start, matchMs: clock() - matching,
        peakBytes, startBytes: scope.startBytes,
        scores: matches.scenes.map(({ score, unique }) => ({ score, unique })), renders: {},
      };
      run.result = { photos, matches, rendered: {}, benchmark };
      setHistory(prior => [...prior.slice(-19), benchmark]);
      setScene(matches.best);
      setResult(run.result);
      await render(run, matches.best);
    } catch (failure) {
      if (active.current !== run) return;
      const reason = message(failure, "Couldn’t build a mosaic. Try again.");
      if (!run.result) reset(reason);
      else setError(reason);
    } finally {
      if (active.current === run) setBusy(undefined);
    }
  }

  async function choose(index: number) {
    const run = active.current;
    if (busy || !run?.result) return;
    setError(undefined);
    setScene(index);
    try {
      await render(run, index);
    } catch (failure) {
      if (active.current === run) setError(message(failure, "Couldn’t render this scene. Try again."));
    } finally {
      if (active.current === run) setBusy(undefined);
    }
  }

  async function inspect(x: number, y: number) {
    const run = active.current;
    const current = run?.result;
    if (!run || !current || !current.rendered[scene] || !viewer) return;
    const col = Math.max(0, Math.min(mosaicColumns - 1, Math.floor(x * mosaicColumns)));
    const row = Math.max(0, Math.min(mosaicRows - 1, Math.floor(y * mosaicRows)));
    const tile = row * mosaicColumns + col;
    const id = current.photos[current.matches.scenes[scene].tiles[tile]]?.id;
    if (!id) return;
    const ticket = ++inspecting.current;
    setInspection({ tile });
    try {
      const uri = await native.mosaicInspect(run.token, id);
      if (ticket === inspecting.current && active.current === run) setInspection({ tile, uri });
    } catch (failure) {
      if (ticket === inspecting.current && active.current === run) {
        setInspection({ tile, error: message(failure, "This photo is unavailable.") });
      }
    }
  }

  return {
    result, scene, busy, error, viewer, inspection, history,
    build, choose, inspect, closeTile, closeViewer, setViewer, reset,
  };
}
