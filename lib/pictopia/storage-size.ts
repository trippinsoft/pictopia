import type { Media } from "./types";
/** An absent/nonpositive/invalid size is excluded, never counted as a measured zero.
 * A Live Photo's still file alone cannot estimate its paired motion resource. */
export function knownMediaSize(m: Pick<Media, "size" | "scan" | "livePhoto">) {
  const candidates = m.livePhoto ? [m.scan?.size] : [m.size, m.scan?.size];
  return candidates.find(size => typeof size === "number" && Number.isFinite(size) && size > 0);
}
export function storageEstimate(items: readonly Pick<Media, "size" | "scan" | "livePhoto">[]) {
  let bytes = 0, known = 0;
  for (const item of items) { const size = knownMediaSize(item); if (size !== undefined) { bytes += size; known++; } }
  return { bytes, known, unknown: items.length - known };
}
