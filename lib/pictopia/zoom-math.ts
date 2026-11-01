/** Bounded zoom math shared by Which Came First's native (worklet) and web photo targets. */
export const ZOOM_MAX = 3, ZOOM_DOUBLE_TAP = 2.5, ZOOM_SNAP = 1.05, TAP_SLOP = 10, DOUBLE_TAP_MS = 250;
export function clampScale(scale: number) {
  "worklet";
  return Math.min(ZOOM_MAX, Math.max(1, scale));
}
/** Keeps the scaled photo covering its own frame: it can never be dragged past an edge or out of its card. */
export function clampOffset(offset: number, scale: number, size: number) {
  "worklet";
  const limit = Math.max(0, (scale - 1) * size / 2);
  return Math.min(limit, Math.max(-limit, offset)) || 0;
}
/** Offset that keeps the content under the pinch focal point (relative to the frame centre) beneath the fingers. */
export function focalOffset(focalNow: number, focalStart: number, offsetStart: number, scaleStart: number, scale: number) {
  "worklet";
  return focalNow - (scale / scaleStart) * (focalStart - offsetStart);
}
/** Double tap zooms toward the tapped point, or returns to the original size. */
export function doubleTapTarget(scale: number, point: { x: number; y: number }, size: { width: number; height: number }) {
  "worklet";
  if (scale > 1) return { scale: 1, x: 0, y: 0 };
  const s = ZOOM_DOUBLE_TAP, cx = point.x - size.width / 2, cy = point.y - size.height / 2;
  return { scale: s, x: clampOffset(-cx * (s - 1), s, size.width), y: clampOffset(-cy * (s - 1), s, size.height) };
}
/** Only a deliberate single tap at the original zoom with no pinch in the same touch counts as an answer. */
export function tapSelects(scale: number, pinched: boolean, moved: number) {
  "worklet";
  return scale <= 1.001 && !pinched && moved <= TAP_SLOP;
}
/** How far a zoomed photo, shown "contain"-fitted in `frame`, may move before an edge would
 * come inside the frame. Zero on an axis where the scaled photo still fits. */
export function panLimit(scale: number, photo: { width: number; height: number }, frame: { width: number; height: number }) {
  "worklet";
  const ratio = photo.width > 0 && photo.height > 0 ? photo.width / photo.height : frame.width / Math.max(1, frame.height);
  const width = Math.min(frame.width, frame.height * ratio), height = Math.min(frame.height, frame.width / ratio);
  return { x: Math.max(0, (scale * width - frame.width) / 2), y: Math.max(0, (scale * height - frame.height) / 2) };
}
export function clampTo(offset: number, limit: number) {
  "worklet";
  return Math.min(limit, Math.max(-limit, offset)) || 0;
}
/** Double tap in the explorer: zoom toward the tapped point (relative to the frame centre),
 * keeping the photo's own edges on screen, or return to 1× when already zoomed. */
export function toggleZoomAt(scale: number, point: { x: number; y: number }, photo: { width: number; height: number }, frame: { width: number; height: number }) {
  "worklet";
  if (scale > 1.001) return { scale: 1, x: 0, y: 0 };
  const s = ZOOM_DOUBLE_TAP, limit = panLimit(s, photo, frame);
  return { scale: s, x: clampTo(-point.x * (s - 1), limit.x), y: clampTo(-point.y * (s - 1), limit.y) };
}
