import { cardPhoto } from "./pitstops";

export type MemoryPairs = 4 | 6;
export const memoryPairs = (value: unknown): MemoryPairs => value === 6 ? 6 : 4;
export const MEMORY_FLIP_MS = 300;
export const MEMORY_MATCH_MS = 480;
export type MemoryPhase = "ready" | "revealing" | "mismatch" | "closing" | "matching" | "complete";
export interface MemoryState { open: string[]; matched: string[]; phase: MemoryPhase; moves: number }
export const initialMemoryState = (): MemoryState => ({ open: [], matched: [], phase: "ready", moves: 0 });

/** Four rows in either mode. Minimum height permits scrolling only on very short windows. */
export function memoryGrid(width: number, height: number, pairs: MemoryPairs) {
  const landscape = width >= 440 && height < width * 0.55;
  const columns = landscape ? pairs : pairs === 4 ? 2 : 3;
  const rows = (pairs * 2) / columns;
  const gap = 10;
  const cardWidth = Math.max(1, (width - gap * (columns - 1)) / columns);
  const cardHeight = Math.max(64, Math.min(cardWidth * 1.05, (height - gap * (rows - 1)) / rows));
  return { columns, gap, cardWidth, cardHeight, height: cardHeight * rows + gap * (rows - 1) };
}

type Clock = { set(callback: () => void, ms: number): unknown; clear(handle: unknown): void };
const clock: Clock = { set: (callback, ms) => setTimeout(callback, ms), clear: handle => clearTimeout(handle as ReturnType<typeof setTimeout>) };
/** Synchronous input lock and one cancellable timer, shared by the UI and deterministic tests. */
export function memoryController(deck: readonly string[], changed: (state: MemoryState) => void, onMatch: () => void, timer: Clock = clock) {
  let state = initialMemoryState(), active = true, ready = false, disposed = false;
  let reduced = false, reader = false, handle: unknown, generation = 0;
  function cancel() { generation++; if (handle !== undefined) timer.clear(handle); handle = undefined; }
  function publish(next: MemoryState) { state = next; changed(state); schedule(); }
  function schedule() {
    cancel();
    if (!active || !ready || disposed) return;
    const phase = state.phase;
    const delay = phase === "revealing" || phase === "closing" ? reduced ? 0 : MEMORY_FLIP_MS
      : phase === "mismatch" ? reader ? 3000 : 1050 : phase === "matching" ? MEMORY_MATCH_MS : undefined;
    if (delay === undefined) return;
    const current = generation;
    handle = timer.set(() => {
      if (disposed || !active || current !== generation) return;
      handle = undefined;
      if (phase === "revealing") {
        if (state.open.length === 1) publish({ ...state, phase: "ready" });
        else if (cardPhoto(state.open[0]) === cardPhoto(state.open[1])) {
          publish({ ...state, matched: [...state.matched, ...state.open], phase: "matching" });
          onMatch();
        } else publish({ ...state, phase: "mismatch" });
      } else if (phase === "mismatch") publish({ ...state, open: [], phase: "closing" });
      else if (phase === "closing") publish({ ...state, phase: "ready" });
      else if (phase === "matching") publish({ ...state, open: [], phase: state.matched.length === deck.length ? "complete" : "ready" });
    }, delay);
  }
  return {
    select(card: string) {
      if (disposed || !active || !ready || state.phase !== "ready" || !deck.includes(card) || state.open.includes(card) || state.matched.includes(card)) return false;
      publish({ ...state, open: [...state.open, card], moves: state.moves + (state.open.length === 1 ? 1 : 0), phase: "revealing" });
      return true;
    },
    configure(options: { active: boolean; ready: boolean; reduced: boolean; reader: boolean }) {
      if (disposed) return;
      if (active === options.active && ready === options.ready && reduced === options.reduced && reader === options.reader) return;
      ({ active, ready, reduced, reader } = options);
      schedule();
    },
    dispose() { disposed = true; cancel(); },
  };
}
