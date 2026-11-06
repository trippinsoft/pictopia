import { memo } from "react";
import Svg, { Circle, G, Line, Path, Polygon, Rect } from "react-native-svg";
import type { BadgeFamily } from "@/lib/pictopia/badges";

// Playful Adventure badge medals: a tier-coloured rim, a family pastel face and a drawn emblem.
// Fixed illustration colours (like the adventure artwork), so badges look the same in every theme.
const INK = "#1B2350";
const FACE: Record<BadgeFamily, string> = {
  explorer: "#CFE8FF",
  declutterer: "#FFD9CF",
  months: "#FFF1C2",
  years: "#E6DCFF",
  decades: "#CFF0DD",
  adventurer: "#FFE0C4",
  streak: "#FFE69A",
};
/** Bronze, silver, gold, then enamel colours for the higher tiers. */
const RIM = ["#C9CFD8", "#D9894A", "#A9B6C6", "#F2B630", "#4F7BFF", "#FF5A3C", "#2FA36B", "#8B5CF6", "#FF4F9A"];

function Emblem({ family }: { family: BadgeFamily }) {
  switch (family) {
    case "explorer":
      return (
        <G>
          <Circle cx={32} cy={32} r={13} fill="#fff" stroke={INK} strokeWidth={2.5} />
          <Polygon points="32,20 36,32 28,32" fill="#FF5A3C" />
          <Polygon points="32,44 36,32 28,32" fill={INK} />
          <Circle cx={32} cy={32} r={2} fill="#fff" stroke={INK} strokeWidth={1.5} />
        </G>
      );
    case "declutterer":
      return (
        <G>
          <Rect x={23} y={27} width={18} height={18} rx={3} fill="#fff" stroke={INK} strokeWidth={2.5} />
          <Rect x={20} y={22} width={24} height={5} rx={2.5} fill={INK} />
          <Line x1={29} y1={31} x2={29} y2={41} stroke={INK} strokeWidth={2} strokeLinecap="round" />
          <Line x1={35} y1={31} x2={35} y2={41} stroke={INK} strokeWidth={2} strokeLinecap="round" />
          <Path d="M45 14 l1.6 4 4 1.6 -4 1.6 -1.6 4 -1.6 -4 -4 -1.6 4 -1.6z" fill="#F2B630" />
        </G>
      );
    case "months":
      return (
        <G>
          <Rect x={19} y={21} width={26} height={24} rx={4} fill="#fff" stroke={INK} strokeWidth={2.5} />
          <Rect x={19} y={21} width={26} height={7} rx={3} fill="#FF5A3C" />
          <Line x1={25} y1={17} x2={25} y2={24} stroke={INK} strokeWidth={2.5} strokeLinecap="round" />
          <Line x1={39} y1={17} x2={39} y2={24} stroke={INK} strokeWidth={2.5} strokeLinecap="round" />
          <Path d="M25 37 l4.5 4.5 9 -9" fill="none" stroke="#2FA36B" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
        </G>
      );
    case "years":
      return (
        <G>
          <Line x1={22} y1={18} x2={42} y2={18} stroke={INK} strokeWidth={3} strokeLinecap="round" />
          <Line x1={22} y1={46} x2={42} y2={46} stroke={INK} strokeWidth={3} strokeLinecap="round" />
          <Path d="M25 19 L39 19 L32 32 Z" fill="#fff" stroke={INK} strokeWidth={2.2} strokeLinejoin="round" />
          <Path d="M25 45 L39 45 L32 32 Z" fill="#fff" stroke={INK} strokeWidth={2.2} strokeLinejoin="round" />
          <Path d="M28 44 L36 44 L32 38 Z" fill="#F2B630" />
          <Path d="M29.5 22 L34.5 22 L32 26 Z" fill="#F2B630" />
        </G>
      );
    case "decades":
      return (
        <G>
          <Circle cx={32} cy={32} r={14} fill="#fff" stroke={INK} strokeWidth={2.5} />
          <Circle cx={32} cy={32} r={3} fill={INK} />
          {[0, 72, 144, 216, 288].map((a) => (
            <Circle key={a} cx={32 + 8 * Math.cos(((a - 90) * Math.PI) / 180)} cy={32 + 8 * Math.sin(((a - 90) * Math.PI) / 180)} r={3} fill="#4F7BFF" />
          ))}
        </G>
      );
    case "adventurer":
      return (
        <G>
          <Path d="M27 22 a5 5 0 0 1 10 0" fill="none" stroke={INK} strokeWidth={2.5} />
          <Rect x={21} y={22} width={22} height={24} rx={7} fill="#2FA36B" stroke={INK} strokeWidth={2.5} />
          <Rect x={26} y={33} width={12} height={9} rx={3} fill="#fff" stroke={INK} strokeWidth={2} />
          <Line x1={26} y1={29} x2={38} y2={29} stroke={INK} strokeWidth={2} strokeLinecap="round" />
        </G>
      );
    case "streak":
      return (
        <G>
          <Path d="M32 15 C38 22 43 27 43 35 a11 11 0 0 1 -22 0 c0 -5 3 -8 5 -10 c0 4 2 6 4 6 c-1 -7 0 -12 2 -16z" fill="#FF8A3C" stroke={INK} strokeWidth={2.2} strokeLinejoin="round" />
          <Path d="M32 30 c3 3 5 5 5 8 a5 5 0 0 1 -10 0 c0 -3 2 -5 5 -8z" fill="#FFD23F" />
        </G>
      );
  }
}

/** A badge medal. Unearned families show as an embossed outline. */
export const BadgeArt = memo(function BadgeArt({ family, tier, size = 64 }: { family: BadgeFamily; tier: number; size?: number }) {
  const earned = tier > 0;
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <Circle cx={32} cy={32} r={30} fill={earned ? RIM[Math.min(tier, RIM.length - 1)] : "#EEF1F5"} />
      <Circle cx={32} cy={32} r={25} fill={earned ? FACE[family] : "#F7F8FA"} stroke={earned ? "#fff" : "#C9CFD8"} strokeWidth={2} strokeDasharray={earned ? undefined : "4 3"} />
      <G opacity={earned ? 1 : 0.3}>
        <Emblem family={family} />
      </G>
    </Svg>
  );
});
