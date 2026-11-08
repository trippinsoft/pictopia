import type { Media } from "./types";
/** An absent/nonpositive/invalid size is excluded, never counted as a measured zero.
 * Only the native resource total (still and motion together) is ever saved as a Live Photo's size. */
export function knownMediaSize(m: Pick<Media, "size" | "scan" | "livePhoto">) {
  const candidates = [m.size, m.scan?.size];
  return candidates.find(size => typeof size === "number" && Number.isFinite(size) && size > 0);
}
export function storageEstimate(items: readonly Pick<Media, "size" | "scan" | "livePhoto">[]) {
  let bytes = 0, known = 0;
  for (const item of items) { const size = knownMediaSize(item); if (size !== undefined) { bytes += size; known++; } }
  return { bytes, known, unknown: items.length - known };
}
/** What an item is likely to take up when its platform reports no size: compressed photos
 * run at about 0.3 bytes per pixel, video at about 1.5 MB per second, and a Live Photo adds
 * its short motion clip. Shown as a size, never saved as one. */
export function estimatedMediaSize(m: Pick<Media, "type" | "width" | "height" | "duration" | "livePhoto">) {
  if (m.type === "video") return Math.round(Math.max(1, m.duration || 0) * 1_500_000);
  const pixels = m.width > 0 && m.height > 0 ? m.width * m.height : 12_000_000;
  return Math.max(400_000, Math.round(pixels * 0.3)) + (m.livePhoto ? 2_500_000 : 0);
}
/** The size to show for an item: measured when known, otherwise the estimate. */
export function displayMediaSize(m: Pick<Media, "type" | "width" | "height" | "duration" | "livePhoto" | "size" | "scan">, measured?: number) {
  return knownMediaSize(m) ?? (measured !== undefined && Number.isFinite(measured) && measured > 0 ? measured : estimatedMediaSize(m));
}
