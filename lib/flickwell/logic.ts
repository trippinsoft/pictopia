import { Media, Query, Session, Decision, Analysis, Entitlement } from "./types";
export const SCAN_VERSION = "sha256-dhash-laplacian-v1";
export function dateKeys(timestamp: number) {
  const d = new Date(timestamp);
  return {
    month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
    day: `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
  };
}
export function identity(m: Media) {
  return `${m.created}:${m.type}:${m.width}:${m.height}:${m.duration}`;
}
export function matches(m: Media, q: Query) {
  return (
    m.active &&
    (!q.month || m.month === q.month) &&
    (q.before === undefined || m.created < q.before) &&
    (!q.blurry || (m.scan?.sharpness !== undefined && m.scan.sharpness < 30)) &&
    (!q.day || m.day === q.day) &&
    (!q.type || m.type === q.type) &&
    (!q.decision || m.decision === q.decision) &&
    (!q.unreviewed || !m.decision) &&
    (!q.favorite || m.favorite || m.systemFavorite === true) &&
    (!q.excludeFavorites || (!m.favorite && !m.systemFavorite)) &&
    (!q.screenshot || m.screenshot) &&
    (!q.scanMissing || (!m.scanError && m.scan?.version !== `${SCAN_VERSION}:${m.modified}`)) &&
    (!q.hash || m.scan?.hash === q.hash) &&
    (!q.ids || q.ids.includes(m.id))
  );
}
export function shuffle<T>(items: T[], seed: number) {
  const result = [...items];
  let state = seed >>> 0;
  for (let i = result.length - 1; i > 0; i--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const j = state % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function applyDecision(
  s: Session,
  m: Media,
  decision: Decision,
): { session: Session; media: Media } {
  if (s.ids[s.position] !== m.id || s.complete)
    throw Error("This photo is no longer the current item.");
  return {
    media: { ...m, decision },
    session: {
      ...s,
      position: s.position + 1,
      reviewed: s.reviewed + 1,
      kept: s.kept + (decision === "keep" ? 1 : 0),
      marked: s.marked + (decision === "delete" ? 1 : 0),
      history: [...s.history, { id: m.id, previous: m.decision, decision, position: s.position }],
      complete: s.position + 1 >= s.ids.length,
    },
  };
}
export function undoDecision(s: Session, m: Media) {
  const h = s.history.at(-1);
  if (!h || h.id !== m.id) throw Error("There is nothing to undo.");
  return {
    media: { ...m, decision: h.previous },
    session: {
      ...s,
      position: h.position,
      reviewed: Math.max(0, s.reviewed - 1),
      kept: Math.max(0, s.kept - (h.decision === "keep" ? 1 : 0)),
      marked: Math.max(0, s.marked - (h.decision === "delete" ? 1 : 0)),
      history: s.history.slice(0, -1),
      complete: false,
      finishedEarly: false,
    },
  };
}
export function hamming(a: string, b: string) {
  if (a.length !== b.length) return 64;
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
  return n;
}
export function similar(a: Media, b: Media) {
  return (
    !!a.scan?.perceptual &&
    !!b.scan?.perceptual &&
    Math.abs(a.created - b.created) <= 120000 &&
    Math.abs(a.width / Math.max(1, a.height) - b.width / Math.max(1, b.height)) < 0.15 &&
    hamming(a.scan.perceptual, b.scan.perceptual) <= 6
  );
}
export function bestScore(m: Media) {
  return (
    (m.favorite || m.systemFavorite ? 10000 : 0) +
    Math.log2(Math.max(1, m.width * m.height)) * 10 +
    Math.min(100, m.scan?.sharpness ?? 0) -
    Math.abs((m.scan?.exposure ?? 128) - 128) / 4
  );
}
export function entitlementActive(e: Entitlement | null, now = Date.now()) {
  return !!e?.active && (e.expires === null || e.expires > now);
}
export function bytes(n?: number) {
  if (n === undefined) return "Size unavailable";
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1073741824) return `${(n / 1048576).toFixed(1)} MB`;
  return `${(n / 1073741824).toFixed(2)} GB`;
}
export function pixelAnalysis(
  rgba: Uint8ClampedArray | number[],
  width: number,
  height: number,
): Pick<Analysis, "perceptual" | "sharpness" | "exposure"> {
  const gray = Array.from(
    { length: width * height },
    (_, i) => 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2],
  );
  let hash = "",
    sum = 0,
    sum2 = 0,
    n = 0;
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      const yy = Math.floor((y * (height - 1)) / 7),
        xx = Math.floor((x * (width - 2)) / 7);
      hash += gray[yy * width + xx] > gray[yy * width + xx + 1] ? "1" : "0";
    }
  for (let y = 1; y < height - 1; y++)
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x,
        v = gray[i - 1] + gray[i + 1] + gray[i - width] + gray[i + width] - 4 * gray[i];
      sum += v;
      sum2 += v * v;
      n++;
    }
  return {
    perceptual: hash,
    sharpness: n ? sum2 / n - (sum / n) ** 2 : 0,
    exposure: gray.reduce((a, b) => a + b, 0) / gray.length,
  };
}
