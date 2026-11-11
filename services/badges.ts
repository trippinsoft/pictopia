import { storage, serialize } from "./repository";
import { dailyStore } from "./daily";
import { BADGES, calendarValues, evaluateBadges, type BadgeFamily, type BadgeState, type BadgeValues } from "@/lib/pictopia/badges";
import { completionEvidence, completionProof, savedCompletion, type Adventure, type AdventureIndex } from "@/lib/pictopia/adventures";
import type { ExploreSession } from "@/lib/pictopia/explore";
import type { LibraryProgress, CalendarProgress } from "./storage.types";

export const BADGES_KEY = "badges:v1";
const CELEBRATIONS_KEY = "badgeCelebrations:v1";
export interface BadgeCelebration { family: BadgeFamily; tier: number; earnedAt: number; value: number }
const celebrationListeners = new Set<() => void>();
const notifyCelebrations = () => celebrationListeners.forEach(listener => listener());

/** Never infer achievement credit from the legacy feedback-pacing counter. Keep the
 * original records and awards intact; expose unsupported history for inspection. */
export async function auditAdventureCompletions() {
  const index = await storage.getValue<AdventureIndex>("adventures:v1");
  const ids = [...new Set([...(index?.started ?? []), ...(index?.slots ?? []), ...(index?.parked ?? [])])];
  const verified: string[] = [], unverified: string[] = [];
  const backfills: Record<string, Adventure> = {};
  for (const id of ids) {
    const meta = await storage.getValue<Adventure>(`adventure:${id}`);
    const session = await storage.getValue<ExploreSession>(`adventure:${id}:explore`);
    if (meta?.id === id && meta.finishedAt && (savedCompletion(meta, session) || (meta.count === session?.ids?.length && completionEvidence(session)))) {
      verified.push(id);
      if (!savedCompletion(meta, session) && session) backfills[`adventure:${id}`] = { ...meta, priorCompletionProof: meta.completionProof, completionProof: completionProof(session, meta.finishedAt) };
    }
    else if (meta?.finishedAt || session?.finished) unverified.push(id);
  }
  return { verified, unverified, backfills, legacyCount: index?.finished ?? 0 };
}

/** Current values for every family, from saved records only. */
export async function badgeFacts(now = Date.now(), source?: { progress: LibraryProgress; months: CalendarProgress[] }) {
  const [progress, months, audit, streak] = await Promise.all([
    source?.progress ?? storage.progress(),
    source?.months ?? storage.calendarProgress(),
    auditAdventureCompletions(),
    dailyStore.streak(now),
  ]);
  const cal = calendarValues(months);
  const values: BadgeValues = {
    explorer: progress.explored, declutterer: progress.deleted,
    months: cal.months, years: cal.years, decades: cal.decades,
    adventurer: audit.verified.length, streak: streak.best,
  };
  return { values, audit };
}
export async function badgeValues(now = Date.now()): Promise<BadgeValues> {
  return (await badgeFacts(now)).values;
}
/** Caller owns the repository serializer, so the screen and badge engine share one read. */
export async function evaluateSavedBadges(now = Date.now(), source?: { progress: LibraryProgress; months: CalendarProgress[] }) {
  const { values, audit } = await badgeFacts(now, source);
  const result = evaluateBadges(await storage.getValue<BadgeState>(BADGES_KEY), values, now);
  const pending = await storage.getValue<BadgeCelebration[]>(CELEBRATIONS_KEY) ?? [];
  const awards = result.newlyEarned.map(badge => ({ ...badge, earnedAt: now, value: values[badge.family] }));
  await storage.put([], { ...audit.backfills, [BADGES_KEY]: result.state,
    ...(awards.length ? { [CELEBRATIONS_KEY]: [...pending, ...awards] } : {}),
  });
  if (awards.length) notifyCelebrations();
  return { ...result, values, audit };
}

export const badgeStore = {
  pendingCelebrations: () => storage.getValue<BadgeCelebration[]>(CELEBRATIONS_KEY).then(value => value ?? []),
  subscribeCelebrations(listener: () => void) {
    celebrationListeners.add(listener);
    return () => { celebrationListeners.delete(listener); };
  },
  async dismissCelebration(award: BadgeCelebration) {
    await serialize(async () => {
      const pending = await storage.getValue<BadgeCelebration[]>(CELEBRATIONS_KEY) ?? [];
      await storage.setValue(CELEBRATIONS_KEY, pending.filter(item => item.family !== award.family || item.tier !== award.tier || item.earnedAt !== award.earnedAt));
    });
    notifyCelebrations();
  },
  /** Checked at natural breaks (review close, completion, deletion result, foreground), never
   * per photo. Returns what was newly earned for an inline celebration. */
  async evaluate(now = Date.now()) {
    return serialize(() => evaluateSavedBadges(now));
  },
  async state() {
    return storage.getValue<BadgeState>(BADGES_KEY);
  },
  definitions: BADGES,
};
