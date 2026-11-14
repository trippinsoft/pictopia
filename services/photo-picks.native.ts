import { requireOptionalNativeModule } from "expo-modules-core";
import type { PhotoPick } from "@/lib/pictopia/photo-picks";
const native = requireOptionalNativeModule<{
  assessPhotos?(ids: string[]): Promise<({ id: string } & PhotoPick)[]>;
  getMetadata?(ids: string[]): Promise<{ id: string; screenshot: boolean }[]>;
}>("PictopiaAnalysis");
/** Results never change for a photo, so each one is checked once per launch. */
const cache = new Map<string, PhotoPick>();

/** On-device check (iOS Vision) of which photos are paperwork vs. people and places. Builds
 * without it (Android, older iOS binaries) return no judgments and games keep their order. */
export async function assessPhotos(ids: string[]): Promise<Record<string, PhotoPick>> {
  const missing = ids.filter(id => !cache.has(id));
  if (missing.length && native?.assessPhotos) {
    try {
      for (const { id, utility, score, faces } of await native.assessPhotos(missing))
        cache.set(id, { utility: !!utility, score: Number(score) || 0, faces: Number(faces) || 0 });
    } catch { /* A failed check leaves the order unchanged. */ }
  }
  const result: Record<string, PhotoPick> = {};
  for (const id of ids) { const pick = cache.get(id); if (pick) result[id] = pick; }
  return result;
}

/** One quick library query for many photos: which are still visible, and which the system now
 * flags as screenshots. Undefined when this build can't answer, so callers use the slower check. */
export async function presentPhotos(ids: string[]): Promise<{ present: Set<string>; screenshots: Set<string> } | undefined> {
  if (!native?.getMetadata) return undefined;
  try {
    const rows = await native.getMetadata(ids);
    return { present: new Set(rows.map(row => row.id)), screenshots: new Set(rows.filter(row => row.screenshot).map(row => row.id)) };
  } catch { return undefined; }
}
