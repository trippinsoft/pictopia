/** Cumulative, tiered badges from verifiable activity only. Earned tiers are permanent: a month
 * that later gains photos may read incomplete again, but its badge stays. Photos only (never
 * videos) for photo families; each photo counts once however many adventures include it. */
export type BadgeFamily = "explorer" | "declutterer" | "months" | "years" | "decades" | "adventurer" | "streak";
export interface BadgeDefinition {
  family: BadgeFamily;
  name: string;
  unit: (n: number) => string;
  tiers: readonly number[];
}
const n = (v: number) => v.toLocaleString();
export const BADGES: readonly BadgeDefinition[] = [
  { family: "explorer", name: "Explorer", unit: (v) => `${n(v)} photos explored`, tiers: [100, 500, 1000, 5000, 10000, 25000, 50000] },
  { family: "declutterer", name: "Declutterer", unit: (v) => `${n(v)} photos deleted`, tiers: [10, 50, 100, 500, 1000, 5000] },
  { family: "months", name: "Month Finisher", unit: (v) => `${n(v)} ${v === 1 ? "month" : "months"} fully explored`, tiers: [1, 6, 12, 36, 120] },
  { family: "years", name: "Time Traveller", unit: (v) => `${n(v)} ${v === 1 ? "year" : "years"} fully explored`, tiers: [1, 3, 5, 10, 20] },
  { family: "decades", name: "Across the Decades", unit: (v) => `${n(v)} decades with a full year`, tiers: [2, 3, 4] },
  { family: "adventurer", name: "Adventurer", unit: (v) => `${n(v)} ${v === 1 ? "adventure" : "adventures"} finished`, tiers: [1, 5, 10, 25, 50, 100] },
  { family: "streak", name: "Streak", unit: (v) => `${n(v)}-day best streak`, tiers: [3, 7, 14, 30, 50, 100, 200, 365] },
];
export type BadgeValues = Record<BadgeFamily, number>;
export interface EarnedBadge { tier: number; earnedAt: number; value: number }
export interface BadgeState { version: 1; earned: Partial<Record<BadgeFamily, EarnedBadge>>; backfilled: boolean; verification?: 2; legacy?: Partial<Record<BadgeFamily, EarnedBadge>> }
export const emptyBadges = (): BadgeState => ({ version: 1, earned: {}, backfilled: false });

export const tierFor = (def: BadgeDefinition, value: number) => def.tiers.filter((t) => value >= t).length;
export const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII"];

/** Calendar facts from photo month progress (accessible photos, `YYYY-MM` keys). */
export function calendarValues(months: readonly { key: string; total: number; remaining: number }[]) {
  const dated = months.filter((m) => /^\d{4}-\d{2}$/.test(m.key) && m.total > 0);
  const complete = dated.filter((m) => m.remaining === 0).length;
  const years = new Map<string, { total: number; remaining: number }>();
  for (const m of dated) {
    const y = years.get(m.key.slice(0, 4)) ?? { total: 0, remaining: 0 };
    years.set(m.key.slice(0, 4), { total: y.total + m.total, remaining: y.remaining + m.remaining });
  }
  const fullYears = [...years].filter(([, y]) => y.remaining === 0).map(([year]) => year);
  return { months: complete, years: fullYears.length, decades: new Set(fullYears.map((y) => y.slice(0, 3))).size };
}

/** Raises earned tiers to what the values now support and reports what was newly earned. The
 * first evaluation after the update backfills silently: no celebrations for past progress. */
export function evaluateBadges(state: BadgeState | undefined, values: BadgeValues, now: number) {
  const s = state ?? emptyBadges();
  // Older awards had no evidence version. Archive them intact, then confirm only tiers
  // supported by the authoritative facts. Future confirmed awards remain permanent.
  const earned = s.verification === 2 ? { ...s.earned } : {};
  const legacy = s.verification === 2 ? { ...s.legacy } : { ...s.legacy, ...s.earned };
  const fresh: { family: BadgeFamily; tier: number }[] = [];
  for (const def of BADGES) {
    const tier = tierFor(def, values[def.family]);
    const previous = earned[def.family]?.tier ?? 0;
    if (tier > previous) {
      earned[def.family] = { tier, earnedAt: now, value: values[def.family] };
      fresh.push({ family: def.family, tier });
    }
  }
  const silent = !s.backfilled || s.verification !== 2;
  return { state: { version: 1 as const, earned, backfilled: true, verification: 2 as const, legacy }, newlyEarned: silent ? [] : fresh, backfilledCount: silent ? fresh.length : 0 };
}

/** Display for one family: its earned tier (never lowered) and progress to the next. */
export function badgeView(def: BadgeDefinition, state: BadgeState | undefined, value: number) {
  const tier = Math.max((state?.verification === 2 ? state.earned[def.family]?.tier : 0) ?? 0, tierFor(def, value));
  const next = def.tiers[tier];
  const floor = tier ? def.tiers[tier - 1] : 0;
  return {
    tier,
    earned: tier > 0,
    maxed: next === undefined,
    next,
    value,
    progress: next === undefined ? 1 : Math.min(1, Math.max(0, (value - floor) / (next - floor))),
    label: tier ? def.unit(def.tiers[tier - 1]) : "Not yet",
  };
}
