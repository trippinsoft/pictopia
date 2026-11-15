/**
 * Memory Wall artwork: "Mountains to the Sea", one believable storybook world read top to bottom
 * (peaks → lake → forest, farms, castle, village → viaduct → seaside town, beach and sea).
 * Flat Storybook shapes, no outlines, colours from `worldArt` in theming/illustration.ts.
 * Dark mode draws the same place at night (`nightWorld`): moon and stars instead of the sun, lit
 * windows, street lamps, lanterns, the lighthouse beam and moonlight on the water.
 *
 * Drawn on a fixed 360 × 450 canvas (WALL_W × WALL_H) and returned as SVG markup so the wall can
 * render the same picture at any crop (whole wall, a year's window) with one SvgXml layer.
 * Detail is spread evenly, including the top strip where small early years usually land.
 */
import { nightWorld, worldArt, type WorldPalette } from "@/theming/illustration";

export const WALL_W = 360;
export const WALL_H = 450;

type N = number;
/** The palette and time of day being drawn (set by `draw`). */
let c: WorldPalette = worldArt;
let night = false;
/** Small lit windows and screens glow warm at night and stay pale by day. */
const pane = () => (night ? c.lit : c.paper);
/** A soft halo of warm light (night only). */
const halo = (x: N, y: N, r: N, o = ".28") => (night ? Ci(x, y, r, c.glow, `opacity="${o}"`) : "");
const R = (x: N, y: N, w: N, h: N, f: string, o = "") => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${f}" ${o}/>`;
const Ci = (x: N, y: N, r: N, f: string, o = "") => `<circle cx="${x}" cy="${y}" r="${r}" fill="${f}" ${o}/>`;
const E = (x: N, y: N, rx: N, ry: N, f: string, o = "") => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${f}" ${o}/>`;
const P = (d: string, f: string, o = "") => `<path d="${d}" fill="${f}" ${o}/>`;
const L = (d: string, s: string, w: N, o = "") => `<path d="${d}" fill="none" stroke="${s}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" ${o}/>`;
const G = (t: string, inner: string) => `<g transform="${t}">${inner}</g>`;
const ring = (x: N, y: N, r: N, s: string, w: N) => `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${s}" stroke-width="${w}"/>`;

const cloud = (x: N, y: N, s = 1) => G(`translate(${x} ${y}) scale(${s})`, E(0, 0, 10, 4.5, c.cloud) + E(-5, -3, 5.5, 4, c.cloud) + E(3, -4, 6, 5, c.cloud));
const pine = (x: N, y: N, h: N, f: string = c.tealDeep) => `<polygon points="${x},${y - h} ${x - h * 0.32},${y} ${x + h * 0.32},${y}" fill="${f}"/>` + R(x - 0.8, y, 1.6, h * 0.12, f);
const sparkle = (x: N, y: N, r: N, f: string) => P(`M${x} ${y - r}Q${x + r * 0.18} ${y - r * 0.18} ${x + r} ${y}Q${x + r * 0.18} ${y + r * 0.18} ${x} ${y + r}Q${x - r * 0.18} ${y + r * 0.18} ${x - r} ${y}Q${x - r * 0.18} ${y - r * 0.18} ${x} ${y - r}Z`, f);
const balloon = (x: N, y: N, s = 1, a: string = c.terracotta, b: string = c.sun) => G(`translate(${x - 60 * s} ${y - 28 * s}) scale(${s})`, P("M60 28C42 28 38 50 46 62L54 72H66L74 62C82 50 78 28 60 28Z", a) + P("M60 28C54 34 52 54 56 72H64C68 54 66 34 60 28Z", b) + L("M47 46H73", c.paper, 1.2, 'opacity=".7"') + L("M55 72L56 80M65 72L64 80", c.ink, 0.8) + R(54.5, 80, 11, 7, c.sandDeep, 'rx="1.5"'));
const birds = (x: N, y: N) => L(`M${x} ${y}q3 -3 6 0q3 -3 6 0`, c.ink, 1);
const flowers = (x: N, y: N, f: string) => Ci(x, y, 3, f) + Ci(x + 6, y + 3, 2.4, c.rose) + Ci(x - 5, y + 4, 2.2, c.sun);
const lighthouse = (x: N, y: N, s = 1) => G(`translate(${x} ${y}) scale(${s})`, P("M-7 0L-4 -34H4L7 0Z", c.paper) + R(-6, -14, 12, 5, c.terracotta) + R(-5, -26, 10, 4, c.terracotta) + R(-5, -40, 10, 6, night ? c.glow : c.sun) + P("M-7 -40L0 -47L7 -40Z", c.terracotta) + (night ? Ci(0, -37, 9, c.glow, 'opacity=".4"') + P("M-5 -38L-120 -60V-14Z", c.glow, 'opacity=".16"') + P("M5 -38L26 -46V-30Z", c.glow, 'opacity=".5"') : P("M5 -38L26 -46V-30Z", c.sun, 'opacity=".35"')));
const windmill = (x: N, y: N, s = 1) => G(`translate(${x} ${y}) scale(${s})`, P("M-6 0L-3 -28H3L6 0Z", c.paper) + R(-2, -8, 4, 8, c.ink, 'opacity=".75"') + P("M0 -28L-15 -38L-13 -41L1 -31ZM0 -28L10 -43L13 -41L3 -26ZM0 -28L15 -18L13 -15L-1 -25ZM0 -28L-10 -13L-13 -15L-3 -30Z", c.teal) + Ci(0, -28, 2.2, c.ink));
const tent = (x: N, y: N, s = 1, f: string = c.terracotta) => G(`translate(${x} ${y}) scale(${s})`, P("M-14 0L0 -20L14 0Z", f) + P("M0 -20L-4 0H4Z", night ? c.lit : c.ink, 'opacity=".7"') + L("M0 -20V-25", c.ink, 1));
const fire = (x: N, y: N) => halo(x, y - 4, 14, ".18") + halo(x, y - 4, 7, ".35") + L(`M${x - 5} ${y + 2}L${x + 5} ${y - 1}M${x - 5} ${y - 1}L${x + 5} ${y + 2}`, c.sandDeep, 2) + P(`M${x} ${y - 12}C${x + 3} ${y - 8} ${x + 5} ${y - 5} ${x + 5} ${y - 2}a5 5 0 0 1 -10 0c0 -3 2 -5 3 -6c0 2 1 3 2 3c-1 -3 0 -5 0 -7z`, c.terracotta) + Ci(x, y - 2.5, 2, c.sun);
const boat = (x: N, y: N, s = 1) => G(`translate(${x} ${y}) scale(${s})`, P("M-12 0H12L8 6H-8Z", c.terracotta) + L("M0 0V-20", c.ink, 1) + P("M1 -19L12 -2H1Z", c.paper) + P("M-1 -16L-9 -2H-1Z", c.sun) + (night ? Ci(0, -21, 5, c.glow, 'opacity=".3"') + Ci(0, -21, 1.6, c.glow) + L("M-3 9v6M3 11v4", c.glow, 1, 'opacity=".4"') : ""));
const clockTower = (x: N, y: N, s = 1) => G(`translate(${x} ${y}) scale(${s})`, R(-8, -40, 16, 40, c.sand) + P("M-10 -40L0 -54L10 -40Z", c.teal) + (night ? Ci(0, -30, 10, c.glow, 'opacity=".3"') : "") + Ci(0, -30, 6, night ? c.moon : c.paper) + L("M0 -30V-34.5M0 -30L3 -28.5", c.ink, 1.1) + R(-3, -10, 6, 10, night ? c.lit : c.ink, 'opacity=".75"'));
const kite = (x: N, y: N, s = 1) => G(`translate(${x} ${y}) scale(${s})`, P("M0 -10L8 0L0 12L-8 0Z", c.teal) + P("M0 -10L8 0L0 0Z", c.tealLight) + L("M0 12Q-6 22 2 30Q-6 38 0 46", c.teal, 1));
const waves = (x: N, y: N) => L(`M${x} ${y}q3 -2.5 6 0q3 -2.5 6 0`, c.paper, 1.1, 'opacity=".75"');
const ferris = (x: N, y: N, r: N) => {
  let s = L(`M${x} ${y}L${x - r * 0.6} ${y + r + 6}M${x} ${y}L${x + r * 0.6} ${y + r + 6}`, c.ink, 1.4) + ring(x, y, r, c.teal, 1.6);
  const cols = [c.terracotta, c.sun, c.tealLight, c.coral, c.moss, c.rose, c.sun, c.terracotta];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    s += L(`M${x} ${y}L${px} ${py}`, c.teal, 0.7) + R(px - 3, py + 1, 6, 5, cols[i], 'rx="1.5"');
  }
  if (night) for (let i = 0; i < 16; i++) s += Ci(x + Math.cos((i / 16) * Math.PI * 2 + 0.2) * r, y + Math.sin((i / 16) * Math.PI * 2 + 0.2) * r, 0.7, c.glow);
  return s + Ci(x, y, 2.4, c.ink);
};
const bunting = (x1: N, y1: N, x2: N, y2: N) => {
  let s = L(`M${x1} ${y1}Q${(x1 + x2) / 2} ${y1 + 8} ${x2} ${y2}`, c.ink, 0.6);
  const cols = [c.terracotta, c.sun, c.teal, c.moss];
  for (let i = 1; i < 8; i++) {
    const t = i / 8, x = x1 + (x2 - x1) * t, y = y1 + (y2 - y1) * t + 8 * 4 * t * (1 - t) * 0.5;
    s += P(`M${x - 2.5} ${y}h5l-2.5 5z`, cols[i % 4]) + (night ? halo(x, y, 2.2, ".45") + Ci(x, y, 0.7, c.glow) : "");
  }
  return s;
};
const sailboat = (x: N, y: N) => P(`M${x - 24} ${y}h48l-7 9h-34z`, c.terracotta) + L(`M${x} ${y}v-36`, c.ink, 1.2) + P(`M${x + 2} ${y - 34}l18 30h-18z`, c.paper) + P(`M${x - 2} ${y - 30}l-16 26h16z`, c.sun) + R(x + 6, y - 18, 6, 6, c.tealLight, 'opacity=".7"') + P(`M${x} ${y - 36}l8 3l-8 3z`, c.teal);
const pines = (pts: [N, N, N][], f: string = c.forest) => pts.map(([x, y, h], i) => pine(x, y, h, i % 3 ? f : c.forest2)).join("");
const rTree = (x: N, y: N, r: N, f: string = c.moss) => R(x - 0.8, y, 1.6, r * 1.2, c.wood) + Ci(x, y, r, f) + Ci(x - r * 0.35, y - r * 0.3, r * 0.45, c.paper, 'opacity=".18"');
const home = (x: N, y: N, w: N, h: N, wall: string, roof: string, flat = false) => {
  let s = R(x, y - h, w, h, wall);
  s += flat ? R(x - 1, y - h - 4, w + 2, 4, roof) : P(`M${x - 1.5} ${y - h}L${x + w / 2} ${y - h - w * 0.5}L${x + w + 1.5} ${y - h}Z`, roof);
  const cols = Math.max(1, Math.floor(w / 6));
  for (let i = 0; i < cols; i++) {
    const wx = x + 2 + (i * (w - 4)) / cols, ww = Math.min(3, (w - 4) / cols - 1);
    s += pane2(wx, y - h + 3, ww, x + y + i);
    if (h > 12) s += pane2(wx, y - h + 9, ww, x + y + i + 3);
  }
  return s + R(x + w / 2 - 1.5, y - 5, 3, 5, c.ink, 'opacity=".7"');
};
/** A house window: dark glass by day; at night most are lit, a few stay dark. */
function pane2(x: N, y: N, w: N, seed: N) {
  if (night && Math.round(seed * 7) % 5 < 3) return R(x, y, w, 3, c.lit, 'opacity=".95"');
  return R(x, y, w, 3, c.glass, `opacity="${c.glassOpacity}"`);
}
const church = (x: N, y: N) => R(x, y - 16, 22, 16, c.wall1) + P(`M${x - 1} ${y - 16}L${x + 11} ${y - 26}L${x + 23} ${y - 16}Z`, c.roof2) + R(x + 16, y - 34, 8, 34, c.wall1) + P(`M${x + 15} ${y - 34}L${x + 20} ${y - 48}L${x + 25} ${y - 34}Z`, c.roof2) + halo(x + 20, y - 28, 5) + Ci(x + 20, y - 28, 2.4, night ? c.lit : c.sun) + P(`M${x + 8} ${y}v-7a3 3 0 0 1 6 0v7z`, night ? c.lit : c.ink, 'opacity=".7"') + L(`M${x + 20} ${y - 48}v-4M${x + 18.4} ${y - 50.4}h3.2`, c.ink, 0.7);
const castle = (x: N, y: N) => R(x, y - 22, 40, 22, c.stone) + [0, 1, 2, 3, 4, 5, 6].map((i) => R(x + i * 6, y - 25, 4, 3, c.stone)).join("") + R(x - 8, y - 36, 12, 36, c.stone) + R(x + 34, y - 40, 12, 40, c.stone) + P(`M${x - 9} ${y - 36}L${x - 2} ${y - 48}L${x + 5} ${y - 36}Z`, c.roof1) + P(`M${x + 33} ${y - 40}L${x + 40} ${y - 54}L${x + 47} ${y - 40}Z`, c.roof1) + L(`M${x + 40} ${y - 54}v-7`, c.ink, 0.8) + P(`M${x + 40} ${y - 61}l7 2l-7 2z`, c.sun) + P(`M${x + 15} ${y}v-10a5 5 0 0 1 10 0v10z`, c.ink, 'opacity=".7"') + (night ? halo(x - 2.5, y - 26, 4) + halo(x + 39.5, y - 28, 4) + R(x - 4, y - 28, 3, 4, c.lit) + R(x + 38, y - 30, 3, 4, c.lit) + R(x + 8, y - 18, 3, 4, c.lit) + R(x + 28, y - 18, 3, 4, c.lit) : R(x - 4, y - 28, 3, 4, c.ink, 'opacity=".6"') + R(x + 38, y - 30, 3, 4, c.ink, 'opacity=".6"')) + L(`M${x - 8} ${y - 10}h56`, c.stoneD, 0.8);
const barn = (x: N, y: N) => R(x, y - 14, 22, 14, c.terracotta) + P(`M${x - 2} ${y - 14}L${x + 11} ${y - 24}L${x + 24} ${y - 14}Z`, c.barnRoof) + R(x + 7, y - 9, 8, 9, c.paper) + L(`M${x + 7} ${y - 9}l8 9M${x + 15} ${y - 9}l-8 9`, c.terracotta, 0.8) + R(x + 25, y - 26, 8, 26, c.stone) + P(`M${x + 25} ${y - 26}a4 4 0 0 1 8 0z`, c.stoneD) + (night ? halo(x + 11, y - 11, 4.5, ".35") + Ci(x + 11, y - 11, 1, c.lit) : "");
const cow = (x: N, y: N) => E(x, y, 5, 3, c.paper) + Ci(x - 2, y - 0.5, 1.4, c.ink) + Ci(x + 2, y + 0.5, 1.1, c.ink) + E(x - 5.5, y - 1, 2, 1.6, c.paper) + L(`M${x - 3} ${y + 2.5}v2M${x + 3} ${y + 2.5}v2`, c.ink, 0.7);
const sheep = (x: N, y: N) => E(x, y, 3.4, 2.4, c.paper) + Ci(x - 3.4, y - 0.6, 1.2, c.ink) + L(`M${x - 1.5} ${y + 2}v1.6M${x + 1.5} ${y + 2}v1.6`, c.ink, 0.6);
const hay = (x: N, y: N) => Ci(x, y, 3, c.sun) + L(`M${x - 2} ${y}a2 2 0 0 1 4 0`, c.hayShade, 0.5);
const tractor = (x: N, y: N) => R(x - 6, y - 6, 10, 5, c.roof4, 'rx="1"') + R(x + 1, y - 10, 5, 5, c.roof4) + R(x + 2, y - 9, 3, 2.4, pane()) + Ci(x - 3, y, 3, c.ink) + Ci(x + 4, y + 1, 2, c.ink);
const bus = (x: N, y: N, f: string = c.sun) => halo(x + 23, y - 2, 4, ".4") + R(x, y - 7, 22, 7, f, 'rx="2"') + [0, 1, 2, 3].map((i) => R(x + 2 + i * 5, y - 6, 3.4, 2.6, pane())).join("") + Ci(x + 5, y, 1.8, c.ink) + Ci(x + 17, y, 1.8, c.ink);
const car = (x: N, y: N, f: string) => halo(x + 12, y - 2, 3.5, ".4") + R(x, y - 4, 11, 4, f, 'rx="1.5"') + R(x + 2, y - 7, 6, 3, f, 'rx="1"') + R(x + 3, y - 6.4, 4, 2, c.paper) + Ci(x + 2.5, y, 1.4, c.ink) + Ci(x + 8.5, y, 1.4, c.ink);
const stall = (x: N, y: N, f: string) => R(x - 7, y - 10, 14, 3, f) + [0, 1, 2, 3].map((i) => R(x - 7 + i * 3.5, y - 10, 1.75, 3, c.paper)).join("") + L(`M${x - 6} ${y - 7}v7M${x + 6} ${y - 7}v7`, c.ink, 0.6) + R(x - 6, y - 3, 12, 3, c.sandDeep) + Ci(x - 3, y - 4, 1.3, c.terracotta) + Ci(x, y - 4, 1.3, c.sun) + Ci(x + 3, y - 4, 1.3, c.moss) + halo(x, y - 6, 7, ".22");
const stoneBridge = (x: N, y: N, w: N) => P(`M${x} ${y}h${w}v8h-4a${w / 2 - 4} 7 0 0 0 -${w - 8} 0h-4z`, c.stone) + L(`M${x} ${y}h${w}`, c.stoneD, 1);
const viaduct = (x1: N, y1: N, x2: N, y2: N, n: N) => {
  let s = "";
  const dx = (x2 - x1) / n, dy = (y2 - y1) / n;
  for (let i = 0; i < n; i++) {
    const x = x1 + i * dx, y = y1 + i * dy;
    s += P(`M${x} ${y}L${x + dx} ${y + dy}V${y + dy + 26}H${x + dx - 2.5}V${y + dy + 14}a${dx / 2 - 2.5} 7 0 0 0 -${dx - 5} 0V${y + 26}H${x}Z`, c.stone);
  }
  return s + L(`M${x1} ${y1}L${x2} ${y2}`, c.stoneD, 1.6) + L(`M${x1} ${y1 - 3}L${x2} ${y2 - 3}`, c.ink, 0.7);
};
const train = (x: N, y: N, ang: N) => G(`translate(${x} ${y}) rotate(${ang})`, R(-40, -9, 14, 8, c.roof2, 'rx="2"') + R(-25, -9, 14, 8, c.sun, 'rx="2"') + R(-10, -9, 14, 8, c.roof4, 'rx="2"') + R(5, -11, 16, 10, c.terracotta, 'rx="2"') + R(16, -16, 3, 5, c.ink) + [-37, -29, -22, -14, -7, 1, 9, 17].map((cx) => Ci(cx, -1, 1.4, c.ink)).join("") + [-38, -23, -8].map((cx) => R(cx, -7.5, 10, 3, pane(), 'opacity=".9"')).join("") + Ci(19, -20, 2.4, c.paper, 'opacity=".8"') + Ci(23, -25, 3.2, c.paper, 'opacity=".6"'));
const chalet = (x: N, y: N) => R(x, y - 12, 20, 12, c.timber) + P(`M${x - 4} ${y - 12}L${x + 10} ${y - 22}L${x + 24} ${y - 12}Z`, c.roof1) + halo(x + 10, y - 7, 9, ".2") + R(x + 3, y - 9, 4, 4, night ? c.lit : c.sun) + R(x + 13, y - 9, 4, 4, night ? c.lit : c.sun) + R(x + 2, y - 4, 16, 1.4, c.paper) + R(x + 14, y - 24, 3, 6, c.stoneD) + [0, 1].map((i) => Ci(x + 16 + i * 3, y - 27 - i * 4, 1.8 + i, c.paper, 'opacity=".8"')).join("");
const cableCar = (x1: N, y1: N, x2: N, y2: N, t: N) => {
  const x = x1 + (x2 - x1) * t, y = y1 + (y2 - y1) * t;
  return L(`M${x1} ${y1}L${x2} ${y2}`, c.ink, 0.7) + L(`M${x} ${y}v4`, c.ink, 0.7) + R(x - 5, y + 4, 10, 8, c.roof1, 'rx="2"') + R(x - 3.5, y + 5.5, 3, 3, pane()) + R(x + 0.5, y + 5.5, 3, 3, pane()) + R(x1 - 3, y1 - 2, 6, 8, c.stoneD) + R(x2 - 3, y2 - 2, 6, 8, c.stoneD);
};
const vineyard = (x: N, y: N, w: N, h: N, rows: N) => {
  let s = P(`M${x} ${y + h}L${x + w * 0.15} ${y}H${x + w}L${x + w * 0.9} ${y + h}Z`, c.field3);
  for (let i = 0; i < rows; i++) {
    const yy = y + 3 + (i * (h - 4)) / rows;
    s += L(`M${x + w * 0.15 - i * 0.8 + 3} ${yy}H${x + w - 3}`, c.moss, 1.6, 'stroke-dasharray="2.5 1.5"');
  }
  return s;
};
let fieldId = 0;
const field = (pts: [N, N][], f: string, stripe?: string) => {
  const d = "M" + pts.map((p) => p.join(" ")).join("L") + "Z";
  let s = P(d, f);
  if (stripe) {
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const id = `wf${fieldId++}`;
    s += `<clipPath id="${id}"><path d="${d}"/></clipPath><g clip-path="url(#${id})">`;
    for (let k = x0 - 40; k < x1 + 40; k += 5) s += L(`M${k} ${y1}L${k + (y1 - y0) * 0.5} ${y0}`, stripe, 0.8, 'opacity=".55"');
    s += "</g>";
  }
  return s;
};
const umbrella = (x: N, y: N, f: string) => L(`M${x} ${y}v-9`, c.ink, 0.7) + P(`M${x - 7} ${y - 9}a7 4 0 0 1 14 0z`, f) + P(`M${x - 2.3} ${y - 9}a2.3 4 0 0 1 4.6 0z`, c.paper, 'opacity=".8"');
const towel = (x: N, y: N, f: string) => R(x, y, 8, 4, f, 'rx=".8"') + L(`M${x + 2} ${y}v4M${x + 5} ${y}v4`, c.paper, 0.6);
const ferry = (x: N, y: N) => P(`M${x - 22} ${y}h44l-5 7h-34z`, c.paper) + R(x - 14, y - 7, 26, 7, c.wall4) + R(x - 8, y - 12, 14, 5, c.paper) + [0, 1, 2, 3, 4].map((i) => (night ? R(x - 12 + i * 5, y - 5, 3, 2.6, c.lit, 'opacity=".95"') : R(x - 12 + i * 5, y - 5, 3, 2.6, c.ink, 'opacity=".5"'))).join("") + R(x + 2, y - 16, 3, 4, c.terracotta) + L(`M${x - 22} ${y + 3}h44`, c.terracotta, 1.4);
const buoy = (x: N, y: N) => P(`M${x - 2} ${y}l2 -6l2 6z`, c.terracotta) + R(x - 2.4, y, 4.8, 1.6, c.paper);
const seal = (x: N, y: N) => E(x, y, 7, 3, c.seal) + Ci(x - 6, y - 2, 2.4, c.seal) + Ci(x - 7, y - 2.4, 0.6, c.ink) + E(x, y + 3.4, 11, 2.4, c.stoneD);
const funicular = (x1: N, y1: N, x2: N, y2: N) => L(`M${x1} ${y1}L${x2} ${y2}`, c.ink, 1) + L(`M${x1 + 2} ${y1 + 2}L${x2 + 2} ${y2 + 2}`, c.ink, 0.5) + G(`translate(${(x1 + x2) / 2} ${(y1 + y2) / 2}) rotate(${(Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI})`, R(-6, -6, 12, 6, c.sun, 'rx="1.5"') + R(-4, -5, 3, 2.4, pane()) + R(1, -5, 3, 2.4, pane()));
const paraglider = (x: N, y: N, f1: string, f2: string) => P(`M${x - 11} ${y}Q${x} ${y - 9} ${x + 11} ${y}Q${x} ${y - 5} ${x - 11} ${y}Z`, f1) + P(`M${x - 4} ${y - 4.4}Q${x} ${y - 6} ${x + 4} ${y - 4.4}L${x + 3} ${y - 2.6}Q${x} ${y - 4} ${x - 3} ${y - 2.6}Z`, f2) + L(`M${x - 10} ${y}L${x} ${y + 9}M${x + 10} ${y}L${x} ${y + 9}M${x - 4} ${y - 3}L${x} ${y + 9}M${x + 4} ${y - 3}L${x} ${y + 9}`, c.ink, 0.35) + Ci(x, y + 10, 1.6, c.roof2);
/** Night replaces the paragliders with drifting paper sky lanterns. */
const skyLantern = (x: N, y: N) => Ci(x, y, 4.2, c.glow, 'opacity=".18"') + P(`M${x - 1.5} ${y - 2}h3l-0.5 3.8h-2z`, c.lit) + R(x - 0.8, y + 1.8, 1.6, 0.6, c.terracotta);
const summitFlag = (x: N, y: N, f: string) => L(`M${x} ${y}v-8`, c.ink, 0.7) + P(`M${x} ${y - 8}l6 2l-6 2z`, f);
const hut = (x: N, y: N) => R(x, y - 7, 12, 7, c.timber) + P(`M${x - 2} ${y - 7}L${x + 6} ${y - 12}L${x + 14} ${y - 7}Z`, c.roof1) + halo(x + 3.5, y - 3.5, 4) + R(x + 2, y - 5, 3, 3, night ? c.lit : c.sun) + L(`M${x + 9} ${y - 12}v-4`, c.ink, 0.5) + P(`M${x + 9} ${y - 16}l4 1.4l-4 1.4z`, c.sun);
const eagle = (x: N, y: N) => L(`M${x - 8} ${y}q4 -4 8 0q4 -4 8 0`, c.eagle, 1.4);
const horse = (x: N, y: N, f: string = c.timber) => E(x, y, 5, 2.6, f) + P(`M${x - 4} ${y - 1}l-3 -5l2 -1l3 4z`, f) + L(`M${x - 3.5} ${y + 2}v3M${x + 3.5} ${y + 2}v3M${x - 1} ${y + 2}v3M${x + 1.5} ${y + 2}v3`, f, 0.9) + L(`M${x + 5} ${y - 1}q2 2 1 5`, c.ink, 0.8);
const fence = (x1: N, y: N, x2: N) => L(`M${x1} ${y}H${x2}M${x1} ${y - 3}H${x2}`, c.timber, 0.7) + Array.from({ length: Math.floor((x2 - x1) / 6) + 1 }, (_, i) => L(`M${x1 + i * 6} ${y + 1}v-6`, c.timber, 0.8)).join("");
const signpost = (x: N, y: N) => L(`M${x} ${y}v-12`, c.wood, 1.2) + P(`M${x} ${y - 12}h9l2 2l-2 2h-9z`, c.sun) + P(`M${x} ${y - 7}h-8l-2 2l2 2h8z`, c.paper);
const cyclist = (x: N, y: N) => ring(x, y, 2.6, c.ink, 0.7) + ring(x + 7, y, 2.6, c.ink, 0.7) + L(`M${x} ${y}l3 -4h3l1 4M${x + 3} ${y - 4}l1 -4`, c.terracotta, 0.9) + Ci(x + 4, y - 9, 1.3, c.ink);
const rackTrain = (x: N, y: N, a: N) => G(`translate(${x} ${y}) rotate(${a})`, R(-9, -6, 18, 6, c.terracotta, 'rx="1.5"') + R(-7, -5, 4, 2.4, pane()) + R(-1, -5, 4, 2.4, pane()) + R(5, -5, 3, 2.4, pane()));

type Home = [N, N, N, N, string, string, boolean?];
const town = (): Home[] => [
  [6, 336, 14, 14, c.wall2, c.roof1], [22, 334, 10, 18, c.wall4, c.roof2], [34, 338, 14, 12, c.wall3, c.roof3], [50, 334, 10, 16, c.wall5, c.roof1, true],
  [62, 338, 14, 12, c.wall1, c.roof4], [78, 336, 12, 16, c.wall2, c.roof2], [92, 340, 12, 12, c.wall3, c.roof1], [10, 364, 12, 16, c.wall1, c.roof2, true],
  [24, 366, 14, 12, c.wall5, c.roof3], [40, 362, 10, 18, c.wall3, c.roof1], [52, 366, 14, 12, c.wall4, c.roof4], [68, 364, 12, 14, c.wall2, c.roof2],
  [82, 366, 14, 12, c.wall1, c.roof1], [98, 364, 10, 16, c.wall5, c.roof3, true], [110, 368, 14, 12, c.wall3, c.roof2], [126, 366, 12, 14, c.wall4, c.roof1],
];
const RIVER = "M88 130C110 160 150 172 160 205S150 252 185 272S214 330 194 400";

/** Night sky: a scatter of stars (fixed, so the picture never changes) around the moon. */
function stars() {
  let s = "", seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 70; i++) {
    const x = rnd() * WALL_W, y = 2 + rnd() * 66, r = rnd();
    if (Math.hypot(x - 304, y - 30) < 30) continue;
    s += i % 9 === 0 ? sparkle(x, y, 2 + r, c.star) : Ci(x, y, 0.35 + r * 0.55, c.star, `opacity="${(0.55 + r * 0.45).toFixed(2)}"`);
  }
  return s;
}
const moon = (x: N, y: N) => Ci(x, y, 30, c.moon, 'opacity=".06"') + Ci(x, y, 21, c.moon, 'opacity=".12"') + Ci(x, y, 13, c.moon) + Ci(x - 4, y - 3, 2.6, c.sand, 'opacity=".22"') + Ci(x + 4, y + 4, 1.8, c.sand, 'opacity=".22"') + Ci(x + 5, y - 5, 1.2, c.sand, 'opacity=".22"');
const lamp = (x: N, y: N) => L(`M${x} ${y}v-9`, c.stoneD, 0.8) + Ci(x, y - 9.5, 5, c.glow, 'opacity=".22"') + Ci(x, y - 9.5, 1.2, c.glow);
const firefly = ([x, y]: [N, N]) => Ci(x, y, 2.2, c.glow, 'opacity=".25"') + Ci(x, y, 0.6, c.glow);

function draw(dark: boolean): string {
  c = dark ? nightWorld : worldArt;
  night = dark;
  fieldId = 0;
  const o: string[] = [];
  // Sky, sun (or moon and stars), plane trail and balloon.
  o.push(R(0, 0, WALL_W, WALL_H, c.skyBase), R(0, 0, WALL_W, 40, c.skyTop));
  if (night) o.push(`<defs><linearGradient id="nightSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.skyTop}"/><stop offset="1" stop-color="${c.skyBase}"/></linearGradient></defs>`, R(0, 0, WALL_W, 130, "url(#nightSky)"), stars(), moon(304, 30), cloud(40, 20, 1), cloud(150, 14, 0.8), cloud(250, 40, 0.7),
    L("M168 10L190 18", c.star, 0.6, 'opacity=".35"'), L("M184 15.8L190 18", c.star, 1, 'opacity=".8"'), balloon(96, 30, 0.3, c.terracotta, c.sun), Ci(96, 43.6, 3.6, c.glow, 'opacity=".55"'),
    G("translate(214 12)", P("M-8 0h16l-3 2h-10z", c.paper) + P("M-2 0l-3 -4h3l3 4z", c.paper) + Ci(-8, 1, 0.9, "#FF6B6B") + Ci(8, 1, 0.9, "#6BFFA0") + Ci(0, -4, 0.8, c.star)) + L("M206 13H140", c.paper, 1, 'opacity=".3"'));
  else o.push(Ci(304, 30, 24, c.sun, 'opacity=".22"'), Ci(304, 30, 15, c.sun),
    cloud(40, 20, 1), cloud(150, 14, 0.8), cloud(250, 40, 0.7), birds(196, 24), birds(210, 18), balloon(96, 30, 0.3, c.terracotta, c.sun),
    G("translate(214 12)", P("M-8 0h16l-3 2h-10z", c.paper) + P("M-2 0l-3 -4h3l3 4z", c.paper)) + L("M206 13H140", c.paper, 1, 'opacity=".7"'));
  // Three mountain ranges with distinct snow-capped peaks.
  o.push(P("M0 70L22 48L40 60L66 30L92 58L118 40L150 66L176 36L206 62L236 28L262 56L292 44L320 66L346 46L360 54V130H0Z", c.mtnBack),
    P("M66 30L58 40L63 41L67 37L71 41L74 39Z", c.snow), P("M176 36L169 45L174 46L177 42L181 46L184 43Z", c.snow), P("M236 28L228 38L233 39L237 35L241 39L245 36Z", c.snow),
    P("M0 104L30 72L52 88L84 56L110 82L138 64L168 92L200 66L232 90L268 60L300 88L330 72L360 92V150H0Z", c.mtnMid),
    P("M84 56L75 66L80 67L84 63L89 67L92 65Z", c.snow), P("M268 60L259 70L264 71L268 67L273 71L277 68Z", c.snow), P("M200 66L193 74L198 75L201 71L205 75L208 72Z", c.snow),
    P("M160 140L196 96L224 120L250 104L290 140Z", c.mtnFront), P("M196 96L188 106L193 107L197 103L201 107L204 104Z", c.snow));
  // One continuous land base down to the shore; alpine lake, chalet, cable car.
  o.push(P("M0 120Q60 104 120 116T240 120T360 112V400H0Z", c.grass),
    E(72, 126, 40, 9, c.water), E(60, 124, 10, 1.6, night ? c.moon : c.paper, 'opacity=".6"'), P("M100 118l4 -14h4l-2 14z", c.paper, 'opacity=".85"'),
    chalet(16, 124), cableCar(120, 128, 232, 86, 0.55), pines([[120, 126, 12], [128, 128, 9], [300, 124, 14], [312, 126, 10], [336, 122, 12]]));
  // River.
  o.push(L(RIVER, c.waterLight, 12), L(RIVER, c.water, 8), L("M150 182q4 4 2 8M168 238q-3 4 0 8M196 300q3 5 0 10", c.paper, 0.8, 'opacity=".8"'));
  // Pine forest with a cabin.
  o.push(P("M0 140Q40 132 90 150Q110 190 70 210Q30 214 0 206Z", c.grass2),
    pines([[8, 160, 18], [20, 166, 14], [34, 158, 20], [46, 170, 16], [60, 162, 18], [12, 184, 16], [26, 190, 20], [40, 186, 14], [54, 194, 18], [70, 182, 14], [84, 168, 14], [6, 204, 14], [78, 200, 12], [94, 186, 10]]),
    R(30, 176, 12, 9, c.timber), P("M28 176l8 -6l8 6z", c.roof1), Ci(40, 168, 2, c.paper, 'opacity=".8"'));
  // Castle on its hill above the vineyards.
  o.push(P("M230 196Q262 140 300 136Q340 140 360 160V210H230Z", c.grass2), castle(282, 158), L("M300 158Q290 176 270 196", c.road, 2.4), vineyard(232, 170, 64, 32, 6), vineyard(306, 172, 54, 30, 5));
  // Patchwork farmland, each field different.
  o.push(field([[0, 212], [56, 208], [70, 236], [0, 246]], c.field1, c.fieldStripe1), field([[56, 208], [120, 214], [118, 244], [70, 236]], c.field3, c.moss),
    field([[0, 246], [70, 236], [78, 268], [0, 276]], c.field4, c.fieldStripe4), field([[70, 236], [118, 244], [124, 272], [78, 268]], c.field2), field([[0, 276], [78, 268], [84, 298], [0, 304]], c.grass2));
  o.push(barn(14, 240), hay(96, 226), hay(104, 231), hay(90, 233), cow(40, 262), cow(54, 258), cow(30, 270), sheep(36, 292), sheep(46, 288), sheep(58, 294), sheep(24, 288),
    tractor(102, 258), windmill(66, 296, 0.75), L("M0 282Q60 276 124 274", c.road, 2.2, 'opacity=".9"'));
  // Market village by the river.
  o.push(P("M118 200H232V292H124Z", c.grass), R(176, 236, 40, 24, c.road), stall(186, 256, c.terracotta), stall(204, 256, c.roof4), Ci(196, 246, 4, c.water), Ci(196, 246, 1.6, c.paper),
    church(126, 232), home(178, 234, 12, 14, c.wall2, c.roof1), home(192, 234, 10, 18, c.wall3, c.roof2), home(204, 234, 14, 12, c.wall4, c.roof3), home(220, 236, 10, 16, c.wall5, c.roof1, true),
    home(130, 262, 14, 12, c.wall1, c.roof4), home(146, 264, 10, 16, c.wall3, c.roof1), home(212, 282, 14, 12, c.wall2, c.roof2), home(226, 282, 8, 18, c.wall1, c.roof3, true),
    stoneBridge(144, 212, 30), L("M118 224Q140 214 174 214Q200 214 232 222", c.road, 2.6), bus(212, 228, c.sun), car(124, 226, c.terracotta), rTree(170, 226, 5), rTree(232, 250, 6, c.grass2), rTree(164, 282, 5, c.moss));
  // Orchard.
  o.push(P("M232 210H360V290H236Z", c.grass2));
  for (let r = 0; r < 4; r++) for (let k = 0; k < 5; k++) {
    const x = 246 + k * 24 + (r % 2) * 10, y = 222 + r * 18;
    o.push(rTree(x, y, 6, r % 2 ? c.moss : c.leaf) + Ci(x + 2, y - 1, 1.4, c.terracotta));
  }
  // Viaduct and train.
  o.push(viaduct(96, 300, 360, 268, 8), train(250, 281, -7));
  // Seaside park: pitch, fair, campsite, coast road.
  o.push(P("M200 300Q260 292 360 286V362L300 372Q250 384 200 398Z", c.grass),
    R(272, 300, 56, 30, c.pitch), L("M272 300h56v30h-56zM300 300v30", c.paper, 1), ring(300, 315, 5, c.paper, 1), R(270, 311, 2, 8, c.paper), R(328, 311, 2, 8, c.paper),
    ferris(240, 316, 16), stall(214, 332, c.coral), bunting(206, 322, 268, 318),
    tent(222, 358, 0.6, c.roof4), tent(240, 362, 0.55, c.terracotta), G("translate(256 352)", R(0, 0, 18, 9, c.paper, 'rx="3"') + R(3, 2, 4, 3, c.wall4) + R(10, 2, 4, 3, c.wall4) + Ci(5, 10, 1.6, c.ink) + Ci(14, 10, 1.6, c.ink)), fire(282, 362),
    L("M196 340Q260 346 300 340T360 336", c.road, 2.4), car(318, 336, c.roof2), car(214, 342, c.sun), rTree(346, 300, 6, c.moss), rTree(210, 300, 5, c.leaf), rTree(290, 350, 4, c.moss), rTree(304, 346, 4, c.moss));
  // Hillside harbour town.
  o.push(P("M0 300Q80 296 150 312Q186 330 196 396H0Z", c.grass2), ...town().map(([x, y, w, h, wall, roof, flat]) => home(x, y, w, h, wall, roof, flat)),
    clockTower(112, 342, 0.6), L("M106 344l4 6l-4 6l4 6", c.paper, 1.4), funicular(140, 394, 118, 330), rTree(122, 326, 5), rTree(132, 330, 4, c.moss));
  // Harbour, beach and lighthouse cliffs.
  o.push(P("M0 396H360V450H0Z", c.sea), P("M0 396Q90 392 196 398L200 404H0Z", c.stone), R(150, 394, 60, 5, c.stoneD), boat(170, 410, 0.7), boat(40, 412, 0.6), boat(110, 420, 0.65), L("M150 398h-2v10", c.ink, 0.6),
    R(20, 402, 16, 3, c.wood), R(80, 402, 16, 3, c.wood), R(134, 402, 16, 3, c.wood));
  o.push(P("M200 400Q260 380 300 372L360 360V400Z", c.beach), P("M300 372Q330 330 360 320V368Z", c.cliff), P("M308 362Q332 332 360 326V340Q340 344 320 364Z", c.cliffShade, 'opacity=".5"'), lighthouse(338, 330, 0.8), L("M346 302L380 286", c.sun, 2, 'opacity=".4"'),
    umbrella(222, 394, c.terracotta), umbrella(244, 388, c.sun), umbrella(266, 384, c.roof2), umbrella(286, 380, c.roof4), towel(226, 394, c.sun), towel(250, 388, c.coral), towel(272, 384, c.tealLight),
    L("M200 400Q260 386 300 376L360 366", c.paper, 1.4, 'opacity=".8"'));
  // Sea traffic and life.
  o.push(ferry(250, 420), G("translate(320 432) scale(.55)", sailboat(0, 0)), G("translate(86 444) scale(.5)", sailboat(0, 0)), buoy(200, 430), buoy(300, 442), seal(346, 410),
    waves(20, 430), waves(150, 436), waves(220, 444), waves(280, 430), birds(260, 404), birds(276, 398), L("M0 204Q60 206 118 200", c.road, 2, 'opacity=".7"'));
  // Mountain slopes, rack railway and the farmstead in the river meadow.
  o.push(L("M40 70l8 10M120 58l-6 12M214 74l6 10M300 60l-8 12M150 80l10 8M330 90l-6 8", c.mtnFront, 1, 'opacity=".7"'), L("M30 96l10 4M96 74l-4 10M250 82l8 8M180 96l-8 6", c.paper, 0.8, 'opacity=".5"'),
    pines([[150, 112, 10], [158, 114, 8], [176, 110, 12], [186, 113, 9], [250, 110, 11], [262, 112, 8], [100, 108, 9], [108, 110, 7]]),
    L("M200 120L176 108L206 98L180 88L208 78", c.road, 1.6), rackTrain(192, 103, -22), L("M222 118L250 96L274 76", c.ink, 0.7, 'stroke-dasharray="1.5 1.5"'),
    R(178, 142, 22, 12, c.wall1), P("M175 142L189 132L203 142Z", c.roof1), R(182, 146, 4, 4, c.sun), R(192, 146, 4, 8, c.ink, 'opacity=".7"'),
    fence(150, 178, 214), horse(166, 172), horse(184, 176, c.horseDark), horse(200, 170, c.paper), rTree(212, 146, 7, c.moss), rTree(150, 150, 5, c.leaf),
    signpost(160, 198), L("M146 200Q180 192 214 196", c.road, 1.6), cyclist(196, 194), flowers(222, 190, c.coral), kite(340, 140, 0.5));
  // Mountain-top details where the smallest, earliest years usually land.
  o.push(night ? skyLantern(26, 26) + skyLantern(140, 32) + skyLantern(206, 50) + skyLantern(122, 18) : paraglider(26, 24, c.terracotta, c.sun) + paraglider(140, 30, c.roof4, c.paper) + paraglider(206, 48, c.sun, c.roof2),
    summitFlag(66, 30, c.terracotta), summitFlag(236, 28, c.sun), hut(112, 46), L("M100 92L84 80L98 70L80 60L92 50L72 38", c.paper, 0.9, 'stroke-dasharray="2 2"'),
    eagle(330, 68), eagle(272, 52), cloud(186, 44, 0.6), sparkle(46, 48, 2.4, night ? c.star : c.paper));
  if (night) {
    // Moonlight on the sea, town lights on the harbour water, street lamps and fireflies.
    o.push([0, 1, 2, 3, 4, 5, 6].map((i) => L(`M${300 - i * 1.4 - (i % 2) * 4} ${404 + i * 6.5}h${10 + i * 2.8}`, c.moon, 1.2, `opacity="${(0.65 - i * 0.06).toFixed(2)}"`)).join(""),
      [14, 52, 92, 128].map((x, i) => L(`M${x} ${405 + (i % 2) * 2}v8`, c.glow, 1.2, 'opacity=".3" stroke-dasharray="2 2"')).join(""),
      [[130, 219], [160, 214], [200, 214], [229, 222], [214, 342], [252, 345], [294, 341], [344, 337], [60, 396], [120, 395], [186, 394]].map(([x, y]) => lamp(x, y)).join(""),
      ([[18, 150], [58, 176], [88, 158], [36, 200], [72, 196], [160, 186], [190, 166], [226, 200], [252, 260], [300, 248], [340, 230], [262, 214], [22, 228], [110, 250]] as [N, N][]).map(firefly).join(""),
      R(268, 296, 1.2, 8, c.stoneD) + R(330, 296, 1.2, 8, c.stoneD) + Ci(268.6, 296, 4, c.glow, 'opacity=".35"') + Ci(330.6, 296, 4, c.glow, 'opacity=".35"') + R(272, 300, 56, 30, c.glow, 'opacity=".07"'));
  }
  return o.join("");
}

const cached: { day?: string; night?: string } = {};
/** The world's SVG body (no outer <svg>), built once per app session for each time of day. */
export function worldMarkup(dark = false) {
  return dark ? (cached.night ??= draw(true)) : (cached.day ??= draw(false));
}
/** A complete SVG document showing the given window of the world, by day or (dark mode) at night. */
export function worldSvg(view: { x: number; y: number; w: number; h: number } = { x: 0, y: 0, w: WALL_W, h: WALL_H }, dark = false) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view.x} ${view.y} ${view.w} ${view.h}" preserveAspectRatio="xMidYMid slice">${worldMarkup(dark)}</svg>`;
}
