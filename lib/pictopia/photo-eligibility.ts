import type { AdventureKind } from "./adventures";
import type { Media } from "./types";

/** Classification comes from platform metadata, never shape, filenames or image content.
 * Selection policy belongs to each Adventure; library indexing and Pit Stops are independent. */
export type StillPurpose = "photographs" | "screenshots" | "all";
export function eligibleStills(pool: Media[], exclude: ReadonlySet<string> = new Set(), purpose: StillPurpose = "all") {
  return [...new Map(pool.map(m => [m.id, m])).values()].filter(m =>
    m.type === "photo" && m.active && !m.deletedAt && m.decision !== "delete" && !exclude.has(m.id)
    && (purpose === "all" || (purpose === "screenshots" ? m.screenshot : !m.screenshot)),
  );
}
export const eligiblePhotographs = (pool: Media[], exclude?: ReadonlySet<string>) => eligibleStills(pool, exclude, "photographs");
/** On This Day only looks back at earlier years: media captured in the device's current local
 * calendar year never joins it, whichever date is chosen (2026 media becomes eligible on 1 January 2027). */
export const capturedThisYear = (m: Pick<Media, "created">, now = Date.now()) =>
  Number.isFinite(m.created) && new Date(m.created).getFullYear() >= new Date(now).getFullYear();
/** On This Day is the whole date, so a photo already discarded (waiting in Discarded, not yet
 * deleted) stays in and shows faded with Restore. Only verified deletions, items the last sync
 * no longer saw, in-flight deletions (`exclude`) and media captured this calendar year leave the set. */
export const onThisDayPool = (pool: Media[], exclude: ReadonlySet<string> = new Set(), now = Date.now()) =>
  [...new Map(pool.map(m => [m.id, m])).values()].filter(m =>
    Number.isFinite(m.created) && m.created !== 0 && (m.type === "photo" || m.type === "video") && m.active && !m.deletedAt && !exclude.has(m.id) && !capturedThisYear(m, now));
/** Apply before query LIMIT, so a run of screenshots cannot crowd out eligible photos. */
export const photographQuery = { type: "photo", screenshot: false } as const;

export function adventureScreenshotPolicy(kind: AdventureKind) {
  return kind === "day" ? "include" : kind === "screenshots" ? "only"
    : kind === "detour" || kind === "random" || kind === "corners" ? "selective" : "exclude";
}
/** Query constraints are applied before paging. Mixed/date reviews support the existing video renderer. */
export function adventureMediaQuery(kind: AdventureKind) {
  const policy = adventureScreenshotPolicy(kind);
  return policy === "include" || policy === "selective" ? {}
    : policy === "only" ? { type: "photo" as const, screenshot: true } : photographQuery;
}
export function adventurePool(pool: Media[], kind: AdventureKind, exclude: ReadonlySet<string> = new Set(), now = Date.now()) {
  if (kind === "day") return onThisDayPool(pool, exclude, now);
  const policy = adventureScreenshotPolicy(kind);
  if (policy !== "selective") return eligibleStills(pool, exclude, policy === "only" ? "screenshots" : "photographs");
  return [...new Map(pool.map(m => [m.id, m])).values()].filter(m =>
    (m.type === "photo" || m.type === "video") && m.active && !m.deletedAt && m.decision !== "delete" && !exclude.has(m.id));
}
/** Keep ranked order, prefer <=20% screenshots, then relax only to fill an otherwise short set. */
export function selectMixedMedia(ordered: Media[], size: number) {
  const unique = [...new Map(ordered.map(m => [m.id, m])).values()];
  const selected = new Set<string>();
  const budget = Math.floor(size * 0.2);
  let shots = 0;
  for (const m of unique) {
    if (selected.size >= size) break;
    if (m.screenshot && shots >= budget) continue;
    selected.add(m.id);
    if (m.screenshot) shots++;
  }
  for (const m of unique) {
    if (selected.size >= size) break;
    selected.add(m.id);
  }
  return unique.filter(m => selected.has(m.id));
}
