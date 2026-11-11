import type { ExploreSession } from "./explore";
import { exploreFeed } from "./explore";
import { dateKeys } from "./logic";
import { onThisDayPool } from "./photo-eligibility";
import type { Media, Presence } from "./types";

/**
 * Developer-only accounting for one On This Day date: where every indexed asset on that
 * calendar day went, step by step, so a count that differs from another app can be traced
 * to a reason instead of a guess. Pure; the service gathers the inputs. Nothing here reads
 * image bytes: only identifiers and capture timestamps.
 */

/** One asset from the platform library, read live (not from Pictopia's index). */
export interface CensusAsset {
  id: string;
  created: number;
  type: "photo" | "video" | "other";
  hidden: boolean;
  /** A burst frame that is not the burst's representative; enumeration shows one per burst. */
  burstFrame: boolean;
  source: "library" | "shared" | "synced" | "unknown";
  screenshot: boolean;
  livePhoto: boolean;
  enumerable?: boolean;
}
export interface LibraryCensus {
  /** `full`: hidden, burst frames and shared/synced sources included (native module). `expo`: the same
   * enumeration rules Pictopia's sync uses, so it can only confirm the index, not what lies beyond it. */
  scope: "full" | "expo";
  total: number;
  undated: number;
  onDate: CensusAsset[];
  /** Full metadata inventory, available on new native builds only. */
  inventory?: CensusAsset[];
}
export interface AuditItem {
  id: string;
  created: number;
  type: string;
  note?: string;
}
export type AuditStepKey = "inactive" | "verifiedDeleted" | "video" | "screenshot" | "inFlightDeletion" | "duplicateId" | "notVisible" | "invalidDate";
export interface AuditStep {
  key: AuditStepKey;
  label: string;
  /** Why this step exists, in plain words. */
  purpose: string;
  count: number;
  items: AuditItem[];
}
export interface AuditInput {
  /** MM-DD. */
  day: string;
  /** YYYY-MM-DD the user picked, when known. */
  date?: string;
  /** Every indexed row whose calendar day matches, active or not, any type. */
  rows: Media[];
  indexRows?: Media[];
  diagnosticNotes?: string[];
  /** In-flight deletion journal and pending verifications. */
  blocked: ReadonlySet<string>;
  /** Live presence lookup for the eligible ids (what `visibleIds` would see). */
  presence?: Record<string, Presence>;
  /** The saved review for this date, if one exists. */
  session?: ExploreSession;
  census?: LibraryCensus;
  library?: {
    sync?: { status: string; discovered?: number; uniqueIndexed?: number; completedAt?: number; metadataFailures?: string[] };
    indexed: { total: number; photos: number; videos: number; screenshots: number; livePhotos: number; undated: number };
    native?: { total: number; photos: number; videos: number; other: number; screenshots: number; livePhotos: number; undated: number; enumerable: number; excluded: Record<string, number>; notIndexed: AuditItem[]; outsideEnumeration: AuditItem[]; stale: AuditItem[] };
  };
  indexed: { active: number; photos: number; videos: number; undated: number };
  modifiedDates?: boolean;
}
export interface OnThisDayAudit {
  day: string;
  date?: string;
  indexed: AuditInput["indexed"];
  library?: AuditInput["library"];
  /** Rows Pictopia holds for this calendar day. */
  onDate: { total: number; photos: number; videos: number; active: number; withDates: number };
  steps: AuditStep[];
  eligible: AuditItem[];
  /** The review Pictopia would show (or shows): eligible photos that the live lookup can see. */
  displayable: number;
  review?: { count: number; feed: number; encountered: number; unavailable: number; missing: AuditItem[]; extra: string[] };
  census?: {
    scope: LibraryCensus["scope"];
    total: number;
    undated: number;
    onDate: number;
    photos: number;
    videos: number;
    screenshots: number;
    livePhotos: number;
    /** Live assets on this date that Pictopia's sync can never enumerate (Expo's fetch options). */
    beyondReach: AuditItem[];
    /** Enumerable live assets on this date that are missing from the index (sync incomplete or stale). */
    notIndexed: AuditItem[];
    /** Indexed rows the live library no longer has on this date (deleted, or date changed). */
    notInLibrary: AuditItem[];
    /** Live assets whose calendar day differs when recomputed in the current time zone. */
    dayMismatch: AuditItem[];
  };
  /** True when every indexed row on the date is either eligible or accounted for by one step. */
  reconciles: boolean;
  notes: string[];
}

const item = (m: Pick<Media, "id" | "created" | "type">, note?: string): AuditItem => ({ id: m.id, created: m.created, type: m.type, ...(note ? { note } : {}) });
const validDay = (m: Media) => typeof m.created === "number" && Number.isFinite(m.created) && m.created !== 0 && /^\d{2}-\d{2}$/.test(m.day ?? "");

export function auditOnThisDay(input: AuditInput): OnThisDayAudit {
  const { day, rows, blocked } = input;
  const steps: AuditStep[] = [];
  const step = (key: AuditStepKey, label: string, purpose: string, items: AuditItem[]) => {
    steps.push({ key, label, purpose, count: items.length, items });
  };
  const ids = new Set<string>();
  const duplicates: AuditItem[] = [];
  const unique: Media[] = [];
  for (const m of rows) {
    if (ids.has(m.id)) duplicates.push(item(m, "same identifier listed twice"));
    else { ids.add(m.id); unique.push(m); }
  }
  let remaining = unique;
  const take = (key: AuditStepKey, label: string, purpose: string, out: (m: Media) => boolean, note?: (m: Media) => string | undefined) => {
    const removed = remaining.filter(out);
    remaining = remaining.filter(m => !out(m));
    step(key, label, purpose, removed.map(m => item(m, note?.(m))));
  };
  take("inactive", "Not seen by the last complete sync", "A row whose asset the most recent full enumeration did not return; it comes back when a later sync sees it again.", m => !m.active);
  take("verifiedDeleted", "Verified deleted", "Pictopia confirmed the OS removed this item after a Delete.", m => !!m.deletedAt, m => (m.deletedAt ? `deleted ${new Date(m.deletedAt).toISOString()}` : undefined));

  take("invalidDate", "Missing capture date", "Media without a capture date stays indexed but cannot match a calendar date.", m => !validDay(m));

  take("inFlightDeletion", "Deletion in progress", "In the deletion journal or awaiting verification; shown again once resolved.", m => blocked.has(m.id));
  step("duplicateId", "Duplicate identifier", "The same id listed twice in the input; counted once. Nothing collapses quick series on this date.", duplicates);
  const eligibleRows = onThisDayPool(unique, blocked);
  const eligibleIds = new Set(eligibleRows.map(m => m.id));
  // The pure rule and the step-by-step accounting must agree.
  const unexplained = remaining.filter(m => !eligibleIds.has(m.id)).map(m => item(m, "left out by the eligibility rule for no listed reason"));
  const presence = input.presence;
  const notVisible = presence
    ? eligibleRows.filter(m => presence[m.id] !== "present").map(m => item(m, presence[m.id] === "absent" ? "the library lookup returned nothing" : "the library lookup failed or was ambiguous"))
    : [];
  step("notVisible", "Not visible at lookup", "Read-only metadata lookup. On This Day retains indexed items for rendering and retry; this does not prove that image loading or video playback succeeded.", notVisible);
  const displayable = eligibleRows.length - notVisible.length;

  let review: OnThisDayAudit["review"];
  if (input.session) {
    const feed = exploreFeed(input.session);
    const inReview = new Set(input.session.ids);
    review = {
      count: input.session.ids.length,
      feed: feed.length,
      encountered: input.session.ids.filter(id => input.session?.records[id]?.encountered).length,
      unavailable: input.session.ids.filter(id => input.session?.records[id]?.unavailable).length,
      missing: eligibleRows.filter(m => !inReview.has(m.id)).map(m => item(m, "eligible now, but not in the saved review")),
      extra: input.session.ids.filter(id => !eligibleIds.has(id)),
    };
  }

  let census: OnThisDayAudit["census"];
  if (input.census) {
    const live = input.census.onDate;
    const indexedById = new Map((input.indexRows ?? rows).map(m => [m.id, m]));
    const beyondReach: AuditItem[] = [], notIndexed: AuditItem[] = [], dayMismatch: AuditItem[] = [];
    for (const a of live) {
      const reasons: string[] = [];
      if (a.hidden) reasons.push("hidden");
      if (a.burstFrame) reasons.push("burst frame");
      if (a.source === "shared") reasons.push("iCloud shared album");
      if (a.source === "synced") reasons.push("synced from a computer");
      if (a.type === "other") reasons.push("not a photo or video");
      if (a.enumerable === false || (a.enumerable === undefined && reasons.length)) beyondReach.push({ id: a.id, created: a.created, type: a.type, note: reasons.join(", ") });
      else if (!indexedById.has(a.id)) notIndexed.push({ id: a.id, created: a.created, type: a.type, note: "enumerable but not indexed" });
      const indexed = indexedById.get(a.id);
      if (indexed && indexed.day !== day) dayMismatch.push({ id: a.id, created: a.created, type: a.type, note: `stored day is ${indexed.day}; live calendar day is ${day}` });
      else if (dateKeys(a.created).day !== day) dayMismatch.push({ id: a.id, created: a.created, type: a.type, note: `is ${dateKeys(a.created).day} in this time zone` });
    }
    const liveIds = new Set(live.map(a => a.id));
    const notInLibrary = rows.filter(m => m.active && !m.deletedAt && !liveIds.has(m.id)).map(m => item(m, "indexed, but the live library has nothing on this date with this id"));
    census = { scope: input.census.scope, total: input.census.total, undated: input.census.undated, onDate: live.length, photos: live.filter(m => m.type === "photo").length, videos: live.filter(m => m.type === "video").length, screenshots: live.filter(m => m.screenshot).length, livePhotos: live.filter(m => m.livePhoto).length, beyondReach, notIndexed, notInLibrary, dayMismatch };
  }

  const accounted = steps.filter(s => s.key !== "notVisible").reduce((n, s) => n + s.count, 0) + eligibleRows.length;
  const notes = [
    ...(input.diagnosticNotes ?? []),
    input.modifiedDates ? "Browser files only have last-modified dates; those stand in for capture dates." : "Capture dates come from the photo library and are turned into calendar days in the phone's time zone at sync time.",
    "On This Day matches the exact month and day in every year; February 29 only matches February 29.",
    "Photos already seen, already in another adventure, or discarded but not yet deleted stay in the set.",
    "The free daily allowance pauses a review; it never changes the count of the set.",
    ...(input.census?.scope === "expo" ? ["Live comparison used the same enumeration rules as sync, so hidden photos, extra burst frames and shared-album items cannot be detected on this build."] : []),
    ...(unexplained.length ? [`${unexplained.length} left out for no listed reason: ${unexplained.map(u => u.id).join(", ")}`] : []),
  ];
  return {
    day,
    date: input.date,
    indexed: input.indexed,
    library: input.library,
    onDate: {
      total: unique.length,
      photos: unique.filter(m => m.type === "photo").length,
      videos: unique.filter(m => m.type === "video").length,
      active: unique.filter(m => m.active).length,
      withDates: unique.filter(validDay).length,
    },
    steps,
    eligible: eligibleRows.map(m => item(m, [m.screenshot ? "screenshot" : "", m.livePhoto ? "Live Photo" : "", m.decision === "delete" ? "discarded, awaiting deletion" : "", m.firstSeenAt ? "seen before" : ""].filter(Boolean).join(", ") || undefined)),
    displayable,
    review,
    census,
    reconciles: accounted === unique.length && unexplained.length === 0,
    notes,
  };
}

const when = (t: number) => (typeof t === "number" && t > 0 ? new Date(t).toLocaleString() : "no date");
const list = (items: AuditItem[], limit = Number.POSITIVE_INFINITY) =>
  items.slice(0, limit).map(i => `    ${i.id} · ${when(i.created)} · ${i.type}${i.note ? ` · ${i.note}` : ""}`).concat(items.length > limit ? [`    … ${items.length - limit} more`] : []);

/** Plain-text report for sharing with a developer: identifiers and timestamps only. */
export function formatAudit(a: OnThisDayAudit) {
  const lines: string[] = [];
  lines.push(`On This Day audit · ${a.date ?? a.day}`);
  lines.push(`Indexed library: ${a.indexed.active} active (${a.indexed.photos} photos, ${a.indexed.videos} videos); ${a.indexed.undated} without a capture date`);
  if (a.library) {
    lines.push(`Library reconciliation: ${JSON.stringify(a.library.indexed)}`);
    lines.push(`Last index: ${JSON.stringify(a.library.sync ?? { status: "not recorded on this build" })}`);
    if (a.library.native) {
      const { notIndexed, outsideEnumeration, stale, ...counts } = a.library.native;
      lines.push(`PhotoKit inventory: ${JSON.stringify(counts)}`);
      lines.push(`Enumerable but missing from index: ${notIndexed.length}`, ...list(notIndexed));
      lines.push(`Outside production enumeration: ${outsideEnumeration.length}`, ...list(outsideEnumeration));
      lines.push(`Indexed but absent from live inventory: ${stale.length}`, ...list(stale));
    } else lines.push("Full-library inventory unavailable: publish a new native build. No full reconciliation is claimed.");
    lines.push("Screenshots and Live Photos are subsets of photos. Cloud residency is unknown; metadata enumeration does not download originals or prove playback.");
  }
  if (a.census) {
    lines.push(`Live library (${a.census.scope === "full" ? "all sources, hidden and bursts included" : "same rules as sync"}): ${a.census.total} assets, ${a.census.undated} undated, ${a.census.onDate} on ${a.day} (${a.census.photos} photos, ${a.census.videos} videos; ${a.census.screenshots} screenshots, ${a.census.livePhotos} Live Photos as subsets)`);
    if (a.census.beyondReach.length) { lines.push(`  Beyond Pictopia's reach: ${a.census.beyondReach.length}`); lines.push(...list(a.census.beyondReach)); }
    if (a.census.notIndexed.length) { lines.push(`  Not indexed (sync incomplete or stale): ${a.census.notIndexed.length}`); lines.push(...list(a.census.notIndexed)); }
    if (a.census.notInLibrary.length) { lines.push(`  Indexed but not in the live library on this date: ${a.census.notInLibrary.length}`); lines.push(...list(a.census.notInLibrary)); }
    if (a.census.dayMismatch.length) { lines.push(`  Calendar day differs in the current time zone: ${a.census.dayMismatch.length}`); lines.push(...list(a.census.dayMismatch)); }
  }
  lines.push(`Indexed on ${a.day}: ${a.onDate.total} (${a.onDate.photos} photos, ${a.onDate.videos} videos; ${a.onDate.active} active; ${a.onDate.withDates} with valid dates)`);
  for (const s of a.steps) if (s.count) { lines.push(`  − ${s.count} ${s.label}`); lines.push(...list(s.items)); }
  lines.push(`Eligible: ${a.eligible.length}`);
  lines.push(...list(a.eligible));
  lines.push(`Displayable after lookup: ${a.displayable}`);
  if (a.review) {
    lines.push(`Saved review: ${a.review.count} items (${a.review.feed} in the feed); ${a.review.encountered} encountered, ${a.review.unavailable} flagged unavailable`);
    if (a.review.missing.length) { lines.push(`  Eligible but not in the saved review: ${a.review.missing.length}`); lines.push(...list(a.review.missing)); }
    if (a.review.extra.length) lines.push(`  In the review but no longer eligible: ${a.review.extra.join(", ")}`);
  } else lines.push("No saved review for this date yet.");
  lines.push(a.reconciles ? "Every indexed row is accounted for." : "Some rows are NOT accounted for; see notes.");
  lines.push(...a.notes.map(n => `• ${n}`));
  return lines.join("\n");
}
