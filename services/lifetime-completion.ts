import { lifetimeTestStore } from "./lifetime-testing";
import { LIFETIME_PLUS_ENABLED } from "@/lib/pictopia/feature-flags";
import { Platform } from "react-native";
import { lifetimePlusStore } from "./lifetime-plus";
import { isLifetimeEligible } from "@/lib/pictopia/lifetime-plus";
import type { LocalCompletionAudit } from "@/lib/pictopia/lifetime-completion";
import { mediaService } from "./media";
import { storage, serialize } from "./repository";
import { auditLifetimePhotos, type PhotoFact } from "@/lib/pictopia/lifetime-completion";
import type { ScanState } from "@/lib/pictopia/types";

let pending: Promise<void> | undefined;
let lastAttempt = 0;
/** Local consistency check; Supabase rechecks current paid subscription before awarding. */
export function checkLifetimeCompletion(): Promise<void> {
  if (!LIFETIME_PLUS_ENABLED) return Promise.resolve();
  if (lifetimeTestStore.snapshot()) return Promise.resolve();
  if (Platform.OS === "web" || !isLifetimeEligible(lifetimePlusStore.snapshot())) return Promise.resolve();
  if (pending) return pending;
  if (Date.now() - lastAttempt < 60000) return Promise.resolve();
  lastAttempt = Date.now();
  pending = (async () => {
    await serialize(() => storage.setValue("lifetimeCompletionCandidate:v1", {
      version: 1, verified: false, checkedAt: Date.now(), ready: false, reason: "index",
      distinctEligiblePhotos: 0, remainingPhotos: 0,
    }));
    const progress = await serialize(() => storage.progress());
    if (progress.remaining !== 0 || progress.accessible + progress.deleted < 10000) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    async function inventory() {
      const items: PhotoFact[] = [];
      let found = 0, expected = -1;
      const report = await mediaService.sync(async page => {
        for (const m of page) items.push({ id: m.id, type: m.type, modified: m.modified, active: m.active });
      }, (n, total) => { found = n; expected = total; }, controller.signal);
      if (controller.signal.aborted || report?.metadataFailures.length || found !== expected || items.length !== expected) throw Error("The photo library changed during verification.");
      return items;
    }
    try {
      const start = await mediaService.permission();
      if (!start.granted || start.limited) return;
      const before = await inventory();
      const snapshot = await serialize(async () => {
        const index = await storage.getValue<{ status: string; completedAt: number; metadataFailures: string[] }>("libraryIndex:v1");
        const scan = await storage.getValue<ScanState>("scan") ?? { status: "idle", processed: 0, total: 0, skipped: 0 };
        const saved: PhotoFact[] = [];
        for (let offset = 0;; offset += 500) {
          const page = await storage.query({ type: "photo", includeInactive: true, offset, limit: 500 });
          saved.push(...page);
          if (page.length < 500) break;
        }
        return { index, scan, saved };
      });
      const after = await inventory();
      const end = await mediaService.permission();
      const result = await serialize(async (): Promise<LocalCompletionAudit> => {
        const indexNow = await storage.getValue<{ status: string; completedAt: number }>("libraryIndex:v1");
        const scanNow = await storage.getValue<ScanState>("scan");
        const result = auditLifetimePhotos({ before, after, saved: snapshot.saved,
          scan: JSON.stringify(scanNow) === JSON.stringify(snapshot.scan) ? snapshot.scan : { ...snapshot.scan, status: "paused" },
          fullAccess: end.granted && !end.limited,
          indexComplete: snapshot.index?.status === "complete" && snapshot.index.metadataFailures.length === 0 && indexNow?.status === "complete" && indexNow.completedAt === snapshot.index.completedAt,
        });
        // Aggregate counts only, kept locally. No photo identifiers leave the device.
        await storage.setValue("lifetimeCompletionCandidate:v1", result);
        return result;
      });
      if (result.ready && isLifetimeEligible(lifetimePlusStore.snapshot())) {
        try { await lifetimePlusStore.sync({ completion: result }); }
        finally { lastAttempt = Date.now() + 4 * 60000; } // Retry failed/disabled awards after five minutes, within existing verification limits.
      }
    } finally { clearTimeout(timeout); }
  })().finally(() => { pending = undefined; });
  return pending;
}
