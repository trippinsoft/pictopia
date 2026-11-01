import type { Media } from "./types";

/** Screenshots are images, but not personal photographs. Only explicit screenshot cleanup
 * may select them. Classification comes from platform metadata, never shape or filenames. */
export type StillPurpose = "photographs" | "screenshots" | "all";
export function eligibleStills(pool: Media[], exclude: ReadonlySet<string> = new Set(), purpose: StillPurpose = "all") {
  return [...new Map(pool.map(m => [m.id, m])).values()].filter(m =>
    m.type === "photo" && m.active && !m.deletedAt && m.decision !== "delete" && !exclude.has(m.id)
    && (purpose === "all" || (purpose === "screenshots" ? m.screenshot : !m.screenshot)),
  );
}
export const eligiblePhotographs = (pool: Media[], exclude?: ReadonlySet<string>) => eligibleStills(pool, exclude, "photographs");
/** Apply before query LIMIT, so a run of screenshots cannot crowd out eligible photos. */
export const photographQuery = { type: "photo", screenshot: false } as const;
