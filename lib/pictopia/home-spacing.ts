/** Home's existing 4 pt rhythm, compressed only as far as comfortable minimum gaps.
 * Intrinsic height excludes these gaps and includes actual text/cards/recap height. */
const ROOMY = { stats: 24, resume: 24, adventure: 32, postcards: 32, note: 40, pending: 32, bottom: 32 };
const COMPACT = { stats: 16, resume: 16, adventure: 24, postcards: 20, note: 24, pending: 16, bottom: 16 };
type Gaps = typeof ROOMY;
export function homeSpacing(viewport: number, intrinsic: number, resume: boolean, pending: boolean) {
  const enabled = (key: keyof Gaps) => (key !== "resume" || resume) && (key !== "pending" || pending);
  const sum = (gaps: Gaps) => (Object.keys(gaps) as (keyof Gaps)[]).reduce((total, key) => total + (enabled(key) ? gaps[key] : 0), 0);
  const roomy = sum(ROOMY), minimum = sum(COMPACT);
  const pressure = viewport > 0 ? Math.min(1, Math.max(0, (intrinsic + roomy - viewport) / (roomy - minimum))) : 0;
  const gaps = Object.fromEntries((Object.keys(ROOMY) as (keyof Gaps)[]).map(key => [key,
    Math.max(COMPACT[key], Math.floor((ROOMY[key] - pressure * (ROOMY[key] - COMPACT[key])) / 4) * 4),
  ])) as Gaps;
  return { ...gaps, total: sum(gaps) };
}
