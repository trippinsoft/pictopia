import { adventureName } from "@/lib/pictopia/catalog";
import { eligiblePhotographs, photographQuery } from "@/lib/pictopia/photo-eligibility";
import { Platform } from "react-native";
import { storage, serialize } from "./repository";
import { deletionBlocked, EXPLORE_KEY, exploreStoreFor, visibleIds } from "./explore";
import { createExplore, type ExploreSession } from "@/lib/pictopia/explore";
import {
  ADVENTURE_SIZE,
  adventureSize,
  RECENT_LIMIT,
  adventureComplete,
  completionEvidence,
  completionProof,
  savedCompletion,
  adventureProgress,
  emptyIndex,
  type Adventure,
  type AdventureIndex,
  type AdventureKind,
  type LabExperiment,
} from "@/lib/pictopia/adventures";
import {
  choosePair,
  curate,
  daysAround,
  eligible,
  planCandidates,
  type Candidate,
  type CurationContext,
  type CuratedAdventure,
  type MonthProfile,
  type Plan,
} from "@/lib/pictopia/curation";
import type { Media } from "@/lib/pictopia/types";
import { addDays, localDate } from "@/lib/pictopia/daily";
import { journeyMilestone, permittedHistoryDate } from "@/lib/pictopia/journey-progress";
import { plural } from "@/lib/pictopia/text";

export const ADVENTURES_KEY = "adventures:v1";
const YEARBOOKS_KEY = "yearbookActive:v1";
const FEEDBACK_KEY = "adventureFeedback:v1";
const LAB_KEY = "adventureLab:v1";
const metaKey = (id: string) => `adventure:${id}`;
/** Each Adventure's exploration session, in the explorer's own format. */
export const adventureSessionKey = (id: string) => `adventure:${id}:explore`;
export interface AdventureSlot {
  adventure: Adventure;
  session: ExploreSession;
}
export type RatingKey = "curiosity" | "enjoyment" | "curation" | "cleanup" | "continue";
export const RATING_LABELS: Record<RatingKey, string> = {
  curiosity: "Curiosity",
  enjoyment: "Enjoyment",
  curation: "Curation quality",
  cleanup: "Cleanup usefulness",
  continue: "Want to continue",
};
export interface AdventureFeedback {
  id: string;
  kind: AdventureKind;
  at: number;
  /** "More like this?" */
  like?: boolean;
  /** Adventure Lab ratings, 1–5 each. */
  ratings?: Partial<Record<RatingKey, number>>;
}
/** What Explore offers: only what the library really has. */
export type ExploreChoice =
  | { kind: "year"; year: string }
  | { kind: "month"; month: string }
  | { kind: "day"; date?: string }
  | { kind: "detour" }
  | { kind: "capsule" }
  | { kind: "screenshots" };

// Presentation-only normalization preserves legacy IDs, frozen photos and all review records.
const loadMeta = async (id: string) => {
  const adventure = await storage.getValue<Adventure>(metaKey(id));
  return adventure && (adventure.kind === "year" || adventure.kind === "month")
    ? { ...adventure, hint: { ...adventure.hint, title: adventureName(adventure.kind) } } : adventure;
};
const loadSession = (id: string) => exploreStoreFor(adventureSessionKey(id)).load();
const loadFeedback = async () => (await storage.getValue<AdventureFeedback[]>(FEEDBACK_KEY)) ?? [];
const remember = (index: AdventureIndex, source: string) => {
  index.recent = [...index.recent.filter((s) => s !== source), source].slice(-RECENT_LIMIT);
};
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** Reads the index, retiring Home's old 100-photo Adventures once: unstarted ones are
 * dropped (nothing was seen), started ones stay resumable from Explore. */
async function loadIndex() {
  const index = (await storage.getValue<AdventureIndex>(ADVENTURES_KEY)) ?? emptyIndex();
  if (index.curated) return index;
  for (const id of index.slots) {
    const [meta, session] = await Promise.all([loadMeta(id), loadSession(id)]);
    if (meta?.startedAt && !adventureComplete(session) && !index.parked.includes(id))
      index.parked.push(id);
  }
  index.slots = [];
  index.curated = true;
  await storage.setValue(ADVENTURES_KEY, index);
  return index;
}
async function chunks<T>(ids: string[], read: (ids: string[]) => Promise<T[]>) {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 400) out.push(...(await read(ids.slice(i, i + 400))));
  return out;
}
const readMedia = (ids: string[]) =>
  chunks(ids, (part) => storage.query({ ids: part, limit: part.length }));

/** A legacy frozen photo adventure may include screenshots. Retire the whole offer;
 * its original session remains intact for Journey and set-aside recovery. */
async function validPhotoOffer(adventure: Adventure, session: ExploreSession) {
  if (adventure.kind === "screenshots") return true;
  return !(await readMedia(session.ids)).some(m => m.screenshot);
}
/** Select a single existing journey per year without modifying any snapshot or media.
 * A valid canonical choice stays stable. Older unindexed duplicates are resolved by
 * most recent activity, never by furthest position (the user may have backtracked). */
async function resolveYearbooks(index: AdventureIndex, onlyYear?: string) {
  const stored = (await storage.getValue<Record<string, string>>(YEARBOOKS_KEY)) ?? {};
  const active = { ...stored }, out: AdventureSlot[] = [];
  const candidates = new Map<string, { slot: AdventureSlot; activity: number; meaningful: boolean }[]>();
  const loaded = new Map<string, AdventureSlot | undefined>();
  const read = async (id: string) => {
    if (loaded.has(id)) return loaded.get(id);
    const adventure = await loadMeta(id);
    if (adventure?.kind !== "year" || adventure.lab || !/^year:\d{4}$/.test(adventure.source) || (onlyYear && adventure.source !== `year:${onlyYear}`)) {
      loaded.set(id, undefined); return undefined;
    }
    const session = await loadSession(id);
    const slot = session?.ids.length && await validPhotoOffer(adventure, session) ? { adventure, session } : undefined;
    loaded.set(id, slot); return slot;
  };
  for (const id of new Set([...Object.values(stored), ...index.started, ...index.parked])) {
    const slot = await read(id);
    if (!slot || slot.adventure.finishedAt) continue;
    const { adventure, session } = slot;
    const meaningful = !!session.finished || session.ids.some(id => session.records[id]?.encountered || session.records[id]?.queued);
    if (!adventure.chosen && !adventure.startedAt && !meaningful) continue;
    const savedActivity = await storage.getValue<number>(`activity:${adventureSessionKey(id)}`);
    const times = [savedActivity, adventure.openedAt, adventure.startedAt, adventure.createdAt].filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const year = adventure.source.slice(5);
    candidates.set(year, [...(candidates.get(year) ?? []), { slot, meaningful, activity: Math.max(0, ...times) }]);
  }
  for (const year of new Set([...(onlyYear ? [onlyYear] : Object.keys(stored)), ...candidates.keys()])) {
    const mapped = stored[year] ? await read(stored[year]) : undefined;
    if (mapped?.adventure.source === `year:${year}`) {
      // A completed canonical journey must not resurrect an older duplicate.
      if (!mapped.adventure.finishedAt) out.push(mapped);
      continue;
    }
    const selected = candidates.get(year)?.sort((a, b) => Number(b.meaningful) - Number(a.meaningful) || b.activity - a.activity || b.slot.adventure.id.localeCompare(a.slot.adventure.id))[0]?.slot;
    if (selected) { active[year] = selected.adventure.id; out.push(selected); }
  }
  if (Object.keys(active).some(year => active[year] !== stored[year])) await storage.setValue(YEARBOOKS_KEY, active);
  return { active, slots: out };
}

/** Sessions for every Adventure the user has started, plus the original explorer. */
async function journeySessions(index: AdventureIndex) {
  const current = await Promise.all([...index.started.map(loadSession), exploreStoreFor(EXPLORE_KEY).load()]);
  const archived: (ExploreSession | undefined)[] = [];
  for (const id of index.started) {
    const a = await loadMeta(id);
    for (const key of a?.segmentKeys ?? []) archived.push(await exploreStoreFor(key).load());
  }
  return [...current, ...archived];
}
/** Per-kind preference from ratings and "More like this?" answers, -1 … 1. */
function affinityFrom(feedback: AdventureFeedback[]) {
  const sums: Partial<Record<AdventureKind, { total: number; n: number }>> = {};
  for (const f of feedback) {
    const values = [
      ...(f.like === undefined ? [] : [f.like ? 1 : -1]),
      ...Object.values(f.ratings ?? {}).map((r) => ((r ?? 3) - 3) / 2),
    ];
    if (!values.length) continue;
    const entry = (sums[f.kind] ??= { total: 0, n: 0 });
    entry.total += values.reduce((a, b) => a + b, 0) / values.length;
    entry.n++;
  }
  const affinity: Partial<Record<AdventureKind, number>> = {},
    count: Partial<Record<AdventureKind, number>> = {};
  for (const [kind, { total, n }] of Object.entries(sums) as [AdventureKind, { total: number; n: number }][]) {
    affinity[kind] = total / n;
    count[kind] = n;
  }
  return { affinity, count };
}
/** Everything the engine knows about the library and the user's Journey so far. */
async function curationContext(index: AdventureIndex, seed: number) {
  const sessions = await journeySessions(index);
  const { exploredIds } = adventureProgress(sessions);
  const recent = [...index.started.slice(-6), ...index.slots];
  const recentSessions = await Promise.all(recent.map(loadSession));
  const recentIds = new Set(recentSessions.flatMap((s) => s?.ids ?? []));
  const { affinity, count } = affinityFrom(await loadFeedback());
  const ctx: CurationContext = {
    seed,
    now: Date.now(),
    explored: exploredIds,
    recentSources: index.recent,
    recentIds,
    exclude: await deletionBlocked(),
    affinity,
    feedbackCount: count,
    modifiedDates: Platform.OS === "web",
  };
  return ctx;
}
async function monthProfiles(explored: ReadonlySet<string>): Promise<MonthProfile[]> {
  const months = await storage.months(true);
  const byMonth = new Map<string, number>();
  for (const m of await readMedia([...explored]))
    if (m.type === "photo" && !m.screenshot) byMonth.set(m.month, (byMonth.get(m.month) ?? 0) + 1);
  return months.map((m) => ({
    key: m.key,
    count: m.count,
    reviewed: m.reviewed,
    explored: byMonth.get(m.key) ?? 0,
  }));
}
const hasScreenshots = async () =>
  !!(await storage.query({ type: "photo", screenshot: true, limit: 1 })).length;

/** Metadata-only scope pages; never reads image bytes or hundreds of originals. */
async function scopeRows(kind: AdventureKind, source: string) {
  const rows: Media[] = [];
  const query = kind === "screenshots" ? { type: "photo" as const, screenshot: true }
    : { ...photographQuery, ...(source.startsWith("year:") ? { year: source.slice(5) }
      : source.startsWith("month:") ? { month: source.slice(6) }
      : source.startsWith("day:") ? { day: source.slice(4, 9) } : {}) };
  // Query supports month/day but not year; filter metadata after paging.
  for (let offset = 0; ; offset += 200) {
    const page = await storage.query({ ...query, order: "oldest", offset, limit: 200 });
    rows.push(...page.filter(m => !source.startsWith("year:") || m.month.startsWith(source.slice(5) + "-")));
    if (page.length < 200) break;
  }
  return rows;
}
async function loadCandidate(plan: Plan, _ctx: CurationContext): Promise<Candidate> {
  const rows = await scopeRows(plan.kind, plan.source);
  const pool = plan.kind === "corners" && plan.months ? rows.filter(m => plan.months!.includes(m.month)) : rows;
  return { kind: plan.kind, source: plan.source, pool, capped: false, reason: plan.reason };
}
// On This Day is its whole date, so it has no "more" to continue into.
const extendable = (a: Adventure) => !!a.source && !a.lab && ["year", "month", "capsule", "screenshots", "detour", "random"].includes(a.kind);
async function scopeStatus(a: Adventure) {
  const rows = await scopeRows(a.kind, a.source);
  const blocked = await deletionBlocked();
  const eligibleRows = rows.filter(m => m.active && !m.deletedAt && !blocked.has(m.id));
  const explored = eligibleRows.filter(m => !!m.firstSeenAt).length;
  const remaining = eligibleRows.filter(m => !m.firstSeenAt && m.decision !== "delete");
  const pendingUnseen = eligibleRows.filter(m => !m.firstSeenAt && m.decision === "delete").length;
  return { total: eligibleRows.length, explored, remaining, complete: eligibleRows.length > 0 && explored === eligibleRows.length && pendingUnseen === 0 };
}
async function nextSegment(a: Adventure, session: ExploreSession, retryUnavailable = false) {
  if (!extendable(a) || !session.finished) return a;
  const status = await scopeStatus(a);
  // Never repeat a failed item in the immediate next segment. It remains unresolved and
  // prevents a false completion; another visit can retry when access/network recovers.
  const attempted = new Set(session.ids);
  const fresh = status.remaining.filter(m => !attempted.has(m.id));
  const pool = fresh.length || !retryUnavailable ? fresh : status.remaining;
  if (!pool.length) return a;
  const index = await loadIndex();
  const ctx = { ...(await curationContext(index, Date.now())), chosen: true, exclude: await deletionBlocked() };
  const curated = curate({ kind: a.kind, source: a.source, pool }, ctx);
  if (!curated) return a;
  const archive = `adventure:${a.id}:segment:${a.segment ?? 0}:explore`;
  const updated = { ...a, count: curated.ids.length, segment: (a.segment ?? 0) + 1, segmentKeys: [...(a.segmentKeys ?? []), archive], finishedAt: undefined, completionProof: undefined };
  await storage.put([], { [archive]: session, [adventureSessionKey(a.id)]: { ...createExplore(curated.ids), review: true, instructionsDismissed: true }, [metaKey(a.id)]: updated });
  return updated;
}

/** Stores a curated Adventure with its frozen order. Photos that turn out not to be
 * visible are dropped and the Adventure is re-curated without them, so the hint stays true. */
async function persist(
  curated: CuratedAdventure,
  candidate: Candidate,
  ctx: CurationContext,
  extra: Partial<Adventure> = {},
  write = true,
) {
  let result = curated;
  let ids = await visibleIds(curated.ids);
  if (ids.length < curated.ids.length) {
    const missing = new Set(curated.ids.filter((id) => !ids.includes(id)));
    const again = curate(candidate, { ...ctx, exclude: new Set([...(ctx.exclude ?? []), ...missing]) });
    if (!again) return undefined;
    result = again;
    ids = await visibleIds(again.ids);
    if (ids.length < again.ids.length) return undefined;
  }
  const adventure: Adventure = {
    version: 1,
    id: newId(),
    kind: result.kind,
    source: result.source,
    hint: result.hint,
    closing: result.closing,
    count: ids.length,
    createdAt: Date.now(),
    diagnostics: result.diagnostics,
    ...extra,
  };
  // One tap goes straight into the photos: no instruction screen.
  const session = { ...createExplore(ids), review: true, instructionsDismissed: true };
  if (write) {
    await storage.setValue(adventureSessionKey(adventure.id), session);
    await storage.setValue(metaKey(adventure.id), adventure);
  }
  return { adventure, session };
}

async function curateAll(plans: Plan[], ctx: CurationContext) {
  const out: { curated: CuratedAdventure; candidate: Candidate }[] = [];
  for (const plan of plans) {
    const candidate = await loadCandidate(plan, ctx);
    const curated = curate(candidate, ctx);
    if (curated) out.push({ curated, candidate });
  }
  return out;
}

/** Fills Home's empty (or, when refreshing, all) slots with the best-scoring pair. Call inside
 * serialize(). */
async function homeSlots(seed: number, refresh: boolean) {
  const index = await loadIndex();
  let changed = false;
  // Positional: a finished Adventure's replacement takes its place, so B stays B.
  const kept: (AdventureSlot | undefined)[] = [];
  // "Show me two more": both choices make way. Started ones stay resumable from Explore;
  // the replacements avoid their sources and photos.
  const avoidSources = new Set<string>(),
    avoidIds = new Set<string>();
  const shown: AdventureSlot[] = [];
  for (const id of index.slots.slice(0, 2)) {
    const [adventure, session] = await Promise.all([loadMeta(id), loadSession(id)]);
    const dayAvailable = adventure?.kind !== "day" || (adventure.source === `day:${daysAround(Date.now(), 0)[0]}` && (await scopeRows("day", adventure.source)).length > 0);
    const live = adventure && session && !adventure.finishedAt && dayAvailable && await validPhotoOffer(adventure, session);
    if (!live) {
      changed = true;
      if (adventure?.startedAt && !adventure.finishedAt && !index.parked.includes(id)) index.parked.unshift(id);
    }
    if (live && refresh) {
      avoidSources.add(adventure.source);
      session.ids.forEach((photo) => avoidIds.add(photo));
      if (adventure.startedAt && !index.parked.includes(id)) index.parked.unshift(id);
      changed = true;
    }
    if (live) shown.push({ adventure, session });
    kept.push(live && !refresh ? { adventure, session } : undefined);
  }
  while (kept.length < 2) kept.push(undefined);
  const holes = kept.flatMap((slot, i) => (slot ? [] : [i]));
  if (holes.length) {
    const ctx = await curationContext(index, seed);
    const other = kept.find(Boolean);
    const blocked = ctx.exclude;
    ctx.exclude = new Set([...(ctx.exclude ?? []), ...(other?.session.ids ?? []), ...avoidIds]);
    const profiles = await monthProfiles(ctx.explored);
    const plans = planCandidates(profiles, {
      now: ctx.now!,
      seed,
      screenshots: await hasScreenshots(),
      recentSources: index.recent,
    });
    let all = await curateAll(plans, ctx);
    let browserShortPair = false;
    // Browser imports often put every photo in one recent month (file modification dates).
    // The themed plans can all be ineligible despite enough real photos for a review.
    if (!all.length && profiles.length) {
      const libraryPlan: Plan = {
        kind: "random",
        source: "library:all",
        months: profiles.map((m) => m.key),
        reason: "A selection from the photos available in your library.",
      };
      all = await curateAll([libraryPlan], ctx);
    }
    // A small browser selection may not support the usual ten-photo plans. Offer two
    // different journeys through real selected files, even when they were seen before.
    // The shared photos in an already-started choice remain untouched.
    if (!refresh && Platform.OS === "web" && profiles.length && all.length < holes.length + (other ? 0 : 1)) {
      const libraryPlan: Plan = {
        kind: "random", source: "library:all", months: profiles.map((m) => m.key),
        reason: "A selection from the photos available in your library.",
      };
      const library = await loadCandidate(libraryPlan, ctx);
      const available = eligible(library.pool, blocked);
      if (available.length >= 2) {
        const byYear = new Map<string, string[]>();
        for (const profile of profiles) {
          const year = profile.key.slice(0, 4);
          byYear.set(year, [...(byYear.get(year) ?? []), profile.key]);
        }
        const [year, months] = [...byYear].sort((a, b) =>
          b[1].reduce((sum, key) => sum + (profiles.find((p) => p.key === key)?.count ?? 0), 0)
          - a[1].reduce((sum, key) => sum + (profiles.find((p) => p.key === key)?.count ?? 0), 0)
        )[0];
        const periodPlan: Plan = {
          kind: "year", source: `year:${year}`, months,
          reason: `A closer look at photos from ${year}.`,
        };
        const shortCtx: CurationContext = {
          ...ctx, chosen: true, exclude: blocked,
          size: Math.min(ADVENTURE_SIZE, Math.max(2, Math.ceil(available.length / 2))),
        };
        const short = await curateAll([libraryPlan, periodPlan], shortCtx);
        if (short.length >= (other ? 1 : 2)) {
          all = short;
          ctx.chosen = true;
          ctx.exclude = blocked;
          ctx.size = shortCtx.size;
          browserShortPair = true;
        }
      }
    }
    // Automatic refills may revisit older sources. Explicit refresh avoids both recent
    // pairs; a small library keeps its current offer when a fresh pair is unavailable.
    const avoid = new Set([
      ...(other ? [other.adventure.source] : []),
      ...index.recent.slice(refresh ? -4 : -2),
      ...avoidSources,
    ]);
    const varied = all.filter((m) => !avoid.has(m.curated.source));
    // "Shuffle" relaxes step by step rather than doing nothing: first avoid recent pairs, then
    // only the pair on screen (its photos are always excluded), then anything with new photos.
    const attempts = refresh
      ? [varied, all.filter((m) => !avoidSources.has(m.curated.source)), all]
      : [varied.length >= (other ? 1 : 2) ? varied : all];
    const recentBefore = [...index.recent];
    let fill: (AdventureSlot | undefined)[] = [];
    let made = attempts[0];
    for (const attempt of attempts) {
      made = attempt;
      index.recent = [...recentBefore];
      fill = [];
      const pair = choosePair(
        made.map((m) => m.curated),
        other && { kind: other.adventure.kind, source: other.adventure.source, ids: other.session.ids },
      );
      const taken = new Set<string>(other?.session.ids ?? []);
      for (const curated of pair) {
        const found = made.find((m) => m.curated.source === curated.source)!;
        // The second of a fresh pair never repeats a photo from the first.
        const overlap = curated.ids.some((id) => taken.has(id));
        const withoutTaken = overlap
          ? curate(found.candidate, { ...ctx, exclude: new Set([...(ctx.exclude ?? []), ...taken]) })
          : curated;
        const final = withoutTaken ?? (browserShortPair ? curated : undefined);
        if (!final) continue;
        const stored = await persist(
          { ...final, diagnostics: { ...final.diagnostics, pairing: curated.diagnostics.pairing } },
          found.candidate,
          { ...ctx, exclude: new Set([...(ctx.exclude ?? []), ...(withoutTaken ? taken : [])]) },
          {},
          !refresh,
        );
        if (!stored) continue;
        stored.adventure.diagnostics!.alternatives = made
          .filter((m) => m.curated.source !== curated.source)
          .sort((a, b) => b.curated.diagnostics.total - a.curated.diagnostics.total)
          .slice(0, 5)
          .map((m) => ({ title: m.curated.hint.title, detail: m.curated.hint.detail, total: m.curated.diagnostics.total }));
        if (!refresh) await storage.setValue(metaKey(stored.adventure.id), stored.adventure);
        stored.session.ids.forEach((id) => taken.add(id));
        remember(index, stored.adventure.source);
        fill.push(stored);
      }
      if (!refresh || fill.length >= 2) break;
    }
    // Prepare and validate both before publishing either. Exhaustion must not replace a
    // pair with one card, repeat its source, or leave half-created offers in storage.
    if (refresh) {
      if (fill.length < 2) return { slots: shown, unchanged: true };
      for (const slot of fill) {
        if (!slot) continue;
        await storage.setValue(adventureSessionKey(slot.adventure.id), slot.session);
        await storage.setValue(metaKey(slot.adventure.id), slot.adventure);
      }
    }
    for (const i of holes) kept[i] = fill.shift();
    changed = true;
  }
  // A library that supports only one Adventure shows it first.
  const slots = kept.filter((slot): slot is AdventureSlot => !!slot);
  if (changed || slots.length !== index.slots.length) {
    index.slots = slots.map((slot) => slot.adventure.id);
    await storage.setValue(ADVENTURES_KEY, index);
  }
  return { slots, unchanged: false };
}

/** Only writes Adventure keys. Never touches media records, production decisions, the
 * deletion queue or journals, and never deletes. */
export const adventureStore = {
  async segmentStatus(id: string) {
    return serialize(async () => {
      const a = await loadMeta(id);
      if (!a || !extendable(a)) return undefined;
      const status = await scopeStatus(a);
      const session = await loadSession(id);
      const attempted = new Set(session?.ids ?? []);
      const pool = status.remaining.filter(m => !attempted.has(m.id));
      const nextCount = curate({ kind: a.kind, source: a.source, pool }, { seed: 0, chosen: true, size: adventureSize(a.kind), explored: new Set(), modifiedDates: Platform.OS === "web" })?.ids.length ?? 0;
      const milestone = journeyMilestone(status.explored, status.total, a.milestones ?? []);
      return { total: status.total, explored: status.explored, complete: status.complete, nextCount, milestone: milestone.highest };
    });
  },
  async continue(id: string) {
    return serialize(async () => {
      const a = await loadMeta(id), s = await loadSession(id);
      if (!a || !s) throw Error("Adventure not found.");
      return nextSegment(a, s);
    });
  },
  async history(now = Date.now()) {
    const today = localDate(now);
    return Promise.all(Array.from({ length: 8 }, async (_, i) => {
      const date = addDays(today, -i);
      const day = date.slice(5);
      return { date, count: (await scopeRows("day", `day:${day}`)).length };
    }));
  },
  /** Home's two Adventures, chosen by the engine as a pair. A finished one is replaced by the
   * best partner for the other; an unfinished one stays until it is done. */
  async home(seed = Date.now()) {
    return serialize(() => homeSlots(seed, false));
  },
  /** "Show me two more": a genuinely new pair, never the two just shown. */
  async refresh(seed = Date.now()) {
    return serialize(() => homeSlots(seed, true));
  },
  /** The user tapped an Adventure: mark it started (once) so it resumes. */
  async open(id: string, pro = false) {
    return serialize(async () => {
      const index = await loadIndex();
      let adventure = await loadMeta(id);
      if (!adventure) throw Error("This adventure couldn’t be found.");
      if (adventure.historyPro && !pro) throw Error("Past-date Adventures require Pictopia+.");
      const session = await loadSession(id);
      if (session && !await validPhotoOffer(adventure, session)) throw Error("This older adventure contains screenshots. Choose a fresh photo adventure in Explore.");
      const now = Date.now();
      await storage.setValue(metaKey(id), {
        ...adventure,
        startedAt: adventure.startedAt ?? now,
        openedAt: now,
      });
      if (!index.started.includes(id)) {
        index.started.push(id);
        remember(index, adventure.source);
        await storage.setValue(ADVENTURES_KEY, index);
      }
      return adventure;
    });
  },
  /** Explore: builds the chosen Adventure. It doesn't take a Home slot; while unfinished it
   * waits in Explore's "Continue". */
  async choose(choice: ExploreChoice, seed = Date.now(), pro = false) {
    return serialize(async () => {
      if (choice.kind === "year" && !/^\d{4}$/.test(choice.year)) return undefined;
      if (choice.kind === "day" && !permittedHistoryDate(choice.date ?? localDate(Date.now()), localDate(Date.now()), pro)) throw Error("Previous dates require Pictopia+ and must be within the last seven days.");
      const index = await loadIndex();
      const canonical = choice.kind === "year" ? await resolveYearbooks(index, choice.year) : undefined;
      const yearbooks = canonical?.active ?? {};
      if (choice.kind === "year") {
        const existing = canonical?.slots.find(slot => slot.adventure.source === `year:${choice.year}`);
        if (existing) return existing.session.finished ? nextSegment(existing.adventure, existing.session, true) : existing.adventure;
      }
      const ctx: CurationContext = { ...(await curationContext(index, seed)), chosen: true };
      const now = choice.kind === "day" && choice.date ? new Date(`${choice.date}T12:00:00`).getTime() : ctx.now!;
      if (choice.kind === "day") {
        const date = choice.date ?? localDate(now);
        const mapping = await storage.getValue<Record<string, string>>("onThisDayActive:v1") ?? {};
        const existing = mapping[date] ? await loadMeta(mapping[date]) : undefined;
        const session = existing ? await loadSession(existing.id) : undefined;
        // One On This Day per date: reopening it, finished or not, shows the same whole set.
        if (existing && session) return existing;
      }
      const plan: Plan | undefined =
        choice.kind === "year"
          ? {
              kind: "year",
              source: `year:${choice.year}`,
              months: (await storage.months(true)).map((m) => m.key).filter((k) => k.startsWith(`${choice.year}-`)),
              reason: `You chose ${choice.year}.`,
            }
          : choice.kind === "month"
            ? { kind: "month", source: `month:${choice.month}`, months: [choice.month], reason: "You chose this month." }
            : choice.kind === "screenshots"
              ? { kind: "screenshots", source: "screenshots", screenshots: true, reason: "You chose a screenshot sweep." }
              : choice.kind === "day"
                ? {
                    kind: "day",
                    source: `day:${daysAround(now, 0)[0]}`,
                    days: daysAround(now, 0),
                    reason: "You chose On This Day.",
                  }
                : planCandidates(await monthProfiles(ctx.explored), {
                    now,
                    seed,
                    screenshots: false,
                    recentSources: index.recent,
                  }).find((p) => p.kind === (choice.kind === "capsule" ? "capsule" : "detour"));
      if (!plan) return undefined;
      const candidate = await loadCandidate(plan, ctx);
      const curated = curate(candidate, ctx);
      if (!curated) return undefined;
      const made = await persist(curated, candidate, ctx, { chosen: true, ...(choice.kind === "day" ? { dayDate: choice.date ?? localDate(now), historyPro: (choice.date ?? localDate(now)) < localDate(Date.now()) } : {}) }, false);
      if (!made) return undefined;
      index.parked = [made.adventure.id, ...index.parked.filter((id) => id !== made.adventure.id)];
      await storage.put([], {
        [adventureSessionKey(made.adventure.id)]: made.session,
        [metaKey(made.adventure.id)]: made.adventure,
        [ADVENTURES_KEY]: index,
        ...(choice.kind === "year" ? { [YEARBOOKS_KEY]: { ...yearbooks, [choice.year]: made.adventure.id } } : {}),
        ...(choice.kind === "day" ? { "onThisDayActive:v1": { ...(await storage.getValue<Record<string, string>>("onThisDayActive:v1") ?? {}), [choice.date ?? localDate(now)]: made.adventure.id } } : {}),
      });
      return made.adventure;
    });
  },
  /** What Explore can offer. Videos aren't: the explorer shows still photos only. */
  async choices(now = Date.now()) {
    // Still photos only: videos aren't explored.
    const months = (await storage.months(true)).filter((m) => (m.photos ?? m.count) > 0 && /^\d{4}-(0[1-9]|1[0-2])$/.test(m.key));
    const years = [...new Set(months.map((m) => m.key.slice(0, 4)))].sort().reverse();
    const photos = Object.fromEntries(months.map((m) => [m.key, m.photos ?? m.count]));
    const yearPhotos = Object.fromEntries(
      years.map((y) => [y, months.filter((m) => m.key.startsWith(y)).reduce((sum, m) => sum + (m.photos ?? m.count), 0)]),
    );
    const monthsByYear = Object.fromEntries(
      years.map((y) => [y, months.filter((m) => m.key.startsWith(y)).map((m) => m.key).sort()]),
    );
    const dayCount = (await scopeRows("day", `day:${daysAround(now, 0)[0]}`)).length;
    return {
      years,
      monthsByYear,
      photos,
      yearPhotos,
      day: dayCount > 0,
      dayCount,
      detour: years.length >= 2,
      // Time Capsule: Pictopia picks a month with at least 20 photos.
      capsule: months.some((m) => (m.photos ?? m.count) >= 20),
      screenshots: await hasScreenshots(),
    };
  },
  /** "Review these photos" after a Pit Stop: an Adventure of exactly those photos, in the
   * order they were played. It waits in Explore's Continue like any chosen one. */
  async fromPhotos(ids: string[], game: string) {
    return serialize(async () => {
      const index = await loadIndex();
      const blocked = await deletionBlocked();
      const unique = [...new Set(ids)];
      const rows = unique.length ? await storage.query({ ids: unique, limit: unique.length }) : [];
      const allowed = new Set(eligiblePhotographs(rows, blocked).map(photo => photo.id));
      const visible = await visibleIds(unique.filter(id => allowed.has(id)));
      if (!visible.length) return undefined;
      const adventure: Adventure = {
        version: 1,
        id: newId(),
        kind: "pitstop",
        source: `pitstop:${game}`,
        hint: { title: "Pit Stop Photos", detail: `${plural(visible.length, "photo")} from ${game}` },
        closing: "Back on the road.",
        count: visible.length,
        createdAt: Date.now(),
        chosen: true,
      };
      await storage.setValue(adventureSessionKey(adventure.id), {
        ...createExplore(visible),
        review: true,
        instructionsDismissed: true,
      });
      await storage.setValue(metaKey(adventure.id), adventure);
      index.parked = [adventure.id, ...index.parked];
      await storage.setValue(ADVENTURES_KEY, index);
      return adventure;
    });
  },
  /** One canonical active journey per year, including existing saved selections. */
  async yearbooks(): Promise<AdventureSlot[]> {
    return serialize(async () => (await resolveYearbooks(await loadIndex())).slots);
  },
  /** Home reads one serialized set of saved sessions, rather than mixing refreshed
   * parked journeys with an older featured-card snapshot. */
  async resumable() {
    return serialize(async () => {
      const index = await loadIndex(); const out: AdventureSlot[] = [];
      const { active } = await resolveYearbooks(index);
      for (const id of new Set([...index.started, ...index.parked, ...index.slots])) {
        const adventure = await loadMeta(id), session = await loadSession(id);
        if (adventure?.kind === "year" && !adventure.lab && active[adventure.source.slice(5)] !== id) continue;
        if (adventure?.startedAt && !adventure.finishedAt && session && await validPhotoOffer(adventure, session)) out.push({ adventure, session });
      }
      return out;
    });
  },
  async unfinished() {
    return serialize(async () => {
      const index = await loadIndex();
      const { active } = await resolveYearbooks(index);
      const out: AdventureSlot[] = [];
      const keep: string[] = [];
      for (const id of index.parked) {
        const [adventure, session] = await Promise.all([loadMeta(id), loadSession(id)]);
        if (!adventure || !session || adventure.finishedAt || !await validPhotoOffer(adventure, session)) continue;
        keep.push(id);
        if (adventure.kind === "year" && !adventure.lab && active[adventure.source.slice(5)] !== id) continue;
        out.push({ adventure, session });
      }
      if (keep.length !== index.parked.length) {
        index.parked = keep;
        await storage.setValue(ADVENTURES_KEY, index);
      }
      return out;
    });
  },
  /** Counts a finish once. Returns whether to ask "More like this?" (occasionally: never for
   * Lab experiments, and at most every third finished Adventure). */
  async finish(id: string) {
    return serialize(async () => {
      const adventure = await loadMeta(id);
      const session = await loadSession(id);
      if (!adventure || !session || !completionEvidence(session)) return { ask: false };
      if (extendable(adventure)) {
        const status = await scopeStatus(adventure);
        const award = journeyMilestone(status.explored, status.total, adventure.milestones ?? []);
        const milestones = [...new Set([...(adventure.milestones ?? []), ...award.crossed])];
        await storage.setValue(metaKey(id), { ...adventure, milestones });
        if (!status.complete) return { ask: false };
      }
      const index = await loadIndex();
      const feedback = await loadFeedback();
      const answered = feedback.some((f) => f.id === id);
      if (!adventure.finishedAt || (!savedCompletion(adventure, session) && !!session.completionVerifiedAt)) {
        if (!adventure.finishedAt) index.finished = (index.finished ?? 0) + 1;
        const completed = index.finished ?? 0;
        const due = !adventure.lab && completed >= 2 && completed - (index.askedAt ?? 0) >= 3;
        if (due) index.askedAt = index.finished;
        const at = adventure.finishedAt ?? Date.now();
        await storage.put([], { [metaKey(id)]: { ...(await loadMeta(id)), priorCompletionProof: adventure.completionProof, finishedAt: at, completionProof: completionProof(session, at) }, [ADVENTURES_KEY]: index });
        return { ask: due && !answered };
      }
      return { ask: false };
    });
  },
  async feedback(id: string) {
    return (await loadFeedback()).find((f) => f.id === id);
  },
  /** Saves "More like this?" or Lab ratings. Personalizes later curation by kind. */
  async setFeedback(adventure: Pick<Adventure, "id" | "kind">, patch: Partial<Pick<AdventureFeedback, "like" | "ratings">>) {
    return serialize(async () => {
      const list = await loadFeedback();
      const existing = list.find((f) => f.id === adventure.id);
      const next: AdventureFeedback = {
        id: adventure.id,
        kind: adventure.kind,
        at: Date.now(),
        ...existing,
        ...patch,
        ratings: { ...existing?.ratings, ...patch.ratings },
      };
      await storage.setValue(FEEDBACK_KEY, [...list.filter((f) => f.id !== adventure.id), next]);
      return next;
    });
  },
  /** Adventure Lab: the three experiments, each frozen until deliberately regenerated. */
  async lab() {
    const state = (await storage.getValue<Partial<Record<LabExperiment, string>>>(LAB_KEY)) ?? {};
    const feedback = await loadFeedback();
    const out: Partial<Record<LabExperiment, AdventureSlot & { feedback?: AdventureFeedback }>> = {};
    for (const [key, id] of Object.entries(state) as [LabExperiment, string][]) {
      const [adventure, session] = await Promise.all([loadMeta(id), loadSession(id)]);
      if (adventure && session && await validPhotoOffer(adventure, session)) out[key] = { adventure, session, feedback: feedback.find((f) => f.id === id) };
    }
    return out;
  },
  /** Generates (or regenerates) one Lab experiment from real photos. The best-scoring
   * candidate of that kind wins; the others are recorded as alternatives. */
  async generateLab(experiment: LabExperiment, seed = Date.now()) {
    return serialize(async () => {
      const index = await loadIndex();
      const ctx = await curationContext(index, seed);
      ctx.size = experiment === "detour" ? 15 : ADVENTURE_SIZE;
      const plans = planCandidates(await monthProfiles(ctx.explored), {
        now: ctx.now!,
        seed,
        screenshots: false,
        recentSources: [],
      }).filter((p) => p.kind === experiment);
      const made = (await curateAll(plans, ctx)).sort(
        (a, b) => b.curated.diagnostics.total - a.curated.diagnostics.total,
      );
      const best = made[0];
      if (!best) return undefined;
      const stored = await persist(best.curated, best.candidate, ctx, { lab: experiment });
      if (!stored) return undefined;
      stored.adventure.diagnostics!.alternatives = made.slice(1, 6).map((m) => ({
        title: m.curated.hint.title,
        detail: m.curated.hint.detail,
        total: m.curated.diagnostics.total,
      }));
      await storage.setValue(metaKey(stored.adventure.id), stored.adventure);
      const state = (await storage.getValue<Partial<Record<LabExperiment, string>>>(LAB_KEY)) ?? {};
      await storage.setValue(LAB_KEY, { ...state, [experiment]: stored.adventure.id });
      return stored.adventure;
    });
  },
  get: loadMeta,
  async validPhotoOffer(id: string, pro = false) {
    const [adventure, session] = await Promise.all([loadMeta(id), loadSession(id)]);
    return !!adventure && (!adventure.historyPro || pro) && !!session && await validPhotoOffer(adventure, session);
  },
  /** Home's one line: distinct photos explored, and currently set aside. */
  async progress() {
    const index = await loadIndex();
    const { explored, setAside } = adventureProgress(await journeySessions(index));
    return { explored, setAside };
  },
  /** The Journey in distinct, non-overlapping terms. Each photo counts once. Storage is
   * only counted for deletions the OS confirmed, from sizes Pictopia knows. */
  async journey() {
    const index = await loadIndex();
    const sessions = await journeySessions(index);
    const { exploredIds } = adventureProgress(sessions);
    const setAside = new Set<string>();
    for (const s of sessions) for (const id of s?.ids ?? []) if (s?.records[id]?.discarded) setAside.add(id);
    const ids = [...new Set([...exploredIds, ...setAside])];
    const active = await readMedia(ids);
    // Queries only return items still in the library; the rest are read one by one.
    const found = new Set(active.map((m) => m.id));
    const gone = await Promise.all(ids.filter((id) => !found.has(id)).map((id) => storage.get(id)));
    const rows = [...active, ...gone.filter((m): m is Media => !!m)];
    const decided = new Set(rows.filter((m) => m.decision).map((m) => m.id));
    const deleted = rows.filter((m) => m.deletedAt);
    return {
      explored: exploredIds.size,
      // An explicit choice: set aside here, or kept/queued anywhere in Pictopia.
      reviewed: ids.filter((id) => setAside.has(id) || decided.has(id)).length,
      setAside: setAside.size,
      queued: rows.filter((m) => m.decision === "delete" && !m.deletedAt).length,
      deleted: deleted.length,
      recoveredBytes: deleted.reduce((sum, m) => sum + (m.size ?? m.scan?.size ?? 0), 0),
      unknownSizes: deleted.filter((m) => !(m.size ?? m.scan?.size)).length,
      adventures: index.started.length,
    };
  },
  /** Every provisionally set-aside photo, newest Adventure first, once each, with the sessions
   * holding that mark so restoring clears it everywhere. */
  async setAside() {
    const index = await loadIndex();
    const keys: string[] = [];
    for (const id of [...index.started].reverse()) {
      keys.push(adventureSessionKey(id), ...((await loadMeta(id))?.segmentKeys ?? []));
    }
    keys.push(EXPLORE_KEY);
    const items = new Map<string, string[]>();
    for (const key of keys) {
      const session = await exploreStoreFor(key).load();
      for (const id of session?.ids ?? [])
        if (session?.records[id]?.discarded) items.set(id, [...(items.get(id) ?? []), key]);
    }
    return [...items].map(([id, keys]) => ({ id, keys }));
  },
  /** Restores a set-aside photo in each session that marked it. Nothing else changes. */
  async restore(item: { id: string; keys: string[] }) {
    for (const key of item.keys) await exploreStoreFor(key).change({ type: "restore", id: item.id });
  },
};
