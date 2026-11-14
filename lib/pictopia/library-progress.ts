import type { Media } from "./types";

export function calendarMonth(media: Pick<Media, "month" | "created">) {
  return Number.isFinite(media.created) && media.created > 0 && /^\d{4}-(0[1-9]|1[0-2])$/.test(media.month) ? media.month : "unknown";
}
export function explorationPercent(explored: number, total: number) {
  return total > 0 ? Math.floor(explored / total * 100) : undefined;
}

/** The one "% of your photos explored" shown on Home, Progress, Timeline and the Memory Wall.
 * Photos whose deletion the phone confirmed stay counted as explored (in both numerator and
 * denominator), so clearing photos never erases progress. "Photos remaining" is a separate
 * metric and is unaffected. Videos are not included. */
export function libraryPercent(p: { accessible: number; accessibleExplored: number; deleted?: number }) {
  const cleared = p.deleted ?? 0;
  return explorationPercent(p.accessibleExplored + cleared, p.accessible + cleared);
}
/** Same rule for one month or year of the Memory Wall. */
export function wallPercent(m: { total: number; explored: number; cleared: number }) {
  return explorationPercent(m.explored + m.cleared, m.total + m.cleared);
}
