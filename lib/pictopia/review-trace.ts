/** Temporary, local-only evidence for the physical-device scroll/swipe regression. */
export const REVIEW_TRACE_MARKER = "review-trace-1";
export const REVIEW_TRACE_LIMIT = 1200;
type Value = string | number | boolean | null | undefined;
export interface ReviewTraceEntry { sequence: number; at: number; receivedAt: number; event: string; data: Record<string, Value> }
export interface ReviewGestureSample {
  stage: string; at: number; handler: number; state: number; oldState: number;
  x: number; y: number; vx: number; vy: number; offset: number;
  locked: boolean; panning: boolean; pinching: boolean; success?: boolean; direction?: string | null;
}
const entries: ReviewTraceEntry[] = [];
const photos = new Map<string, string>();
let sequence = 0, photoSequence = 0;
/** Export session-local aliases, never PhotoKit IDs, paths, filenames or photograph data. */
export function tracePhoto(id: string | null | undefined): string | null {
  if (!id) return null;
  let alias = photos.get(id);
  if (!alias) {
    alias = `photo-${++photoSequence}`;
    if (photos.size >= 500) photos.delete(photos.keys().next().value!);
    photos.set(id, alias);
  }
  return alias;
}
export function reviewTrace(event: string, data: Record<string, Value> = {}, at = Date.now()) {
  entries.push({ sequence: ++sequence, at, receivedAt: Date.now(), event, data: { ...data } });
  if (entries.length > REVIEW_TRACE_LIMIT) entries.splice(0, entries.length - REVIEW_TRACE_LIMIT);
}
export function reviewTraceSnapshot() {
  return {
    marker: REVIEW_TRACE_MARKER,
    // Native batches arrive after Finalize; sort by capture time and retain arrival order too.
    events: entries.map(entry => ({ ...entry, data: { ...entry.data } })).sort((a, b) => a.at - b.at || a.sequence - b.sequence),
  };
}
/** Called only once per finalized native attempt, never on every move across the JS bridge. */
export function traceNativeGesture(photo: string, samples: ReviewGestureSample[]) {
  const attempt = samples[0]?.at ?? Date.now();
  for (const sample of samples) {
    const { stage, at, ...data } = sample;
    reviewTrace(`pan.${stage}`, { ...data, attempt, photo: tracePhoto(photo) }, at);
  }
}
/** Copy primitive event fields on the UI thread; do not retain native event objects. */
export function gestureSample(
  stage: string,
  event: { handlerTag?: number; state?: number; oldState?: number; translationX?: number; translationY?: number; velocityX?: number; velocityY?: number } | undefined,
  offset: number, locked: boolean, panning: boolean, pinching: boolean,
): ReviewGestureSample {
  "worklet";
  return { stage, at: Date.now(), handler: event?.handlerTag ?? -1, state: event?.state ?? -1, oldState: event?.oldState ?? -1,
    x: event?.translationX ?? 0, y: event?.translationY ?? 0, vx: event?.velocityX ?? 0, vy: event?.velocityY ?? 0,
    offset, locked, panning, pinching };
}
