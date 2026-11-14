import type { Media, ScanState } from "./types";
import { SCAN_VERSION } from "./logic";

export type PhotoFact = Pick<Media, "id" | "type" | "modified" | "active" | "deletedAt" | "firstSeenAt" | "scan" | "scanError">;
export interface LocalCompletionAudit {
  version: 1;
  /** A local audit is a candidate, never authenticated server proof. */
  verified: false;
  checkedAt: number;
  ready: boolean;
  reason: "permission" | "index" | "changed" | "scan" | "unreviewed" | "threshold" | "candidate";
  distinctEligiblePhotos: number;
  remainingPhotos: number;
}

/** Fresh OS inventories sandwich a serialized repository snapshot. No image data is needed. */
export function auditLifetimePhotos(input: {
  fullAccess: boolean; indexComplete: boolean; scan: ScanState;
  before: PhotoFact[]; after: PhotoFact[]; saved: PhotoFact[];
}, now = Date.now()): LocalCompletionAudit {
  const result: LocalCompletionAudit = { version: 1, verified: false, checkedAt: now, ready: false, reason: "permission", distinctEligiblePhotos: 0, remainingPhotos: 0 };
  if (!input.fullAccess) return result;
  result.reason = "index";
  if (!input.indexComplete) return result;
  const photos = (items: PhotoFact[]) => items.filter(m => m.type === "photo");
  const before = photos(input.before), after = photos(input.after), saved = photos(input.saved);
  const unique = (items: PhotoFact[]) => new Map(items.map(m => [m.id, m]));
  const live = unique(after), initial = unique(before), records = unique(saved);
  result.reason = "changed";
  if (live.size !== after.length || initial.size !== before.length || records.size !== saved.length || live.size !== initial.size ||
    after.some(m => !m.id || initial.get(m.id)?.modified !== m.modified)) return result;
  // Restored IDs cannot count as both live and deleted; disappearance alone earns nothing.
  const active = saved.filter(m => m.active && m.deletedAt === undefined);
  if (active.length !== live.size || active.some(m => live.get(m.id)?.modified !== m.modified) ||
    saved.some(m => m.deletedAt !== undefined && live.has(m.id))) return result;
  const validTime = (t: number | undefined) => t !== undefined && Number.isSafeInteger(t) && t > 0 && t <= now;
  const deleted = saved.filter(m => !m.active && validTime(m.deletedAt) && validTime(m.firstSeenAt));
  result.distinctEligiblePhotos = active.length + deleted.length;
  result.remainingPhotos = active.filter(m => !validTime(m.firstSeenAt)).length;
  result.reason = "scan";
  if (input.scan.status !== "complete" || input.scan.skipped !== 0 || input.scan.processed !== input.scan.total ||
    active.some(m => m.scanError || m.scan?.version !== `${SCAN_VERSION}:${m.modified}` || !/^[a-f0-9]{64}$/i.test(m.scan?.hash ?? ""))) return result;
  result.reason = "unreviewed";
  if (result.remainingPhotos !== 0) return result;
  result.reason = "threshold";
  if (result.distinctEligiblePhotos < 10000) return result;
  return { ...result, ready: true, reason: "candidate" };
}
