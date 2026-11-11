import { Platform } from "react-native";
import { storage } from "./repository";
import { mediaService } from "./media";
import { deletionBlocked, exploreStoreFor } from "./explore";
import { adventureSessionKey } from "./adventures";
import { auditOnThisDay, type OnThisDayAudit } from "@/lib/pictopia/on-this-day-audit";
import { onThisDayPool } from "@/lib/pictopia/photo-eligibility";
import { localDate } from "@/lib/pictopia/daily";

/** Developer-only: gathers everything the pure audit needs for one date. Reads metadata only;
 * never marks, deletes, downloads or changes a review. */
export const onThisDayAuditService = {
  /** `date` is YYYY-MM-DD; the calendar day MM-DD is what matters. */
  async run(date: string, options: { lookup?: boolean; census?: boolean } = {}): Promise<OnThisDayAudit> {
    const day = date.slice(5);
    const rows = [];
    for (let offset = 0; ; offset += 200) {
      const page = await storage.query({ day, includeInactive: true, order: "oldest", offset, limit: 200 });
      rows.push(...page);
      if (page.length < 200) break;
    }
    const stats = await storage.stats();
    const all = [];
    for (let offset = 0; ; offset += 200) {
      const page = await storage.query({ order: "oldest", offset, limit: 200 });
      all.push(...page);
      if (page.length < 200) break;
    }
    const undated = all.filter(m => !Number.isFinite(m.created) || m.created === 0).length;
    const blocked = await deletionBlocked();
    const mapping = (await storage.getValue<Record<string, string>>("onThisDayActive:v1")) ?? {};
    const session = mapping[date] ? await exploreStoreFor(adventureSessionKey(mapping[date])).load() : undefined;
    const eligibleIds = onThisDayPool(rows, blocked).map(m => m.id);
    const presence = options.lookup === false ? undefined : (await mediaService.inspect(eligibleIds)).presence;
    let census;
    const diagnosticNotes: string[] = [];
    if (options.census !== false && mediaService.census) {
      const years = [...new Set((await storage.months()).map(m => Number(m.key.slice(0, 4))).filter(y => Number.isInteger(y) && y > 1900))];
      try { census = await mediaService.census(day, years.length ? years : [Number(localDate(Date.now()).slice(0, 4))]); } catch (e) { diagnosticNotes.push(`Live census failed: ${e instanceof Error ? e.message : "unknown error"}. Full reconciliation is unavailable.`); }
    }
    const inventory = census?.inventory;
    const indexedIds = new Set(all.map(m => m.id));
    const liveIds = new Set(inventory?.map(m => m.id));
    const asItem = (m: { id: string; created: number; type: string }, note?: string) => ({ id: m.id, created: m.created, type: m.type, note });
    const excluded: Record<string, number> = {};
    for (const m of inventory ?? []) {
      if (m.enumerable) continue;
      const reason = m.hidden ? "hidden" : m.burstFrame ? "extraBurstFrame" : m.source === "shared" ? "sharedAlbum" : m.source === "synced" ? "computerSynced" : m.type === "other" ? "unsupportedType" : "otherPlatformRule";
      excluded[reason] = (excluded[reason] ?? 0) + 1;
    }
    const library = {
      sync: await storage.getValue<{ status: string; discovered?: number; uniqueIndexed?: number; completedAt?: number; metadataFailures?: string[] }>("libraryIndex:v1") ?? undefined,
      indexed: { total: all.length, photos: stats.photos, videos: stats.videos, screenshots: all.filter(m => m.screenshot).length, livePhotos: all.filter(m => m.livePhoto).length, undated },
      native: inventory ? {
        total: inventory.length, photos: inventory.filter(m => m.type === "photo").length,
        videos: inventory.filter(m => m.type === "video").length, other: inventory.filter(m => m.type === "other").length,
        screenshots: inventory.filter(m => m.screenshot).length, livePhotos: inventory.filter(m => m.livePhoto).length,
        undated: census?.undated ?? 0, excluded, enumerable: inventory.filter(m => m.enumerable).length,
        notIndexed: inventory.filter(m => m.enumerable && !indexedIds.has(m.id)).map(m => asItem(m, "enumerable but missing from active index")),
        outsideEnumeration: inventory.filter(m => !m.enumerable).map(m => asItem(m, [m.hidden ? "hidden" : "", m.burstFrame ? "extra burst frame" : "", m.source !== "library" ? m.source : "", m.type === "other" ? "unsupported media type" : ""].filter(Boolean).join(", ") || "excluded by platform fetch")),
        stale: all.filter(m => !m.deletedAt && !liveIds.has(m.id)).map(m => asItem(m, "active index row missing from live inventory")),
      } : undefined,
    };
    return auditOnThisDay({
      library,
      indexRows: all,
      diagnosticNotes,
      day,
      date,
      rows,
      blocked,
      presence,
      session,
      census,
      indexed: { active: stats.total, photos: stats.photos, videos: stats.videos, undated },
      modifiedDates: Platform.OS === "web",
    });
  },
};
