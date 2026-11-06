/** Features that ship in the code but stay closed in production until they are verified on
 * real devices. A developer can open one for on-device testing from the Adventure Lab. */
export const RELEASED = {
  /** Exact/near-duplicate scanning and keeper suggestions need checks on iPhone and Android. */
  duplicateHunt: false,
} as const;
export type FeatureFlag = keyof typeof RELEASED;
export type DeveloperFlags = Partial<Record<FeatureFlag, boolean>>;
export const featureOpen = (flag: FeatureFlag, developer: DeveloperFlags | undefined) =>
  RELEASED[flag] || developer?.[flag] === true;

/** The advisory tags on a duplicate group's photos, from existing scan data only. Nothing is
 * pre-marked: the tag only says which one is sharpest or largest. */
export function keeperTags(items: { id: string; width?: number; height?: number; size?: number; sharpness?: number }[]) {
  const tags: Record<string, "Sharpest" | "Largest"> = {};
  if (items.length < 2) return tags;
  const sharp = items.filter(m => typeof m.sharpness === "number" && Number.isFinite(m.sharpness));
  if (sharp.length >= 2) {
    const best = sharp.reduce((a, b) => ((b.sharpness ?? 0) > (a.sharpness ?? 0) ? b : a));
    if (sharp.some(m => m !== best && (m.sharpness ?? 0) < (best.sharpness ?? 0) * 0.9)) tags[best.id] = "Sharpest";
  }
  const pixels = (m: (typeof items)[number]) => (m.width ?? 0) * (m.height ?? 0) || (m.size ?? 0);
  const big = items.reduce((a, b) => (pixels(b) > pixels(a) ? b : a));
  if (!tags[big.id] && items.some(m => m !== big && pixels(m) < pixels(big))) tags[big.id] = "Largest";
  return tags;
}
/** Marking every photo in a group leaves nothing; that needs an explicit confirmation. */
export const marksEverything = (groupIds: readonly string[], marked: ReadonlySet<string>, adding: string) =>
  groupIds.every(id => id === adding || marked.has(id));
