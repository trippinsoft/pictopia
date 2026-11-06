/** Pure rules for the shared review's context, endings and deletion wording. Clock and
 * platform are passed in so every rule is testable. */
import type { AdventureKind } from "./adventures";
import type { DeletionResult } from "./types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The small corner label on a photo: the year where years vary, the month where the
 * adventure is one year, the weekday and date inside a single month. Collections and
 * cleanup show nothing because the title already says it. */
export function contextLabel(kind: AdventureKind | undefined, created: number | undefined) {
  if (!kind || created === undefined || !Number.isFinite(created) || created <= 0) return undefined;
  const d = new Date(created);
  switch (kind) {
    case "day":
    case "detour":
    case "random":
      return String(d.getFullYear());
    case "year":
    case "month":
    case "corners":
      return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    case "capsule":
      return `${DAYS[d.getDay()]} ${d.getDate()}`;
    default:
      return undefined;
  }
}

/** The date shown on every photo in review: month and year ("Oct 2024"). */
export function monthYear(created: number | undefined) {
  if (created === undefined || !Number.isFinite(created) || created <= 0) return undefined;
  const d = new Date(created);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Leaving a review: a short visit with no marks needs nothing; a meaningful one gets the
 * recap card on the screen it returns to. */
export const RECAP_VIEWS = 20;
export function recapWorthy(visit: { viewed: number; marked: number }) {
  return visit.viewed >= RECAP_VIEWS || visit.marked > 0;
}

/** What this visit added, from the session as it was opened and as it is now. Marks made and
 * then undone in the same visit don't count; neither do photos that were already explored. */
export function visitDelta(
  before: { encountered: ReadonlySet<string>; queued: ReadonlySet<string> },
  now: { ids: readonly string[]; records: Record<string, { encountered?: boolean; queued?: boolean } | undefined> },
) {
  let viewed = 0, marked = 0;
  for (const id of now.ids) {
    const r = now.records[id];
    if (r?.encountered && !before.encountered.has(id)) viewed++;
    if (r?.queued && !before.queued.has(id)) marked++;
  }
  return { viewed, marked };
}

export type DeviceOs = "ios" | "android" | "web";
/** Where deleted items go, in each platform's words. Android depends on the gallery app;
 * the precise behaviour still needs confirming on devices, so the copy stays conservative. */
function binNote(os: DeviceOs) {
  return os === "ios"
    ? "moved to Recently Deleted. iOS frees the space when that album is emptied, automatically after 30 days."
    : "removed from your library. Some gallery apps keep a Trash for up to 30 days before the space is freed.";
}

export function sizeText(bytes: number) {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  if (bytes >= 1_000_000) return `${Math.round(bytes / 1_000_000)} MB`;
  return `${Math.max(1, Math.round(bytes / 1000))} KB`;
}

const items = (n: number, kinds: { photos: number; videos: number }) =>
  kinds.videos === 0 ? (n === 1 ? "photo" : "photos") : kinds.photos === 0 ? (n === 1 ? "video" : "videos") : n === 1 ? "item" : "items";

/** The Result screen after the OS answers. `confirmedBytes` covers confirmed items with a
 * known size only, so it is an estimate and never "space freed". Cancelled and failed
 * attempts don't get a Result screen: Ready to delete stays, with `notice`. */
export function deletionOutcome(
  r: Pick<DeletionResult, "status" | "confirmed" | "remaining" | "uncertain" | "skipped">,
  os: DeviceOs,
  confirmedBytes: number,
  kinds: { photos: number; videos: number } = { photos: 1, videos: 0 },
): { screen: "result"; headline: string; details: string[] } | { screen: "stay"; notice: string } {
  const done = r.confirmed.length;
  if (!done && !r.uncertain.length) {
    return {
      screen: "stay",
      notice: r.status === "cancelled"
        ? "Nothing was deleted. Your photos are still marked."
        : r.skipped.length
          ? "Nothing was deleted. These photos changed or became unavailable, so they weren’t sent. They’re still marked."
          : "Nothing was deleted. Your photos are still marked. Please try again.",
    };
  }
  const word = items(done, kinds);
  const details: string[] = [];
  if (done) details.push(confirmedBytes > 0 ? `About ${sizeText(confirmedBytes)} ${binNote(os)}` : `${done === 1 ? "It was" : "They were"} ${binNote(os)}`);
  if (r.remaining.length) details.push(`${r.remaining.length} ${r.remaining.length === 1 ? "is" : "are"} still in your library and still marked. Try again anytime.`);
  if (r.uncertain.length) details.push(`We’ll double-check ${r.uncertain.length} more the next time you open Pictopia. ${r.uncertain.length === 1 ? "It isn’t" : "They aren’t"} counted until then.`);
  if (r.skipped.length) details.push(`${r.skipped.length} changed or became unavailable, so ${r.skipped.length === 1 ? "it wasn’t" : "they weren’t"} sent and ${r.skipped.length === 1 ? "is" : "are"} still marked.`);
  return { screen: "result", headline: done ? `${done} ${word} deleted` : "Checking your cleanup", details };
}

/** The Delete button names the exact number it will send, at most one OS request's worth. */
export const DELETE_BATCH = 100;
export function deleteLabel(kinds: { photos: number; videos: number }) {
  const n = kinds.photos + kinds.videos;
  return `Delete ${n} ${items(n, kinds)}`;
}

/** The free daily limit page: an adventure stopped by the allowance keeps its place and is
 * never complete; the only ways on are Pro or coming back. */
export function limitCopy(limit: number) {
  return {
    title: `You’ve reviewed ${limit} photos and videos today!`,
    body: `You’ve reached your daily free limit. Come back tomorrow for ${limit} more, or unlock unlimited photo and video reviews with Pictopia Pro.`,
  };
}

/** Open-ended collections report session encounters; bounded scopes report their own totals. */
export function reviewProgressLabel(scope: string | undefined, reviewed: number, position: number, total: number, percent?: number) {
  if (scope === "recent" || scope === "videos" || scope === "videos-large") return `${reviewed} reviewed this session`;
  if (scope && percent !== undefined) return `${percent}% of this ${scope.startsWith("album:") ? "album" : scope.startsWith("month:") ? "month" : scope.startsWith("year:") ? "year" : "collection"} explored`;
  return `${Math.max(1, position + 1)} of ${total}`;
}
export function moreCollectionLabel(scope: string) {
  return scope.startsWith("album:") ? "Review more from this album" : scope.startsWith("month:") ? "Review more from this month" : scope.startsWith("year:") ? "Review more from this year" : scope.startsWith("videos") ? "Review more videos" : "Review more photos";
}
