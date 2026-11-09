/** Home's existing 4 pt rhythm, compressed only as far as comfortable minimum gaps.
 * Intrinsic height excludes these gaps and includes actual text/cards/recap height. */
const ROOMY = { stats: 20, adventure: 28, postcards: 24, note: 32, pending: 28, bottom: 32 };
const COMPACT = { stats: 12, adventure: 20, postcards: 16, note: 20, pending: 16, bottom: 16 };
type Gaps = typeof ROOMY;
export function homeSpacing(viewport: number, intrinsic: number, _resume: boolean, pending: boolean) {
  const enabled = (key: keyof Gaps) => key !== "pending" || pending;
  const sum = (gaps: Gaps) => (Object.keys(gaps) as (keyof Gaps)[]).reduce((total, key) => total + (enabled(key) ? gaps[key] : 0), 0);
  const roomy = sum(ROOMY), minimum = sum(COMPACT);
  const pressure = viewport > 0 ? Math.min(1, Math.max(0, (intrinsic + roomy - viewport) / (roomy - minimum))) : 0;
  const gaps = Object.fromEntries((Object.keys(ROOMY) as (keyof Gaps)[]).map(key => [key,
    Math.max(COMPACT[key], Math.floor((ROOMY[key] - pressure * (ROOMY[key] - COMPACT[key])) / 4) * 4),
  ])) as Gaps;
  return { ...gaps, total: sum(gaps) };
}
