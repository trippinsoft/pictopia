import { memo, type ReactNode } from "react";
import Svg, { Circle, Ellipse, G, Line, Path, Polygon, Rect } from "react-native-svg";
import type { BadgeFamily } from "@/lib/pictopia/badges";
import { lightArt } from "@/theming/illustration";

/** Storybook-landscape badge medals: a tier-coloured rim, a family-specific sky and a flat
 * vignette drawn from the same palette as the Adventure artwork. No outlines, no dot grain.
 * Each family gets its own composition, motif and face colour so they read as different at
 * a glance; badges not yet earned are drawn entirely in greys. */
type Palette = typeof lightArt;

/** Luminance-matched grey for a hex colour, lifted slightly so locked badges read soft. */
function grey(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const y = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  const v = Math.round(y + (255 - y) * 0.25).toString(16).padStart(2, "0");
  return `#${v}${v}${v}`;
}
const LOCKED: Palette = Object.fromEntries(Object.entries(lightArt).map(([k, v]) => [k, grey(v)])) as unknown as Palette;

/** Bronze → silver → gold → enamel tiers. */
const RIMS = ["#E0955A", "#AEBBD0", "#FFC93C", "#46A97F", "#4F9BE8", "#7B3FC4", "#FF6B4A", "#1C2457"];

/** Each family's face colour when earned: a distinct, clear hue per badge. */
const SKY: Record<BadgeFamily, string> = {
  explorer: "#CFE5FB",     // sky blue — a trail map world
  declutterer: "#CDEFDB",  // mint — an open drawer, freshly cleared
  months: "#FFE7A3",       // butter — a calendar page in sunlight
  years: "#E2D3F8",        // lilac — time travel
  decades: "#FBD0DC",      // blush — fanned pages
  adventurer: "#BFEAF0",   // aqua — a balloon up in clear sky
  streak: "#FFCFB8",       // sunset peach — a flame on the horizon
};
const LOCKED_SKY = "#E6E7EA";

function Face({ children, family, c }: { children: ReactNode; family: BadgeFamily; c: Palette }) {
  return (
    <G>
      <Rect x={8} y={8} width={48} height={48} rx={24} fill={c === LOCKED ? LOCKED_SKY : SKY[family]} />
      {children}
    </G>
  );
}

function Emblem({ family, c: C }: { family: BadgeFamily; c: Palette }) {
  switch (family) {
    case "explorer":
      // A dashed trail winding across the face to a map pin — exploration.
      return (
        <Face family={family} c={C}>
          <Path d="M14 48 Q22 34 34 36 T52 20" stroke={C.teal} strokeWidth={2.2} strokeDasharray="3 3" fill="none" strokeLinecap="round" />
          <Path d="M46 10 C40 10 38 16 42 22 L46 28 L50 22 C54 16 52 10 46 10Z" fill={C.terracotta} />
          <Circle cx={46} cy={16} r={2.4} fill={C.paper} />
          <Circle cx={16} cy={50} r={1.8} fill={C.moss} />
        </Face>
      );
    case "declutterer":
      // An open drawer with a sparkle rising above it — clutter cleared.
      return (
        <Face family={family} c={C}>
          <Rect x={16} y={34} width={32} height={18} rx={2.5} fill={C.terracotta} />
          <Rect x={19} y={38} width={26} height={11} rx={1.5} fill={C.coral} />
          <Rect x={30} y={42} width={4} height={1.6} rx={0.8} fill={C.paper} />
          <Rect x={16} y={52} width={32} height={2.5} fill={C.sandDeep} />
          <Polygon points="40,14 43,20 49,21 44,25 46,31 40,28 34,31 36,25 31,21 37,20" fill={C.sun} />
          <Path d="M23 18 l1 2 l2 1 l-2 1 l-1 2 l-1 -2 l-2 -1 l2 -1z" fill={C.sun} />
        </Face>
      );
    case "months":
      // A calendar page sitting on a desk line, with a big check — a month finished.
      return (
        <Face family={family} c={C}>
          <Rect x={8} y={50} width={48} height={6} fill={C.sand} />
          <Rect x={18} y={16} width={28} height={30} rx={3} fill={C.paper} />
          <Rect x={18} y={16} width={28} height={8} rx={3} fill={C.terracotta} />
          <Rect x={23} y={13} width={2.5} height={7} rx={1} fill={C.ink} />
          <Rect x={38.5} y={13} width={2.5} height={7} rx={1} fill={C.ink} />
          <Path d="M24 34 l4.5 4.5 l10 -10" fill="none" stroke={C.moss} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />
        </Face>
      );
    case "years":
      // An hourglass with sand mid-fall — time traveller.
      return (
        <Face family={family} c={C}>
          <Circle cx={46} cy={18} r={5} fill={C.sun} />
          <Path d="M20 15 h24 L32 32 L20 48 h24" fill="none" />
          <Rect x={18} y={13} width={28} height={3} rx={1} fill={C.teal} />
          <Rect x={18} y={48} width={28} height={3} rx={1} fill={C.teal} />
          <Path d="M22 16 L42 16 L32 32 L42 48 L22 48 L32 32Z" fill={C.paper} />
          <Path d="M24 18 L40 18 L32 30Z" fill={C.sun} opacity={0.75} />
          <Path d="M27 46 L37 46 L32 36Z" fill={C.sandDeep} opacity={0.9} />
          <Rect x={31} y={32} width={2} height={6} fill={C.sandDeep} />
        </Face>
      );
    case "decades":
      // Fanned calendar pages stacked across time.
      return (
        <Face family={family} c={C}>
          {[-18, -6, 6, 18].map((rot, i) => (
            <G key={rot} transform={`rotate(${rot} 32 36)`}>
              <Rect x={22} y={18} width={20} height={26} rx={2.5} fill={i === 1 || i === 2 ? C.paper : i === 0 ? C.rose : C.sand} />
              <Rect x={22} y={18} width={20} height={6} rx={2.5} fill={C.teal} />
              <Circle cx={32} cy={34} r={2.4} fill={C.sun} opacity={0.6} />
            </G>
          ))}
        </Face>
      );
    case "adventurer":
      // A hot-air balloon up among clouds — the Adventurer.
      return (
        <Face family={family} c={C}>
          <Ellipse cx={18} cy={20} rx={7} ry={3} fill={C.cloud} />
          <Ellipse cx={14} cy={18} rx={4} ry={3} fill={C.cloud} />
          <Ellipse cx={48} cy={42} rx={6} ry={2.4} fill={C.cloud} opacity={0.9} />
          <Path d="M32 18 C24 18 20 30 23 38 L29 48 H35 L41 38 C44 30 40 18 32 18Z" fill={C.terracotta} />
          <Path d="M32 18 C28 26 28 42 30 48 H34 C36 42 36 26 32 18Z" fill={C.sun} />
          <Path d="M22 32 H42" stroke={C.paper} strokeWidth={1.2} opacity={0.6} />
          <Line x1={29} y1={48} x2={30} y2={52} stroke={C.ink} strokeWidth={0.8} />
          <Line x1={35} y1={48} x2={34} y2={52} stroke={C.ink} strokeWidth={0.8} />
          <Rect x={28.5} y={52} width={7} height={4} rx={0.8} fill={C.sandDeep} />
        </Face>
      );
    case "streak":
      // Sunset glow with a flame on the horizon — the streak.
      return (
        <Face family={family} c={C}>
          <Rect x={8} y={38} width={48} height={18} fill={C.sand} />
          <Circle cx={32} cy={38} r={14} fill={C.sun} opacity={0.6} />
          <Path d="M32 18 C36 23 40 27 40 34 a8 8 0 0 1 -16 0 c0 -4 2 -6 4 -8 c0 3 2 4 3 4 c-1 -5 0 -8 1 -12z" fill={C.terracotta} />
          <Path d="M32 28 c2 2 3 4 3 6 a3 3 0 0 1 -6 0 c0 -2 1 -4 3 -6z" fill={C.sun} />
          <Path d="M8 42 H56" stroke={C.sandDeep} strokeWidth={0.8} opacity={0.5} />
        </Face>
      );
  }
}

/** A badge medal. Unearned families are drawn in greys with a soft grey rim. */
export const BadgeArt = memo(function BadgeArt({ family, tier, size = 64 }: { family: BadgeFamily; tier: number; size?: number }) {
  const earned = tier > 0;
  const rim = earned ? RIMS[Math.min(tier - 1, RIMS.length - 1)] : "#D3D5DA";
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <Circle cx={32} cy={32} r={30} fill={rim} />
      <Circle cx={32} cy={32} r={25} fill={earned ? "#FFFFFF" : "#F3F4F6"} />
      <G opacity={earned ? 1 : 0.8}>
        <Emblem family={family} c={earned ? lightArt : LOCKED} />
      </G>
    </Svg>
  );
});
