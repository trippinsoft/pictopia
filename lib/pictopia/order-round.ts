/** One answer per round, one score submission, and a cancellable feedback interval. */
export const ORDER_FEEDBACK_MS = 1800;
interface Clock { set(callback: () => void, delay: number): unknown; clear(handle: unknown): void }
const clock: Clock = { set: (callback, delay) => setTimeout(callback, delay), clear: handle => clearTimeout(handle as ReturnType<typeof setTimeout>) };
export function orderRoundController(ids: readonly string[], correctId: string, submit: (correct: boolean | undefined) => void, timers: Clock = clock) {
  let selected: string | undefined, timer: unknown, active = true, automatic = true, disposed = false, submitted = false, paused = false, generation = 0;
  const cancel = () => { generation++; if (timer !== undefined) timers.clear(timer); timer = undefined; };
  const advance = () => {
    if (disposed || submitted || !active || selected === undefined) return;
    submitted = true; cancel(); submit(selected === correctId);
  };
  const schedule = () => { cancel(); if (selected !== undefined && active && automatic && !paused && !disposed && !submitted) { const token = generation; timer = timers.set(() => { if (token === generation) advance(); }, ORDER_FEEDBACK_MS); } };
  return {
    select(id: string) { if (disposed || submitted || !active || selected !== undefined || !ids.includes(id)) return false; selected = id; schedule(); return true; },
    advance,
    pause() { if (disposed || submitted || selected === undefined) return false; paused = true; cancel(); return true; },
    skip() { if (disposed || submitted || !active || selected !== undefined) return; submitted = true; cancel(); submit(undefined); },
    configure(isActive: boolean, autoAdvance: boolean) { active = isActive; automatic = autoAdvance; schedule(); },
    dispose() { disposed = true; cancel(); },
  };
}
/** Sizes two stacked photos to their own aspect ratios using as much of `area` as possible:
 * each is as wide as the area allows, and height one photo doesn't need (a landscape shot)
 * goes to the other instead of being split evenly. Very wide panoramas keep a comfortable
 * full-width target and are letterboxed inside it. */
export const ORDER_GAP = 8, ORDER_MIN_HEIGHT = 96;
export function orderPhotoFrames(area: { width: number; height: number }, photos: readonly { width: number; height: number }[]) {
  const width = Math.max(0, area.width), available = Math.max(ORDER_MIN_HEIGHT * 2, area.height - ORDER_GAP * (photos.length - 1));
  const ratios = photos.map(photo => photo.width > 0 && photo.height > 0 ? photo.width / photo.height : 4 / 3);
  const ideal = ratios.map(ratio => Math.max(ORDER_MIN_HEIGHT, width / ratio));
  let heights = ideal;
  if (ideal.reduce((sum, h) => sum + h, 0) > available) {
    const share = available / photos.length, small = ideal.map(h => h < share);
    const spare = ideal.reduce((sum, h, i) => sum + (small[i] ? share - h : 0), 0), large = small.filter(s => !s).length;
    heights = ideal.map((h, i) => small[i] ? h : Math.min(h, share + spare / Math.max(1, large)));
  }
  return heights.map((height, i) => ({ width: Math.min(width, height * ratios[i]), height }));
}

/** Two equal, stable answer targets; images letterbox inside and dates sit below. */
export function orderChoiceFrames(area: { width: number; height: number }) {
  const width = Math.max(1, (area.width - ORDER_GAP) / 2);
  return [0, 1].map(() => ({ width, height: Math.max(96, Math.min(area.height, width * 1.5)) }));
}
