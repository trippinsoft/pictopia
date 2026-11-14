/**
 * Memory Wall model (pure). Every year with photos owns one rectangle of a single 360 × 450
 * illustration. Years are laid out oldest → newest in rows (an ordered "strip" treemap), sized
 * approximately by photo count with a minimum size so small years stay readable and tappable.
 * Because the rectangles partition the canvas exactly, closing the gaps between them always
 * reconstructs the full picture.
 *
 * Inside a year, each month with photos owns a contiguous block (same ordered layout), and each
 * block is split into tiles that reveal centre-out as that month's photos are explored. Reveal
 * fractions come straight from the progress counts, so the visible artwork is exact; partially
 * revealed tiles fill from the bottom. Photos the phone confirmed deleted stay revealed.
 */
import type { WallMonth } from "@/services/storage.types";
import { WALL_H, WALL_W } from "./memory-wall-art";

export { WALL_W, WALL_H };
export type Rect = { x: number; y: number; w: number; h: number };
export const UNDATED = "unknown";
/** Overview tile edge in canvas units (≈1,300 tiles over the wall); year views use half. */
export const OVERVIEW_TILE = 11;
export const YEAR_TILE = 5.5;
/** Minimum share of the picture for any year, so a 1-photo year is still a readable, tappable
 * cell (≈45 × 90 units). Capped so many tiny years can never take over the wall. */
const YEAR_FLOOR = 0.025;
const UNDATED_FLOOR = 0.03;
const MIN_ROW = 40;
const MIN_WIDTH = 40;
const MONTH_FLOOR = 0.035;
const MAX_REUSED_ASPECT = 3.4;

export interface WallBlock {
  key: string; // "2018-03" or "unknown"
  month?: number; // 1–12; undefined for undated
  total: number; explored: number; cleared: number; remaining: number;
  rect: Rect;
}
export interface WallYear {
  key: string; // "2018" or "unknown"
  total: number; explored: number; cleared: number; remaining: number;
  rect: Rect;
  blocks: WallBlock[];
}
export interface WallModel {
  years: WallYear[];
  /** Photos on the wall: accessible + confirmed deletions. */
  photos: number;
  /** Explored accessible photos + confirmed deletions. */
  explored: number;
  remaining: number;
  cleared: number;
  /** Arrangement of year keys (rows → columns → stacked years), saved so the layout stays
   * stable between visits. */
  rows: string[][][];
}
export type SavedWallLayout = { rows: string[][][] };

const weight = (m: { total: number; cleared: number }) => m.total + m.cleared;
export const revealFraction = (m: { total: number; explored: number; cleared: number }) => {
  const all = weight(m);
  return all > 0 ? Math.min(1, (m.explored + m.cleared) / all) : 0;
};

/** Normalised shares with a per-item floor. */
function shares(weights: number[], floors: number[]) {
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const raw = weights.map((w, i) => Math.max(w / total, floors[i]));
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map((s) => s / sum);
}

function placeRows(sh: number[], groups: [number, number][], area: Rect) {
  const out: Rect[] = [];
  let y = area.y;
  for (const [i, j] of groups) {
    let rs = 0;
    for (let k = i; k < j; k++) rs += sh[k];
    const rh = rs * area.h;
    let x = area.x;
    for (let k = i; k < j; k++) {
      const rw = (area.w * sh[k]) / rs;
      out.push({ x, y, w: rw, h: rh });
      x += rw;
    }
    y += rh;
  }
  // Close floating-point seams exactly on the outer edges.
  return out;
}

/** Ordered strip treemap: items keep their order, rows chosen by dynamic programming to keep
 * cells close to square, avoid stretched cells and respect minimum row height / cell width. */
export function stripLayout(weights: number[], area: Rect, floors: number[], minRow = 0, minWidth = 0): { rects: Rect[]; groups: [number, number][] } {
  const n = weights.length;
  if (!n) return { rects: [], groups: [] };
  const sh = shares(weights, floors);
  const best = [0], cut = [0];
  for (let j = 1; j <= n; j++) {
    best[j] = Infinity;
    for (let i = 0; i < j; i++) {
      let rs = 0;
      for (let k = i; k < j; k++) rs += sh[k];
      const rh = rs * area.h;
      let cost = 0;
      for (let k = i; k < j; k++) {
        const rw = (area.w * sh[k]) / rs, a = Math.max(rw / rh, rh / rw);
        cost += Math.log(a) ** 2 * sh[k];
        if (rw < minWidth) cost += 50;
        if (a > 3) cost += (a - 3) * 3;
      }
      if (rh < minRow) cost += 50;
      const v = best[i] + cost + 0.004;
      if (v < best[j]) { best[j] = v; cut[j] = i; }
    }
  }
  const groups: [number, number][] = [];
  for (let j = n; j > 0; j = cut[j]) groups.unshift([cut[j], j]);
  return { rects: placeRows(sh, groups, area), groups };
}

/** Months → years (chronological, undated last), skipping empty years. */
export function groupYears(months: WallMonth[]) {
  const byYear = new Map<string, WallMonth[]>();
  for (const m of months) {
    if (weight(m) <= 0) continue;
    const year = m.key === UNDATED ? UNDATED : m.key.slice(0, 4);
    byYear.set(year, [...(byYear.get(year) ?? []), m]);
  }
  const keys = [...byYear.keys()].filter((k) => k !== UNDATED).sort();
  if (byYear.has(UNDATED)) keys.push(UNDATED);
  return keys.map((key) => {
    const list = (byYear.get(key) ?? []).slice().sort((a, b) => a.key.localeCompare(b.key));
    const sum = (f: (m: WallMonth) => number) => list.reduce((n, m) => n + f(m), 0);
    return { key, months: list, total: sum((m) => m.total), explored: sum((m) => m.explored), cleared: sum((m) => m.cleared), remaining: sum((m) => m.remaining) };
  });
}

const sameKeys = (a: string[], b: string[]) => a.length === b.length && a.every((k, i) => k === b[i]);

/** A year row: consecutive columns, each a vertical stack of 1–3 consecutive years (index ranges). */
type RowPlan = [number, number][];
const MAX_STACK = 3;

function itemCost(w: number, h: number, share: number, minW: number, minH: number) {
  const a = Math.max(w / h, h / w);
  let cost = Math.log(a) ** 2 * share;
  if (w < minW) cost += 50;
  if (h < minH) cost += 50;
  if (a > 3) cost += (a - 3) * 3;
  return cost;
}

/** Best column split (stacks of consecutive items) for items i..j filling one row. */
function planRow(sh: number[], i: number, j: number, area: Rect, minW: number, minH: number): { cost: number; plan: RowPlan } {
  let rs = 0;
  for (let k = i; k < j; k++) rs += sh[k];
  const rh = rs * area.h;
  const best: number[] = [0], cut: number[] = [i];
  for (let k = i + 1; k <= j; k++) {
    best[k - i] = Infinity;
    for (let m = Math.max(i, k - MAX_STACK); m < k; m++) {
      let cs = 0;
      for (let t = m; t < k; t++) cs += sh[t];
      const cw = (area.w * cs) / rs;
      let cost = 0;
      for (let t = m; t < k; t++) cost += itemCost(cw, (rh * sh[t]) / cs, sh[t], minW, minH);
      const v = best[m - i] + cost;
      if (v < best[k - i]) { best[k - i] = v; cut[k - i] = m; }
    }
  }
  const plan: RowPlan = [];
  for (let k = j; k > i; k = cut[k - i]) plan.unshift([cut[k - i], k]);
  return { cost: best[j - i], plan };
}

function placePlan(sh: number[], rows: RowPlan[], area: Rect) {
  const out: Rect[] = [];
  let y = area.y;
  for (const row of rows) {
    let rs = 0;
    for (const [a, b] of row) for (let k = a; k < b; k++) rs += sh[k];
    const rh = rs * area.h;
    let x = area.x;
    for (const [a, b] of row) {
      let cs = 0;
      for (let k = a; k < b; k++) cs += sh[k];
      const cw = (area.w * cs) / rs;
      let yy = y;
      for (let k = a; k < b; k++) {
        const ih = (rh * sh[k]) / cs;
        out[k] = { x, y: yy, w: cw, h: ih };
        yy += ih;
      }
      x += cw;
    }
    y += rh;
  }
  return out;
}

/** Ordered rows of columns: years keep reading order (rows top to bottom, columns left to
 * right, stacks top to bottom). Tiny neighbouring years stack inside a column instead of
 * squeezing a whole row thin, so every year stays at least MIN_WIDTH × MIN_ROW where possible. */
function plannedLayout(sh: number[], area: Rect, minW: number, minH: number): RowPlan[] {
  const n = sh.length;
  const best = [0], cut = [0], plans: RowPlan[] = [];
  const rowPlan: Record<string, RowPlan> = {};
  for (let j = 1; j <= n; j++) {
    best[j] = Infinity;
    for (let i = 0; i < j; i++) {
      const { cost, plan } = planRow(sh, i, j, area, minW, minH);
      const v = best[i] + cost + 0.004;
      if (v < best[j]) { best[j] = v; cut[j] = i; rowPlan[`${i}:${j}`] = plan; }
    }
  }
  for (let j = n; j > 0; j = cut[j]) plans.unshift(rowPlan[`${cut[j]}:${j}`]);
  return plans;
}


/** Year rectangles. Reuses the saved arrangement while the year list is unchanged and every
 * cell stays well-shaped, so photo-count drift never reshuffles the wall. */
export function layoutYears(years: { key: string; total: number; cleared: number }[], saved?: SavedWallLayout) {
  const area = { x: 0, y: 0, w: WALL_W, h: WALL_H };
  const weights = years.map(weight);
  // Fewer years can afford bigger minimums (up to 6%); many years share at most half the wall.
  const floor = Math.max(Math.min(YEAR_FLOOR, 0.5 / Math.max(1, years.length)), Math.min(0.06, 0.5 / Math.max(1, years.length)));
  const floors = years.map((y) => (y.key === UNDATED ? Math.max(floor, Math.min(UNDATED_FLOOR, 0.6 / Math.max(1, years.length))) : floor));
  const sh = shares(weights, floors);
  const keys = years.map((y) => y.key);
  const toKeys = (rows: RowPlan[]) => rows.map((row) => row.map(([a, b]) => keys.slice(a, b)));
  if (saved?.rows?.length && sameKeys(saved.rows.flat(2), keys)) {
    let i = 0;
    const rows: RowPlan[] = saved.rows.map((row) => row.map((col) => { const range: [number, number] = [i, i + col.length]; i += col.length; return range; }));
    const rects = placePlan(sh, rows, area);
    const ok = rects.every((r) => r.w >= MIN_WIDTH * 0.85 && r.h >= MIN_ROW * 0.85 && Math.max(r.w / r.h, r.h / r.w) <= MAX_REUSED_ASPECT);
    if (ok) return { rects, rows: toKeys(rows) };
  }
  const rows = plannedLayout(sh, area, MIN_WIDTH, MIN_ROW);
  return { rects: placePlan(sh, rows, area), rows: toKeys(rows) };
}

export function buildWall(months: WallMonth[], saved?: SavedWallLayout): WallModel {
  const grouped = groupYears(months);
  const { rects, rows } = layoutYears(grouped, saved);
  const years: WallYear[] = grouped.map((g, i) => {
    const rect = rects[i];
    const { rects: blockRects } = stripLayout(g.months.map(weight), rect, g.months.map(() => (g.months.length > 1 ? MONTH_FLOOR : 0)));
    const blocks = g.months.map((m, k) => ({
      key: m.key, month: m.key === UNDATED ? undefined : Number(m.key.slice(5, 7)),
      total: m.total, explored: m.explored, cleared: m.cleared, remaining: m.remaining, rect: blockRects[k],
    }));
    return { key: g.key, total: g.total, explored: g.explored, cleared: g.cleared, remaining: g.remaining, rect, blocks };
  });
  const sum = (f: (y: WallYear) => number) => years.reduce((n, y) => n + f(y), 0);
  return {
    years, rows,
    photos: sum((y) => y.total + y.cleared), explored: sum((y) => y.explored + y.cleared),
    remaining: sum((y) => y.remaining), cleared: sum((y) => y.cleared),
  };
}

/** Deterministic 0–1 hash for stable tile jitter. */
function hash(a: number, b: number) {
  let h = (a * 374761393 + b * 668265263) ^ 0x5bd1e995;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const keySeed = (key: string) => [...key].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) | 0, 7);

export interface Tile { x: number; y: number; w: number; h: number; /** 0–1 revealed (from the bottom). */ fill: number }

/** Tiles for one month block: never more tiles than photos, roughly square, revealed centre-out. */
export function blockTiles(block: Pick<WallBlock, "key" | "total" | "explored" | "cleared" | "rect">, tileSize: number): Tile[] {
  const { rect } = block, count = Math.max(1, weight(block));
  const size = Math.max(tileSize, Math.sqrt((rect.w * rect.h) / count));
  let cols = Math.max(1, Math.round(rect.w / size)), rows = Math.max(1, Math.round(rect.h / size));
  // Rounding can overshoot; trim the longer side until there are no more tiles than photos.
  while (cols * rows > count) { if (cols >= rows && cols > 1) cols--; else if (rows > 1) rows--; else break; }
  const tw = rect.w / cols, th = rect.h / rows, seed = keySeed(block.key);
  const cells: (Tile & { d: number })[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const dx = (c + 0.5) * tw - rect.w / 2, dy = (r + 0.5) * th - rect.h / 2;
    cells.push({ x: rect.x + c * tw, y: rect.y + r * th, w: tw, h: th, fill: 0, d: Math.hypot(dx, dy) + hash(c + seed, r) * size * 0.9 });
  }
  cells.sort((a, b) => a.d - b.d);
  const units = revealFraction(block) * cells.length;
  return cells.map((t, k) => ({ x: t.x, y: t.y, w: t.w, h: t.h, fill: Math.max(0, Math.min(1, units - k)) }));
}

/** Tile cover as a few SVG paths (one grout + four shades), however many tiles there are. */
export function coverPaths(model: WallModel, tileSize: number, only?: (year: WallYear) => boolean) {
  const grout: string[] = [], shade: string[][] = [[], [], [], []];
  const f = (n: number) => n.toFixed(2);
  model.years.forEach((year, yi) => {
    if (only && !only(year)) return;
    year.blocks.forEach((block, bi) => blockTiles(block, tileSize).forEach((t, ti) => {
      if (t.fill >= 1) return;
      const hh = t.h * (1 - t.fill);
      grout.push(`M${f(t.x)} ${f(t.y)}h${f(t.w)}v${f(hh)}h${f(-t.w)}z`);
      const g = Math.min(0.45, t.w * 0.06);
      if (hh > 2 * g) shade[Math.floor(hash(ti + bi * 97, yi) * 4)].push(`M${f(t.x + g)} ${f(t.y + g)}h${f(t.w - 2 * g)}v${f(hh - 2 * g)}h${f(-(t.w - 2 * g))}z`);
    }));
  });
  return { grout: grout.join(""), shades: shade.map((s) => s.join("")) };
}

/** Internal boundaries between year rectangles (the visible gaps). */
export function gapLines(model: WallModel) {
  const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (const { rect: r } of model.years) {
    if (r.x > 0.1) lines.push({ x1: r.x, y1: r.y, x2: r.x, y2: r.y + r.h });
    if (r.y > 0.1) lines.push({ x1: r.x, y1: r.y, x2: r.x + r.w, y2: r.y });
  }
  return lines;
}

/** Window for a year close-up: at least an Adventure-card-sized area around the year, so small
 * years are shown in context (neighbours dimmed) instead of as an empty crop. */
export function frameFor(rect: Rect, minW = 150, minH = 128): Rect {
  const w = Math.min(WALL_W, Math.max(rect.w + 14, minW)), h = Math.min(WALL_H, Math.max(rect.h + 14, minH));
  const x = Math.max(0, Math.min(WALL_W - w, rect.x + rect.w / 2 - w / 2));
  const y = Math.max(0, Math.min(WALL_H - h, rect.y + rect.h / 2 - h / 2));
  return { x, y, w, h };
}

/** First month (chronological) that still has photos to explore. */
export const nextBlock = (year: WallYear) => year.blocks.find((b) => b.remaining > 0);
export const yearComplete = (y: Pick<WallYear, "remaining" | "total" | "cleared">) => y.remaining === 0 && weight(y) > 0;
export const yearLabel = (key: string) => (key === UNDATED ? "Undated" : key);
