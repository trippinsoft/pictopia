/** The pager's own scroll to the next photo after a discard, paced so it is clearly seen
 * (platform "smooth" scrolls are too quick to read). Shared by the native and web pagers. */
export const GLIDE_DURATION = 520;
/** Soft start, long gentle settle. Worklet-safe. */
export function glideEase(t: number) {
  "worklet";
  const p = Math.min(1, Math.max(0, t));
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}
