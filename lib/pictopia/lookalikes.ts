/** Duplicate Hunt: finding look-alike photos from tiny on-device previews only.
 *
 * Each photo gets a "print": a 256-bit difference hash of its 32×32 grey preview (16×16
 * grid of left/right comparisons), stored as 64 hex characters. The print is computed the
 * same way on iOS, Android and the web (see `lookalikePrint`), so groups never depend on
 * reading or downloading originals.
 *
 * Two photos belong together when either
 *  - they are copies: prints almost identical and the same shape, taken at any time; or
 *  - they are similar shots: prints close and the same shape, taken within a few minutes.
 * Groups are the connected sets of those pairs. Nothing here decides or deletes anything. */

export const LOOKALIKE_SIDE = 32;
/** Prints differing in at most this many of 256 bits are copies of one picture. */
export const COPY_DISTANCE = 8;
/** Prints differing in at most this many bits, taken close together, are similar shots. */
export const SIMILAR_DISTANCE = 30;
/** Similar shots must be taken within this window of each other. */
export const SIMILAR_WINDOW_MS = 10 * 60_000;
/** Largest group shown; very long bursts are split into runs of this size. */
export const GROUP_LIMIT = 24;

export interface LookalikePrint {
  /** 64 hex characters (256 bits). */
  print: string;
  sharpness: number;
  exposure: number;
}
/** What a photo carries once printed. `v` is the photo's `modified` stamp at the time. */
export interface MediaLook {
  v: number;
  print?: string;
  sharpness?: number;
  /** The preview couldn't be read on this device; tried again a day after `at`. */
  failed?: boolean;
  at?: number;
}
export interface LookalikeCandidate {
  id: string;
  created: number;
  width: number;
  height: number;
  print: string;
  sharpness?: number;
  favorite?: boolean;
  size?: number;
}
export interface LookalikeGroup {
  id: string;
  /** Oldest first, the order the shots were taken. */
  ids: string[];
  kind: "copies" | "similar";
  /** Newest capture time in the group, for ordering the list. */
  latest: number;
  /** A suggestion only: the sharpest, largest (or favorite) photo. Never pre-marked. */
  best: string;
}

/** Shared print algorithm: `gray` is 32×32 luminance, row-major. */
export function lookalikePrint(gray: ArrayLike<number>): LookalikePrint {
  const side = LOOKALIKE_SIDE;
  let hex = "";
  let nibble = 0, bits = 0;
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const row = Math.floor((y * (side - 1)) / 15);
      const column = Math.floor((x * (side - 2)) / 15);
      const i = row * side + column;
      nibble = (nibble << 1) | (gray[i] > gray[i + 1] ? 1 : 0);
      if (++bits === 4) { hex += nibble.toString(16); nibble = 0; bits = 0; }
    }
  let sum = 0, squares = 0, n = 0, total = 0;
  for (let i = 0; i < side * side; i++) total += gray[i];
  for (let y = 1; y < side - 1; y++)
    for (let x = 1; x < side - 1; x++) {
      const i = y * side + x;
      const v = gray[i - 1] + gray[i + 1] + gray[i - side] + gray[i + side] - 4 * gray[i];
      sum += v; squares += v * v; n++;
    }
  return { print: hex, sharpness: n ? squares / n - (sum / n) ** 2 : 0, exposure: total / (side * side) };
}

/** RGBA (32×32×4) to luminance with the same weights as every platform. */
export function luminance(rgba: ArrayLike<number>) {
  const out = new Array<number>(LOOKALIKE_SIDE * LOOKALIKE_SIDE);
  for (let i = 0; i < out.length; i++) out[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
  return out;
}

const POP = Array.from({ length: 16 }, (_, n) => (n & 1) + ((n >> 1) & 1) + ((n >> 2) & 1) + ((n >> 3) & 1));
export function printDistance(a: string, b: string) {
  if (a.length !== b.length) return 256;
  let d = 0;
  for (let i = 0; i < a.length; i++) d += POP[parseInt(a[i], 16) ^ parseInt(b[i], 16)];
  return d;
}
/** Nearly flat pictures (black frames, blank walls, pocket shots) all print alike; they are
 * never matched, so unrelated dark photos can't be grouped together. */
export function informative(print: string) {
  if (print.length !== 64) return false;
  let ones = 0;
  for (const c of print) ones += POP[parseInt(c, 16)] ?? 0;
  return ones >= 24 && ones <= 232;
}
const ratio = (c: LookalikeCandidate) => c.width / Math.max(1, c.height);
const sameShape = (a: LookalikeCandidate, b: LookalikeCandidate, tolerance: number) =>
  !a.width || !b.width || !a.height || !b.height || Math.abs(ratio(a) - ratio(b)) <= tolerance * Math.max(ratio(a), ratio(b));

export function keeperScore(c: Pick<LookalikeCandidate, "width" | "height" | "sharpness" | "favorite" | "size">) {
  return (c.favorite ? 10_000 : 0) + Math.log2(Math.max(1, c.width * c.height)) * 10 + Math.min(400, c.sharpness ?? 0) / 4 + Math.log2(Math.max(1, c.size ?? 1));
}

/** Copies anywhere in the library are found through bands of the print: two prints within
 * COPY_DISTANCE bits share at least one of COPY_DISTANCE + 1 bands exactly (pigeonhole). */
const BANDS = COPY_DISTANCE + 1;
const BAND = Math.floor(64 / BANDS);
const BUCKET_LIMIT = 40;

export function groupLookalikes(input: LookalikeCandidate[]): LookalikeGroup[] {
  const items = input.filter(c => informative(c.print)).sort((a, b) => a.created - b.created || (a.id < b.id ? -1 : 1));
  const parent = items.map((_, i) => i);
  const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const union = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb); };
  const copy = new Set<string>();
  const key = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);
  // Similar shots: each photo against the ones taken shortly before it.
  for (let i = 0; i < items.length; i++)
    for (let j = i - 1; j >= 0 && items[i].created - items[j].created <= SIMILAR_WINDOW_MS && i - j <= 60; j--) {
      if (!sameShape(items[i], items[j], 0.04)) continue;
      const d = printDistance(items[i].print, items[j].print);
      if (d <= SIMILAR_DISTANCE) { union(i, j); if (d <= COPY_DISTANCE) copy.add(key(i, j)); }
    }
  // Copies: anywhere in time, through shared bands.
  for (let band = 0; band < BANDS; band++) {
    const buckets = new Map<string, number[]>();
    for (let i = 0; i < items.length; i++) {
      const k = items[i].print.slice(band * BAND, band * BAND + BAND);
      const list = buckets.get(k);
      if (list) list.push(i); else buckets.set(k, [i]);
    }
    for (const list of buckets.values()) {
      if (list.length < 2 || list.length > BUCKET_LIMIT) continue;
      for (let a = 0; a < list.length; a++)
        for (let b = a + 1; b < list.length; b++) {
          const i = list[a], j = list[b];
          if (copy.has(key(i, j)) || !sameShape(items[i], items[j], 0.02)) continue;
          if (printDistance(items[i].print, items[j].print) <= COPY_DISTANCE) { union(i, j); copy.add(key(i, j)); }
        }
    }
  }
  const sets = new Map<number, number[]>();
  for (let i = 0; i < items.length; i++) {
    const root = find(i);
    const list = sets.get(root);
    if (list) list.push(i); else sets.set(root, [i]);
  }
  const groups: LookalikeGroup[] = [];
  for (const members of sets.values()) {
    if (members.length < 2) continue;
    for (let start = 0; start < members.length; start += GROUP_LIMIT) {
      let run = members.slice(start, start + GROUP_LIMIT);
      // A lone leftover photo joins the previous run rather than standing alone.
      if (run.length < 2) continue;
      if (members.length - (start + GROUP_LIMIT) === 1) run = members.slice(start);
      const all = run.every((a, x) => run.every((b, y) => y <= x || copy.has(key(a, b))));
      const best = run.reduce((a, b) => (keeperScore(items[b]) > keeperScore(items[a]) ? b : a));
      groups.push({
        id: `look-${items[run[0]].id}`,
        ids: run.map(i => items[i].id),
        kind: all ? "copies" : "similar",
        latest: Math.max(...run.map(i => items[i].created)),
        best: items[best].id,
      });
      if (run.length > GROUP_LIMIT) break;
    }
  }
  return groups.sort((a, b) => b.latest - a.latest || (a.id < b.id ? -1 : 1));
}

/** The words for one group, used on the grid and in the review header. */
export function groupLabel(kind: LookalikeGroup["kind"], count: number) {
  return kind === "copies" ? `${count} identical copies` : `${count} similar shots`;
}
