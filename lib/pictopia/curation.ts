import { eligibleStills, adventurePool, selectMixedMedia } from "./photo-eligibility";
import type { Media } from "./types";
import { bestScore, shuffle, similar } from "./logic";
import { plural } from "./text";
import {
  adventureSize,
  OFFER_MIN,
  monthName,
  type AdventureDiagnostics,
  type AdventureHint,
  type AdventureKind,
  type Dimension,
} from "./adventures";

/** The curation engine. Pure and explainable: every number it produces comes from metadata
 * the library really has (capture dates, screenshot flags, Pictopia's own reviews and
 * Adventures, and local analysis when a scan has run). There is no location, face or scene
 * data, so nothing here guesses at places, people or themes. */

/** How much each dimension counts toward an Adventure's overall score. */
export const CURATION_WEIGHTS: Record<Dimension, number> = {
  discovery: 0.25,
  coherence: 0.2,
  variety: 0.2,
  cleanup: 0.15,
  effort: 0.1,
  personalization: 0.1,
};
/** Shots this close together on the same day are one moment (a burst or a quick series). */
export const BURST_GAP_MS = 90_000;
/** Matches the library's blurry filter (Laplacian variance from the local scan). */
const BLURRY = 30;

export interface CurationContext {
  seed: number;
  size?: number;
  now?: number;
  /** Seen in any Adventure (or the original explorer). */
  explored: ReadonlySet<string>;
  /** Sources recently offered or started, oldest first. */
  recentSources?: readonly string[];
  /** Photos in the latest few Adventures. */
  recentIds?: ReadonlySet<string>;
  /** Never included (the other Home choice, photos awaiting deletion). */
  exclude?: ReadonlySet<string>;
  /** -1 … 1 per kind, from ratings and "More like this?" answers. */
  affinity?: Partial<Record<AdventureKind, number>>;
  /** How many ratings/answers the affinity rests on. */
  feedbackCount?: Partial<Record<AdventureKind, number>>;
  weights?: Partial<Record<Dimension, number>>;
  /** Picked in Explore: the title names the destination and explored photos may fill in. */
  chosen?: boolean;
  /** Browser files only have modification dates. */
  modifiedDates?: boolean;
}
export interface Candidate {
  kind: AdventureKind;
  source: string;
  pool: Media[];
  /** The pool was capped while reading, so it may not be the whole period. */
  capped?: boolean;
  /** Why the planner thought this was worth loading. */
  reason?: string;
  /** The whole scope before narrowing, so near-copies of photos already shown are recognized. */
  context?: Media[];
}
export interface CuratedAdventure {
  kind: AdventureKind;
  source: string;
  ids: string[];
  hint: AdventureHint;
  closing: string;
  diagnostics: AdventureDiagnostics;
}

const dayOf = (m: Media) => `${m.month}-${m.day.slice(3)}`;
const yearOf = (m: Media) => m.month.slice(0, 4);
const chronological = (a: Media, b: Media) => a.created - b.created || a.id.localeCompare(b.id);
const pct = (n: number) => `${Math.round(n * 100)}%`;
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const pick = <T>(items: T[], seed: number) => items[Math.abs(Math.floor(seed)) % items.length];
const familyOf = (source: string) => source.split(":")[0];
const dayLabel = (mmdd: string) => `${monthName(`0000-${mmdd.slice(0, 2)}`)} ${Number(mmdd.slice(3))}`;

/** Still photos that can be explored, once each. */
export const eligible = eligibleStills;
/** Consecutive shots taken within `BURST_GAP_MS` of each other on the same day. */
export function bursts(photos: Media[]) {
  const sorted = [...photos].sort(chronological);
  const groups: Media[][] = [];
  for (const m of sorted) {
    const last = groups[groups.length - 1]?.at(-1);
    if (last && m.created - last.created <= BURST_GAP_MS && dayOf(last) === dayOf(m))
      groups[groups.length - 1].push(m);
    else groups.push([m]);
  }
  return groups;
}
const blurry = (m: Media) => m.scan?.sharpness !== undefined && m.scan.sharpness < BLURRY;
const favorite = (m: Media) => m.favorite || !!m.systemFavorite;

/** Groups by the first key (in sorted key order), orders each group by the remaining keys the
 * same way, then takes one from each group in turn. Spreads a selection evenly. */
function spread(items: Media[], keys: ((m: Media) => string)[], groupOrder?: (keys: string[]) => string[]): Media[] {
  if (!keys.length) return items;
  const [key, ...rest] = keys;
  const groups = new Map<string, Media[]>();
  for (const m of items) groups.set(key(m), [...(groups.get(key(m)) ?? []), m]);
  const ordered = (groupOrder ?? ((k: string[]) => k.sort()))([...groups.keys()]).map((k) =>
    spread(groups.get(k)!, rest),
  );
  const out: Media[] = [];
  for (let round = 0; out.length < items.length; round++)
    for (const group of ordered) if (group[round]) out.push(group[round]);
  return out;
}

interface Selection {
  picks: Media[];
  notes: string[];
  sequencing: string;
  coherence: { value: number; reason: string };
  why: string;
  /** Extra hint facts, already true of `picks`. */
  facts: Record<string, number | string>;
}

/** Exact-copy keys: the original's SHA-256 and (when not a flat, featureless image) its difference hash. */
function fingerprints(m: Media) {
  const keys: string[] = [];
  if (m.scan?.hash) keys.push(`h:${m.scan.hash}`);
  const p = m.scan?.perceptual;
  if (p && new Set(p).size > 1) keys.push(`p:${p}`);
  return keys;
}
/** Photos that would look like a repeat: siblings of an already seen, decided or excluded shot in
 * the same quick series, and copies of one. Their own ids are never seen, so without this the next
 * set of a series keeps offering "new" near-identical shots of moments you already went through. */
function echoes(pool: Media[], groups: Media[][], ctx: CurationContext) {
  const touched = pool.filter((m) => m.firstSeenAt || ctx.explored.has(m.id) || m.decision || ctx.exclude?.has(m.id));
  const out = new Set<string>();
  if (!touched.length) return out;
  const keys = new Set(touched.flatMap(fingerprints));
  const times = ctx.modifiedDates ? [] : touched.map((m) => m.created).sort((a, b) => a - b);
  const near = (t: number) => {
    let lo = 0, hi = times.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (Math.abs(times[mid] - t) <= BURST_GAP_MS) return true;
      if (times[mid] < t) lo = mid + 1;
      else hi = mid - 1;
    }
    return false;
  };
  const touchedIds = new Set(touched.map((m) => m.id));
  for (const group of groups) {
    const hit = group.some((m) => touchedIds.has(m.id) || (m.type === "photo" && !m.screenshot && near(m.created)) || fingerprints(m).some((k) => keys.has(k)));
    if (hit) group.forEach((m) => { if (!touchedIds.has(m.id)) out.add(m.id); });
  }
  return out;
}

/** Shared preparation: eligible photos, bursts collapsed to a lead, unexplored first. */
function prepare(candidate: Candidate, ctx: CurationContext) {
  const all = adventurePool(candidate.pool, candidate.kind, ctx.exclude, ctx.now);
  // A browser file's modified time is not a capture time. Equal timestamps must not
  // collapse unrelated selected files into one photograph.
  const groups = ctx.modifiedDates ? all.map((m) => [m])
    : [...bursts(all.filter(m => m.type === "photo" && !m.screenshot)), ...all.filter(m => m.screenshot || m.type === "video").map(m => [m])].sort((a, b) => chronological(a[0], b[0]));
  const echo = echoes(candidate.context ?? candidate.pool, groups, ctx);
  const fresh = (m: Media) => !(m.firstSeenAt || ctx.explored.has(m.id)) && !m.decision && !echo.has(m.id);
  const allowed = (m: Media) => ctx.chosen || !(m.firstSeenAt || ctx.explored.has(m.id) || echo.has(m.id));
  const lead = (group: Media[]) => {
    const usable = group.filter(allowed);
    if (!usable.length) return undefined;
    const pool = usable.some(fresh) ? usable.filter(fresh) : usable;
    return [...pool].sort((a, b) => bestScore(b) - bestScore(a) || chronological(a, b))[0];
  };
  // Byte-identical or visually identical copies collapse to one, so a set never shows a photo twice.
  const printed = new Set<string>();
  const leads = groups.map(lead).filter((m): m is Media => !!m).filter((m) => {
    const keys = fingerprints(m);
    if (keys.some((k) => printed.has(k))) return false;
    keys.forEach((k) => printed.add(k));
    return true;
  });
  // Unexplored, undecided photos first; then the rest, if the Adventure still has room.
  const preferred = [...leads.filter(fresh), ...leads.filter((m) => !fresh(m))];
  return { all, groups, leads: preferred, fresh };
}

function selectTime(candidate: Candidate, ctx: CurationContext, size: number): Selection {
  const { all, groups, leads, fresh } = prepare(candidate, ctx);
  const { kind } = candidate;
  const freshLeads = leads.filter(fresh);
  const base = freshLeads.length >= size ? freshLeads : leads;
  const keys = kind === "year" ? [(m: Media) => m.month, dayOf] : [dayOf];
  const picks = spread(base, keys).slice(0, size).sort(chronological);
  const days = new Map<string, number>();
  for (const m of all) days.set(dayOf(m), (days.get(dayOf(m)) ?? 0) + 1);
  const busy = [...days].filter(([, n]) => n >= 3);
  const onBusy = busy.reduce((sum, [, n]) => sum + n, 0) / Math.max(1, all.length);
  const pickedDays = new Set(picks.map(dayOf)).size;
  const months = new Set(picks.map((m) => m.month)).size;
  const coherence =
    kind === "year"
      ? {
          value: clamp(0.35 + 0.35 * onBusy + 0.3 * Math.min(1, months / 6)),
          reason: `One year; ${pct(onBusy)} of its photos fall on busy days, and the picks cover ${plural(months, "month")}.`,
        }
      : {
          value: clamp(0.5 * onBusy + 0.5 * Math.min(1, busy.length / 3) * Math.min(1, pickedDays / 5)),
          reason: `${pct(onBusy)} of this month’s photos fall on ${plural(busy.length, "busy day")} (3+ photos).`,
        };
  return {
    picks,
    notes: [
      ctx.modifiedDates
        ? `${plural(all.length, "eligible photo")} kept distinct; browser modification times cannot identify quick series.`
        : `${plural(all.length, "eligible photo")} → ${plural(groups.length, "moment")} after collapsing shots taken within 90 s (the best-scored shot of each is kept).`,
      freshLeads.length >= size
        ? "Only photos never seen in an Adventure and never decided were used."
        : `Only ${plural(freshLeads.length, "unexplored, undecided moment")}; ${ctx.chosen ? "explored and decided photos fill the rest." : "decided ones fill the rest."}`,
      kind === "year"
        ? `Spread evenly across months, then days: ${plural(months, "month")}, ${plural(pickedDays, "day")}.`
        : `Spread evenly across days: ${plural(pickedDays, "day")} represented.`,
    ],
    sequencing: "Chronological, oldest first, so the period unfolds as it happened.",
    coherence,
    why:
      kind === "year"
        ? `${candidate.source.slice(5)} holds ${plural(all.length, "eligible photo")}; ${pct(all.filter(fresh).length / Math.max(1, all.length))} unexplored.`
        : `${monthName(candidate.source.slice(6))} ${candidate.source.slice(6, 10)} is a strong cluster: ${plural(all.length, "photo")} with ${plural(busy.length, "busy day")}.`,
    facts: { days: pickedDays, months, year: picks[0] ? yearOf(picks[0]) : "" },
  };
}

/** On This Day never widens dates; February 29 matches only February 29. */
export const DAY_WINDOWS = [0] as const;
function selectDay(candidate: Candidate, ctx: CurationContext, _size: number, _minimum: number): Selection {
  const today = candidate.source.slice(4, 9);
  // The whole date: every photo, oldest first, so the count matches what you scroll through.
  // `curate` already applied the On This Day rule (discarded-but-not-deleted photos stay).
  const leads = [...new Map(candidate.pool.filter(m => m.day === today).map(m => [m.id, m])).values()];
  const picks = [...leads].sort(chronological);
  const years = new Set(picks.map(yearOf)).size;
  return {
    picks,
    notes: [`Photos and videos from exactly ${dayLabel(today)}. Adjacent dates are never included.`, `${ctx.modifiedDates ? "File-modified dates in the browser" : "Capture dates from your library"}.`],
    sequencing: "Oldest year first, walking forward to the most recent.",
    coherence: { value: 1, reason: `The same calendar date across ${plural(years, "year")}.` },
    why: `${dayLabel(today)} has ${plural(leads.length, "moment")}.`,
    facts: { window: 0, years, today },
  };
}

function selectScreenshots(candidate: Candidate, ctx: CurationContext, size: number): Selection {
  const { groups, fresh } = prepare(candidate, ctx);
  const now = ctx.now ?? Date.now();
  const allowed = (m: Media) =>
    m.screenshot && !favorite(m) && (ctx.chosen || !(m.firstSeenAt || ctx.explored.has(m.id)));
  // Every screenshot is shown, including runs of scrolling captures, so counts match.
  const shots = groups.flatMap((g) => g.filter(allowed));
  const old = (m: Media) => now - m.created > 180 * 86400000;
  const ordered = [
    ...shots.filter((m) => fresh(m) && old(m)),
    ...shots.filter((m) => fresh(m) && !old(m)),
    ...shots.filter((m) => !fresh(m)),
  ];
  // Oldest first within each tier: the likeliest to have served their purpose.
  const picks = spread(ordered.slice(0, Math.max(size * 3, size)), [(m) => m.month])
    .slice(0, size)
    .sort(chronological);
  const olderShare = picks.filter(old).length / Math.max(1, picks.length);
  return {
    picks,
    notes: [
      "Screenshots only (the system screenshot flag); favorites are left out.",
      `Unexplored screenshots older than six months first (${pct(olderShare)} of the picks), spread across months.`,
      ctx.modifiedDates
        ? "Browser modification times cannot identify screenshot series, so each screenshot stays available."
        : "At most two from a quick series, so each can be judged on its own.",
    ],
    sequencing: "Oldest first: the ones most likely to have served their purpose come first.",
    coherence: { value: 0.7, reason: "One kind of image, all screenshots." },
    why: `${plural(shots.length, "screenshot")} available; screenshots are often useful briefly and easy to decide on.`,
    facts: { oldest: picks[0]?.month ?? "" },
  };
}

/** Controlled variation: never the same year twice in a row, alternating long and short
 * jumps through time so the trip keeps twisting without feeling random. */
function twist(picks: Media[], seed: number) {
  const remaining = shuffle([...picks].sort(chronological), seed);
  const out: Media[] = [];
  if (!remaining.length) return out;
  out.push(remaining.shift()!);
  for (let step = 0; remaining.length; step++) {
    const last = Number(yearOf(out[out.length - 1]));
    const jumps = remaining.map((m) => Math.abs(Number(yearOf(m)) - last));
    const moving = jumps.filter((j) => j > 0);
    const target = !moving.length ? 0 : step % 2 ? Math.min(...moving) : Math.max(...moving);
    out.push(remaining.splice(jumps.indexOf(target), 1)[0]);
  }
  return out;
}
function selectDetour(candidate: Candidate, ctx: CurationContext, size: number): Selection {
  const { all, leads, fresh } = prepare(candidate, ctx);
  const recent = ctx.recentIds ?? new Set<string>();
  const base = [...leads.filter((m) => !recent.has(m.id)), ...leads.filter((m) => recent.has(m.id))];
  const source = [...base.filter(fresh), ...base.filter(m => !fresh(m))];
  const yearKeys = (keys: string[]) => shuffle(keys.sort(), ctx.seed);
  const keys = [yearOf, (m: Media) => m.month, dayOf];
  const picks = selectMixedMedia([...spread(source.filter(m => !recent.has(m.id)), keys, yearKeys), ...spread(source.filter(m => recent.has(m.id)), keys, yearKeys)], size);
  const years = new Set(picks.map(yearOf)).size;
  const sequenced = twist(picks, ctx.seed);
  const repeats = sequenced.filter((m, i) => i && yearOf(sequenced[i - 1]) === yearOf(m)).length;
  return {
    picks: sequenced,
    notes: [
      `Drawn from ${plural(new Set(all.map((m) => m.month)).size, "month")} sampled across ${plural(new Set(all.map(yearOf)).size, "year")}.`,
      `${ctx.modifiedDates ? "Each selected browser photo" : "One shot per moment"}, then one per year in turn before any year repeats (${plural(years, "year")} represented).`,
      "Photos from your recent Adventures are used only when nothing else fits.",
    ],
    sequencing: `Twisting through time: no two in a row from the same year${repeats ? ` (except ${repeats} unavoidable)` : ""}, alternating long and short jumps.`,
    coherence: {
      value: clamp(0.25 + 0.05 * Math.min(4, years)),
      reason: "Variety by design: linked only by being spread across your years.",
    },
    why: `A cross-section of ${plural(years, "year")}, for surprise rather than a single story.`,
    facts: { years },
  };
}

function selectCorners(candidate: Candidate, ctx: CurationContext, size: number): Selection {
  const { all, groups, leads, fresh } = prepare(candidate, ctx);
  const allowed = (m: Media) => !favorite(m) && fresh(m);
  // Cleanup opportunities: a quick series (kept together, up to three, so the best can stay),
  // photos the local scan found blurry.
  const runs = groups
    .filter((g) => g.length >= 2)
    .map((g) => g.filter(allowed).slice(0, 3))
    .filter((g) => g.length >= 2);
  const inRun = new Set(runs.flat().map((m) => m.id));
  const singles = leads.filter((m) => allowed(m) && !inRun.has(m.id) && blurry(m));
  const signalBudget = Math.ceil(size * 0.6);
  const chosenRuns: Media[][] = [];
  let used = 0;
  for (const run of spreadRuns(runs)) {
    if (used + run.length > Math.ceil(signalBudget * 0.6)) continue;
    chosenRuns.push(run);
    used += run.length;
  }
  const signal = [...chosenRuns.flat(), ...spread(singles, [(m) => m.month]).slice(0, signalBudget - used)];
  const taken = new Set(signal.map((m) => m.id));
  const context = spread(
    leads.filter((m) => !taken.has(m.id) && !inRun.has(m.id) && (ctx.chosen || fresh(m))),
    [(m) => m.month, dayOf],
  );
  const picks = selectMixedMedia([...signal, ...context, ...all.filter(m => ctx.chosen || fresh(m))], size).sort(chronological);
  const months = new Set(picks.map((m) => m.month)).size;
  return {
    picks,
    notes: [
      `From ${plural(new Set(all.map((m) => m.month)).size, "quiet month")} with the least Pictopia activity.`,
      `${plural(chosenRuns.length, "quick series", "quick series")} kept together (up to three shots each) so you can keep the best; ${plural(signal.length - used, "possibly blurry photo")}.`,
      `The rest are unexplored moments from the same months (${plural(picks.filter(m => !taken.has(m.id)).length, "memory", "memories")}). Favorites are never offered as cleanup.`,
    ],
    sequencing: "Chronological, with each quick series kept side by side for easy comparison.",
    coherence: {
      value: clamp(0.3 + 0.3 * (months <= 3 ? 1 : 3 / months)),
      reason: `Linked by being overlooked: ${plural(months, "month")} you haven’t explored.`,
    },
    why: "Less-explored months with real decisions waiting: quick series and soft shots.",
    facts: { months, runs: chosenRuns.length },
  };
}
/** Series from different months first. */
function spreadRuns(runs: Media[][]) {
  const byMonth = new Map<string, Media[][]>();
  for (const run of runs) byMonth.set(run[0].month, [...(byMonth.get(run[0].month) ?? []), run]);
  const lists = [...byMonth.values()];
  const out: Media[][] = [];
  for (let i = 0; out.length < runs.length; i++) for (const list of lists) if (list[i]) out.push(list[i]);
  return out;
}

/** Permanent adventure names (see lib/pictopia/catalog.ts). Never rotated or invented. */
const TITLES: Record<AdventureKind, string[]> = {
  detour: ["Surprise Me"],
  random: ["Surprise Me"],
  capsule: ["Time Capsule"],
  corners: ["Hidden Corners"],
  day: ["On This Day"],
  screenshots: ["Screenshot Sweep"],
  year: ["The Yearbook"],
  month: ["The Yearbook"],
  pitstop: ["Pit Stop Photos"],
};
const CLOSINGS: Record<AdventureKind, string> = {
  detour: "That was quite a detour.",
  random: "That was quite a detour.",
  capsule: "Time capsule, resealed.",
  corners: "Every corner explored.",
  day: "Same day, many stories.",
  screenshots: "Sweep complete.",
  year: "What a year.",
  month: "A month, revisited.",
  pitstop: "Back on the road.",
};
function hintFor(kind: AdventureKind, source: string, sel: Selection, ctx: CurationContext): AdventureHint {
  const n = sel.picks.length;
  const f = sel.facts;
  const title = pick(TITLES[kind], ctx.seed);
  switch (kind) {
    case "detour":
    case "random":
      return {
        title,
        detail:
          Number(f.years) > 1
            ? `${plural(n, ctx.modifiedDates ? "photo" : "moment")} from ${f.years} different years`
            : `${plural(n, ctx.modifiedDates ? "photo" : "moment")} from across ${sel.picks[0] ? yearOf(sel.picks[0]) : "your library"}`,
      };
    case "capsule":
    case "month":
      return { title, detail: `${monthName(source.slice(6))} ${source.slice(6, 10)} · ${plural(n, "photo")} across ${plural(Number(f.days), "day")}` };
    case "year":
      return { title, detail: `${source.slice(5)} · ${plural(n, "photo")} across ${plural(Number(f.months), "month")}` };
    case "day": {
      const today = String(f.today);
      const years = plural(Number(f.years), "year");
      return {
        title,
        detail:
          f.window === 0
            ? `${dayLabel(today)}, across ${years}`
            : f.window === "month"
              ? `${monthName(`0000-${today.slice(0, 2)}`)} across ${years}`
              : `Within ${f.window} days of ${dayLabel(today)}, across ${years}`,
      };
    }
    case "screenshots":
      return {
        title,
        detail: f.oldest
          ? `${plural(n, "screenshot")}, the oldest from ${monthName(String(f.oldest))} ${String(f.oldest).slice(0, 4)}`
          : plural(n, "screenshot"),
      };
    case "pitstop":
      return { title, detail: plural(n, "photo") };
    case "corners": {
      const extra = Number(f.runs) ? " · some shots taken seconds apart" : "";
      return {
        title,
        detail: `${Number(f.months) === 1 ? "A quiet month" : "Quiet months"} you haven’t explored${extra}`,
      };
    }
  }
}

function cleanupSignals(picks: Media[], pool: Media[], modifiedDates = false) {
  const groups = modifiedDates ? [] : bursts(eligible(pool));
  const extra = new Set(groups.flatMap((g) => g.slice(1).map((m) => m.id)));
  const series = picks.filter((m) => extra.has(m.id) || picks.some((o) => o !== m && similar(o, m))).length;
  const shots = picks.filter((m) => m.screenshot && !favorite(m)).length;
  const soft = picks.filter((m) => blurry(m) && !favorite(m)).length;
  return { series, shots, soft, total: series + shots + soft };
}

/** Composes and scores one candidate. Returns nothing when it can't make an Adventure. */
export function curate(candidate: Candidate, ctx: CurationContext): CuratedAdventure | undefined {
  candidate = { ...candidate, context: candidate.context ?? candidate.pool, pool: adventurePool(candidate.pool, candidate.kind, ctx.exclude, ctx.now) };
  const size = ctx.size ?? adventureSize(candidate.kind);
  const minimum = ctx.chosen || candidate.kind === "day" ? 1 : Math.min(OFFER_MIN, size);
  const { kind } = candidate;
  const sel =
    kind === "day"
      ? selectDay(candidate, ctx, size, minimum)
      : kind === "screenshots"
        ? selectScreenshots(candidate, ctx, size)
        : kind === "detour" || kind === "random"
          ? selectDetour(candidate, ctx, size)
          : kind === "corners"
            ? selectCorners(candidate, ctx, size)
            : selectTime(candidate, ctx, size);
  const picks = sel.picks;
  if (picks.length < minimum) return undefined;
  const pool = kind === "day" ? candidate.pool.filter(m => m.day === candidate.source.slice(4, 9)) : candidate.pool;
  const fresh = picks.filter((m) => !(m.firstSeenAt || ctx.explored.has(m.id)) && !m.decision).length;
  const poolFresh = pool.filter((m) => !(m.firstSeenAt || ctx.explored.has(m.id))).length / Math.max(1, pool.length);
  const recentIds = ctx.recentIds ?? new Set<string>();
  const overlap = picks.filter((m) => recentIds.has(m.id)).length;
  const recent = ctx.recentSources ?? [];
  const lastSix = recent.slice(-6);
  const sourceRecent = lastSix.includes(candidate.source);
  const familyRecent = recent.slice(-2).some((s) => familyOf(s) === familyOf(candidate.source));
  const days = new Set(picks.map(dayOf)).size;
  const signals = cleanupSignals(picks, candidate.pool, ctx.modifiedDates);
  const affinity = ctx.affinity?.[kind] ?? 0;
  const ratings = ctx.feedbackCount?.[kind] ?? 0;
  const scores: Record<Dimension, number> = {
    discovery: clamp(0.7 * (fresh / picks.length) + 0.3 * poolFresh),
    coherence: sel.coherence.value,
    variety: clamp(
      0.5 * (days / picks.length) +
        0.25 * (1 - overlap / picks.length) +
        0.25 * (sourceRecent ? 0 : familyRecent ? 0.5 : 1),
    ),
    cleanup: clamp((signals.total / picks.length) * 2),
    effort: clamp(picks.length / size),
    personalization: clamp(0.5 + 0.5 * affinity),
  };
  const reasons: Record<Dimension, string> = {
    discovery: `${fresh} of ${picks.length} never seen or decided in Pictopia; ${pct(poolFresh)} of the period is unexplored.`,
    coherence: sel.coherence.reason,
    variety: `${plural(days, "different day")}${overlap ? `, ${overlap} seen in recent Adventures` : ", no repeats from recent Adventures"}${sourceRecent ? "; this exact source was offered recently" : familyRecent ? "; a similar kind was offered recently" : ""}.`,
    cleanup: signals.total
      ? [
          signals.series && plural(signals.series, "shot from a quick series", "shots from quick series"),
          signals.shots && plural(signals.shots, "screenshot"),
          signals.soft && plural(signals.soft, "possibly blurry photo"),
        ]
          .filter(Boolean)
          .join(", ") + "."
      : "No obvious cleanup signals; this one is mostly for rediscovery.",
    effort: `${plural(picks.length, "photo")} (target ${size}).`,
    personalization: ratings
      ? `Based on ${plural(ratings, "rating")} of similar Adventures (${affinity >= 0 ? "+" : ""}${affinity.toFixed(2)}).`
      : "No feedback yet for this kind; neutral.",
  };
  const weights = { ...CURATION_WEIGHTS, ...ctx.weights };
  const weightSum = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
  const total =
    (Object.keys(scores) as Dimension[]).reduce((sum, d) => sum + scores[d] * weights[d], 0) /
    weightSum;
  const scanned = pool.filter((m) => m.scan?.sharpness !== undefined).length;
  const limitations = [
    "No location, people or scene data is stored, so places and subjects are never used or implied.",
    ctx.modifiedDates
      ? "Browser files only have last-modified dates; those stand in for capture dates."
      : "Dates are capture dates from your photo library.",
    scanned < pool.length
      ? ctx.modifiedDates
        ? `${pct(scanned / Math.max(1, pool.length))} of these photos have local analysis; quick series cannot be inferred from browser modification times.`
        : `${pct(scanned / Math.max(1, pool.length))} of these photos have local analysis; quick series are judged by timestamps${scanned ? ", near-duplicates and blur only where scanned" : ""}.`
      : "Every photo here has local analysis (sharpness and near-duplicate hashes).",
    ...(candidate.capped ? ["The period was read up to a cap, so very large months are sampled, not exhaustive."] : []),
  ];
  return {
    kind,
    source: candidate.source,
    ids: picks.map((m) => m.id),
    hint: hintFor(kind, candidate.source, sel, ctx),
    closing: CLOSINGS[kind],
    diagnostics: {
      total,
      scores,
      reasons,
      why: [sel.why, ...(candidate.reason ? [candidate.reason] : [])],
      selection: sel.notes,
      sequencing: sel.sequencing,
      limitations,
      overlap: overlap
        ? `${plural(overlap, "photo")} also appeared in your recent Adventures.`
        : "No photos shared with your recent Adventures.",
      pool: pool.length,
    },
  };
}

/** How alike two Adventures feel; a pair of near-twins is a poor choice. */
export function similarity(a: Pick<CuratedAdventure, "kind" | "source" | "ids">, b: typeof a) {
  const shared = a.ids.filter((id) => b.ids.includes(id)).length / Math.max(1, Math.min(a.ids.length, b.ids.length));
  const timeKinds: AdventureKind[] = ["year", "month", "capsule", "day"];
  const yearsOf = (s: string) => (/\d{4}/.exec(s)?.[0] ?? "");
  const sameEra = timeKinds.includes(a.kind) && timeKinds.includes(b.kind) && !!yearsOf(a.source) && yearsOf(a.source) === yearsOf(b.source);
  return (a.kind === b.kind ? 0.25 : 0) + (familyOf(a.source) === familyOf(b.source) ? 0.1 : 0) + (sameEra ? 0.1 : 0) + 0.5 * shared;
}

/** Picks Home's A and B together: the best combined score after penalizing similarity.
 * With `fixed`, picks the best partner for the Adventure already on Home. */
export function choosePair(candidates: CuratedAdventure[], fixed?: Pick<CuratedAdventure, "kind" | "source" | "ids">) {
  const ranked = [...candidates].sort((a, b) => b.diagnostics.total - a.diagnostics.total).slice(0, 10);
  const describe = (other: Pick<CuratedAdventure, "kind" | "source" | "ids">, s: number) =>
    s < 0.05 ? `Paired with a different kind of Adventure (${other.kind}), no shared photos.` : `Paired despite some likeness to ${other.kind} (similarity ${s.toFixed(2)}).`;
  if (fixed) {
    let best: { item: CuratedAdventure; value: number; s: number } | undefined;
    for (const item of ranked) {
      const s = similarity(item, fixed);
      const value = item.diagnostics.total - s;
      if (!best || value > best.value) best = { item, value, s };
    }
    return best ? [{ ...best.item, diagnostics: { ...best.item.diagnostics, pairing: describe(fixed, best.s) } }] : [];
  }
  let best: { a: CuratedAdventure; b?: CuratedAdventure; value: number; s: number } | undefined;
  for (let i = 0; i < ranked.length; i++)
    for (let j = i + 1; j < ranked.length; j++) {
      const s = similarity(ranked[i], ranked[j]);
      const value = ranked[i].diagnostics.total + ranked[j].diagnostics.total - s;
      if (!best || value > best.value) best = { a: ranked[i], b: ranked[j], value, s };
    }
  if (!best) return ranked.slice(0, 1);
  const { a, b, s } = best;
  return [
    { ...a, diagnostics: { ...a.diagnostics, pairing: describe(b!, s) } },
    { ...b!, diagnostics: { ...b!.diagnostics, pairing: describe(a, s) } },
  ];
}

export interface MonthProfile {
  key: string;
  count: number;
  /** Decided in classic sessions. */
  reviewed: number;
  /** Seen in Adventures. */
  explored: number;
}
export interface Plan {
  kind: AdventureKind;
  source: string;
  /** Months to read for the pool. */
  months?: string[];
  /** MM-DD days to read (On This Day). */
  days?: string[];
  screenshots?: boolean;
  reason: string;
}
const quiet = (m: MonthProfile) => 1 - clamp((m.explored + m.reviewed) / Math.max(1, m.count));
/** MM-DD keys within `span` days of `now`. */
export function daysAround(now: number, span: number) {
  const d = new Date(now);
  return Array.from({ length: span * 2 + 1 }, (_, i) => {
    const t = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i - span);
    return `${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  });
}
/** Cheap first pass from the month index: which candidates are worth reading. */
export function planCandidates(
  months: MonthProfile[],
  { now, seed, screenshots, recentSources = [], mixedMonths = months }: { now: number; seed: number; screenshots: boolean; recentSources?: readonly string[]; mixedMonths?: MonthProfile[] },
): Plan[] {
  const recent = new Set(recentSources.slice(-6));
  const current = new Date(now);
  const fresh = (key: string) => {
    const [y, m] = key.split("-").map(Number);
    return (current.getFullYear() - y) * 12 + current.getMonth() + 1 - m < 2;
  };
  const plans: Plan[] = [];
  const capsules = months
    .filter((m) => m.count >= 20 && !recent.has(`month:${m.key}`))
    .map((m) => ({ m, value: quiet(m) * Math.log2(Math.min(m.count, 300)) * (fresh(m.key) ? 0.5 : 1) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 4);
  for (const { m } of capsules)
    plans.push({
      kind: "capsule",
      source: `month:${m.key}`,
      months: [m.key],
      reason: `Planned from the month index: ${m.count} items, ${pct(quiet(m))} untouched by Pictopia.`,
    });
  const years = new Map<string, MonthProfile[]>();
  for (const m of months) years.set(m.key.slice(0, 4), [...(years.get(m.key.slice(0, 4)) ?? []), m]);
  const yearRank = [...years]
    .map(([year, list]) => {
      const count = list.reduce((s, m) => s + m.count, 0);
      const q = list.reduce((s, m) => s + quiet(m) * m.count, 0) / Math.max(1, count);
      return { year, list, count, q };
    })
    .filter((y) => y.count >= 40 && y.list.length >= 3 && !recent.has(`year:${y.year}`))
    .sort((a, b) => b.q * Math.log2(b.count) - a.q * Math.log2(a.count))
    .slice(0, 2);
  for (const y of yearRank)
    plans.push({
      kind: "year",
      source: `year:${y.year}`,
      months: y.list.map((m) => m.key),
      reason: `${y.year}: ${y.count} items over ${plural(y.list.length, "month")}, ${pct(y.q)} untouched.`,
    });
  const today = daysAround(now, 0)[0];
  plans.push({
    kind: "day",
    source: `day:${today}`,
    days: daysAround(now, DAY_WINDOWS[DAY_WINDOWS.length - 1]),
    reason: "Today’s calendar date in earlier years.",
  });
  if (screenshots) plans.push({ kind: "screenshots", source: "screenshots", screenshots: true, reason: "The library has screenshots." });
  const mixedYears = new Map<string, MonthProfile[]>();
  for (const m of mixedMonths) mixedYears.set(m.key.slice(0, 4), [...(mixedYears.get(m.key.slice(0, 4)) ?? []), m]);
  if (mixedYears.size >= 2) {
    // One or two quiet months per year, so every year has a voice.
    const sampled = [...mixedYears.values()].flatMap((list) =>
      shuffle(
        [...list].sort((a, b) => quiet(b) - quiet(a)).slice(0, 4),
        seed,
      ).slice(0, mixedYears.size > 6 ? 1 : 2),
    );
    plans.push({
      kind: "detour",
      source: "detour",
      months: shuffle(sampled.map((m) => m.key), seed).slice(0, 14),
      reason: `Samples quiet months across ${plural(years.size, "year")}.`,
    });
  }
  const corners = mixedMonths
    .filter((m) => m.count >= 4 && !fresh(m.key))
    .sort((a, b) => quiet(b) - quiet(a) || b.count - a.count)
    .slice(0, 6);
  if (corners.length)
    plans.push({
      kind: "corners",
      source: `corners:${corners.map((m) => m.key).sort().join(",")}`,
      months: corners.map((m) => m.key),
      reason: `The ${plural(corners.length, "quietest month")} by Pictopia activity.`,
    });
  return plans;
}
