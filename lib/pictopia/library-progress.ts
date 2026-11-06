import type { Media } from "./types";

export function calendarMonth(media: Pick<Media, "month" | "created">) {
  return Number.isFinite(media.created) && media.created > 0 && /^\d{4}-(0[1-9]|1[0-2])$/.test(media.month) ? media.month : "unknown";
}
export function explorationPercent(explored: number, total: number) {
  return total > 0 ? Math.floor(explored / total * 100) : undefined;
}
