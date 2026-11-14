import { useEffect, useMemo, useState } from "react";
import { buildWall, type SavedWallLayout } from "@/lib/pictopia/memory-wall";
import { memoryWallStore } from "@/services/memory-wall";
import { useLibraryProgress } from "./use-library-progress";

let savedLayout: SavedWallLayout | undefined;
let loaded = false;

/** The Memory Wall built from the shared progress snapshot (the same numbers Home and Progress
 * show), with the saved year arrangement so the layout stays stable between visits. */
export function useMemoryWall() {
  const library = useLibraryProgress();
  const [layout, setLayout] = useState<SavedWallLayout | undefined>(savedLayout);
  const [ready, setReady] = useState(loaded);
  useEffect(() => {
    if (loaded) return;
    let alive = true;
    void memoryWallStore.layout().catch(() => undefined).then((value) => {
      savedLayout = value; loaded = true;
      if (alive) { setLayout(value); setReady(true); }
    });
    return () => { alive = false; };
  }, []);
  const months = library.snapshot?.wall;
  const model = useMemo(() => (months && ready ? buildWall(months, layout) : undefined), [months, layout, ready]);
  useEffect(() => {
    if (!model || !model.years.length) return;
    const key = JSON.stringify(model.rows);
    if (key === JSON.stringify(layout?.rows)) return;
    savedLayout = { rows: model.rows };
    setLayout(savedLayout);
    void memoryWallStore.saveLayout(model.rows).catch(() => {});
  }, [model, layout]);
  return { ...library, model };
}
