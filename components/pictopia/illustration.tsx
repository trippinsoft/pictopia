import { memo, type ReactNode } from "react";
import { type StyleProp, type ViewStyle } from "react-native";
import Svg, { Circle, Defs, Ellipse, G, Line, Path, Pattern, Polygon, Rect } from "react-native-svg";
import { useTheme } from "@/theming/ThemeProvider";
import { darkArt, lightArt, type ArtPalette } from "@/theming/illustration";
import type { AdventureKind } from "@/lib/pictopia/adventures";

/** One illustration system for the whole app. Each picture is a metaphor for an Adventure's
 * character or a game, never a stand-in for the user's own photos. Drawn on a 120 × 150 canvas
 * with the subject centered, so it can be shown portrait (cards) or cropped square (icons). */
export type ArtName =
  | "timeMachine"
  | "onThisDay"
  | "detour"
  | "capsule"
  | "screenshots"
  | "corners"
  | "guessYear"
  | "whereWasThis"
  | "whichFirst"
  | "memoryMatch"
  | "finish"
  | "gameResult"
  | "spring"
  | "summer"
  | "autumn"
  | "winter";

export const artForKind = (kind: AdventureKind | undefined): ArtName =>
  kind === "day"
    ? "onThisDay"
    : kind === "detour" || kind === "random"
      ? "detour"
      : kind === "capsule"
        ? "capsule"
        : kind === "screenshots"
          ? "screenshots"
          : kind === "corners"
            ? "corners"
            : kind === "pitstop"
              ? "gameResult"
              : "timeMachine";
/** A season for a calendar month or a year (used to vary The Yearbook rows). */
export const seasonFor = (month: number): ArtName =>
  month <= 2 || month === 12 ? "winter" : month <= 5 ? "spring" : month <= 8 ? "summer" : "autumn";

export const Illustration = memo(function Illustration({
  name,
  style,
  square = false,
  accessibilityLabel,
}: {
  name: ArtName;
  style?: StyleProp<ViewStyle>;
  /** Crop to the central square (icons and thumbnails). */
  square?: boolean;
  accessibilityLabel?: string;
}) {
  const { theme } = useTheme();
  const c = theme.name === "dark" || theme.name === "adventure" ? darkArt : lightArt;
  return (
    <Svg
      width="100%"
      height="100%"
      style={style}
      viewBox={square ? "0 15 120 120" : "0 0 120 150"}
      preserveAspectRatio="xMidYMid slice"
      {...(accessibilityLabel ? { accessible: true, accessibilityLabel } : {})}
    >
      <Defs>
        <Pattern id="grain" width="6" height="6" patternUnits="userSpaceOnUse">
          <Circle cx="1.5" cy="1.5" r="0.45" fill={c.grain} opacity={0.08} />
          <Circle cx="4.5" cy="4.5" r="0.35" fill={c.grain} opacity={0.06} />
        </Pattern>
      </Defs>
      {SCENES[name](c)}
      <Rect width="120" height="150" fill="url(#grain)" />
    </Svg>
  );
});

type Scene = (c: ArtPalette) => ReactNode;
const sky = (fill: string) => <Rect width="120" height="150" fill={fill} />;
const cloud = (x: number, y: number, fill: string, s = 1) => (
  <G transform={`translate(${x} ${y}) scale(${s})`}>
    <Ellipse cx="0" cy="0" rx="10" ry="4.5" fill={fill} />
    <Ellipse cx="-5" cy="-3" rx="5.5" ry="4" fill={fill} />
    <Ellipse cx="3" cy="-4" rx="6" ry="5" fill={fill} />
  </G>
);
const pine = (x: number, y: number, h: number, fill: string) => (
  <G>
    <Polygon points={`${x},${y - h} ${x - h * 0.32},${y} ${x + h * 0.32},${y}`} fill={fill} />
    <Rect x={x - 0.8} y={y} width="1.6" height={h * 0.12} fill={fill} />
  </G>
);
const sparkle = (x: number, y: number, r: number, fill: string) => (
  <Path
    d={`M${x} ${y - r} Q${x + r * 0.18} ${y - r * 0.18} ${x + r} ${y} Q${x + r * 0.18} ${y + r * 0.18} ${x} ${y + r} Q${x - r * 0.18} ${y + r * 0.18} ${x - r} ${y} Q${x - r * 0.18} ${y - r * 0.18} ${x} ${y - r}Z`}
    fill={fill}
  />
);
/** A small instant print: border, picture area with a sun and a hill. */
const print = (x: number, y: number, w: number, rot: number, c: ArtPalette, tint = c.skyAlt) => {
  const h = w * 1.15;
  return (
    <G transform={`rotate(${rot} ${x + w / 2} ${y + h / 2})`}>
      <Rect x={x} y={y} width={w} height={h} rx="1.5" fill={c.paper} />
      <Rect x={x + w * 0.09} y={y + w * 0.09} width={w * 0.82} height={w * 0.78} fill={tint} />
      <Circle cx={x + w * 0.66} cy={y + w * 0.32} r={w * 0.1} fill={c.sun} />
      <Path
        d={`M${x + w * 0.09} ${y + w * 0.87} Q${x + w * 0.4} ${y + w * 0.45} ${x + w * 0.91} ${y + w * 0.87}Z`}
        fill={c.moss}
      />
    </G>
  );
};

const SEASONS: Record<"spring" | "summer" | "autumn" | "winter", (c: ArtPalette) => [string, string, string, string]> = {
  spring: (c) => [c.skyAlt, c.sage, c.moss, c.rose],
  summer: (c) => [c.sky, c.tealLight, c.teal, c.sun],
  autumn: (c) => [c.sky, c.sandDeep, c.terracotta, c.coral],
  winter: (c) => [c.skyAlt, c.cloud, c.tealLight, c.paper],
};
const season = (kind: keyof typeof SEASONS): Scene => (c) => {
  const [bg, back, front, accent] = SEASONS[kind](c);
  return (
    <G>
      {sky(bg)}
      <Circle cx="82" cy="46" r="13" fill={kind === "winter" ? c.paper : c.sun} />
      {cloud(34, 40, c.cloud, 0.9)}
      <Path d="M0 98 Q30 70 62 92 T120 84 V150 H0Z" fill={back} />
      <Path d="M0 116 Q40 92 80 112 T120 106 V150 H0Z" fill={front} />
      {kind === "winter" && <Path d="M52 89 l6 -6 l6 7 l-4 -1 l-3 2 l-2 -2z" fill={c.paper} />}
      {pine(22, 112, 22, c.tealDeep)}
      {pine(31, 115, 15, c.tealDeep)}
      {kind === "spring" && [38, 46, 54].map((x, i) => <Circle key={x} cx={x + 50} cy={118 - i * 3} r="3.2" fill={accent} />)}
      {kind === "autumn" && [
        <Ellipse key="a" cx="92" cy="60" rx="2.4" ry="1.3" fill={accent} transform="rotate(30 92 60)" />,
        <Ellipse key="b" cx="104" cy="74" rx="2.4" ry="1.3" fill={c.terracotta} transform="rotate(-20 104 74)" />,
      ]}
      {kind === "summer" && <Path d="M70 128 Q90 120 112 128 Q90 134 70 128Z" fill={c.skyAlt} opacity={0.8} />}
    </G>
  );
};

const SCENES: Record<ArtName, Scene> = {
  spring: season("spring"),
  summer: season("summer"),
  autumn: season("autumn"),
  winter: season("winter"),

  // Layered seasons under a clock-face sun: time folding back on itself.
  timeMachine: (c) => (
    <G>
      {sky(c.sky)}
      {cloud(24, 34, c.cloud)}
      {cloud(100, 26, c.cloud, 0.7)}
      <Circle cx="60" cy="58" r="27" fill={c.sun} />
      <Circle cx="60" cy="58" r="21" fill={c.paper} />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return (
          <Line
            key={i}
            x1={60 + Math.sin(a) * 17.5}
            y1={58 - Math.cos(a) * 17.5}
            x2={60 + Math.sin(a) * (i % 3 ? 19.5 : 20.5)}
            y2={58 - Math.cos(a) * (i % 3 ? 19.5 : 20.5)}
            stroke={c.ink}
            strokeWidth={i % 3 ? 0.8 : 1.4}
            strokeLinecap="round"
          />
        );
      })}
      <Line x1="60" y1="58" x2="60" y2="45" stroke={c.ink} strokeWidth="1.8" strokeLinecap="round" />
      <Line x1="60" y1="58" x2="69" y2="62" stroke={c.terracotta} strokeWidth="1.8" strokeLinecap="round" />
      <Circle cx="60" cy="58" r="1.8" fill={c.ink} />
      <Path d="M0 98 Q24 80 50 94 T120 86 V150 H0Z" fill={c.tealLight} />
      <Path d="M0 108 Q34 92 70 106 T120 100 V150 H0Z" fill={c.sage} />
      <Path d="M0 120 Q30 108 60 118 T120 114 V150 H0Z" fill={c.sand} />
      <Path d="M0 132 Q40 120 84 130 T120 128 V150 H0Z" fill={c.terracotta} />
      {pine(16, 108, 18, c.tealDeep)}
      {pine(25, 111, 12, c.tealDeep)}
      <Circle cx="98" cy="114" r="5.5" fill={c.coral} />
      <Rect x="97.3" y="118" width="1.4" height="6" fill={c.ink} />
      <Ellipse cx="108" cy="70" rx="2.6" ry="1.3" fill={c.terracotta} transform="rotate(35 108 70)" />
      <Ellipse cx="14" cy="70" rx="2.4" ry="1.2" fill={c.sage} transform="rotate(-25 14 70)" />
    </G>
  ),

  // A torn-off calendar page holding the season, with a sprig reaching in.
  onThisDay: (c) => (
    <G>
      {sky(c.skyAlt)}
      <Circle cx="96" cy="30" r="10" fill={c.sun} />
      <Path d="M0 124 Q40 112 70 120 T120 116 V150 H0Z" fill={c.sage} />
      <G transform="rotate(-5 60 76)">
        <Rect x="30" y="40" width="60" height="70" rx="6" fill={c.paper} />
        <Path d="M30 46 a6 6 0 0 1 6 -6 h48 a6 6 0 0 1 6 6 v12 h-60z" fill={c.terracotta} />
        <Rect x="41" y="35" width="4" height="10" rx="2" fill={c.ink} />
        <Rect x="75" y="35" width="4" height="10" rx="2" fill={c.ink} />
        <Circle cx="60" cy="80" r="11" fill={c.sun} opacity={0.9} />
        <Path d="M44 102 Q60 86 76 102Z" fill={c.moss} />
        {[0, 1, 2, 3, 4].map((i) => (
          <Rect key={i} x={38 + i * 9.5} y="64" width="5" height="2" rx="1" fill={c.sandDeep} opacity={0.6} />
        ))}
        <Path d="M90 98 L90 110 L78 110Z" fill={c.sand} />
      </G>
      <Path d="M0 30 Q20 34 34 52" stroke={c.moss} strokeWidth="2" fill="none" strokeLinecap="round" />
      {[
        [8, 31, 20],
        [17, 35, -10],
        [25, 41, 30],
        [31, 48, -20],
      ].map(([x, y, r]) => (
        <Ellipse key={`${x}`} cx={x} cy={y} rx="4.5" ry="2.2" fill={c.moss} transform={`rotate(${r} ${x} ${y})`} />
      ))}
      <Circle cx="104" cy="122" r="3" fill={c.coral} />
      <Circle cx="110" cy="126" r="2.4" fill={c.rose} />
    </G>
  ),

  // A balloon drifting off a looping, dashed route among stray shapes.
  detour: (c) => (
    <G>
      {sky(c.sky)}
      {cloud(22, 30, c.cloud)}
      {cloud(98, 98, c.cloud, 0.8)}
      <Path
        d="M8 132 C30 120 26 92 46 96 C66 100 58 124 76 116 C96 108 70 82 92 74 C104 70 110 60 112 48"
        stroke={c.teal}
        strokeWidth="1.6"
        strokeDasharray="3 3"
        fill="none"
        strokeLinecap="round"
      />
      <G>
        <Path d="M60 28 C42 28 38 50 46 62 L54 72 H66 L74 62 C82 50 78 28 60 28Z" fill={c.terracotta} />
        <Path d="M60 28 C54 34 52 54 56 72 H64 C68 54 66 34 60 28Z" fill={c.sun} />
        <Path d="M47 46 H73" stroke={c.paper} strokeWidth="1.2" opacity={0.7} />
        <Line x1="55" y1="72" x2="56" y2="80" stroke={c.ink} strokeWidth="0.8" />
        <Line x1="65" y1="72" x2="64" y2="80" stroke={c.ink} strokeWidth="0.8" />
        <Rect x="54.5" y="80" width="11" height="7" rx="1.5" fill={c.sandDeep} />
      </G>
      {sparkle(24, 70, 4.5, c.sun)}
      <Polygon points="96,30 102,40 90,40" fill={c.tealLight} />
      <Circle cx="20" cy="100" r="3.5" fill={c.coral} />
      <Rect x="98" y="58" width="6" height="6" rx="1" fill={c.sage} transform="rotate(20 101 61)" />
      <Path d="M0 140 Q30 128 60 138 T120 134 V150 H0Z" fill={c.tealLight} />
    </G>
  ),

  // A jar of small keepsakes buried among the soil layers.
  capsule: (c) => (
    <G>
      {sky(c.sky)}
      <Circle cx="92" cy="28" r="10" fill={c.sun} />
      {cloud(30, 26, c.cloud, 0.8)}
      <Rect y="62" width="120" height="88" fill={c.sand} />
      <Path d="M0 62 Q30 56 60 62 T120 60 V66 H0Z" fill={c.moss} />
      <Path d="M0 92 Q40 86 80 94 T120 90 V150 H0Z" fill={c.sandDeep} />
      <Path d="M0 124 Q40 118 80 126 T120 122 V150 H0Z" fill={c.terracotta} opacity={0.75} />
      <Line x1="60" y1="62" x2="60" y2="46" stroke={c.moss} strokeWidth="1.6" />
      <Ellipse cx="55" cy="48" rx="5" ry="2.4" fill={c.moss} transform="rotate(-25 55 48)" />
      <Ellipse cx="65" cy="45" rx="5" ry="2.4" fill={c.sage} transform="rotate(25 65 45)" />
      <Rect x="40" y="78" width="40" height="48" rx="9" fill={c.skyAlt} opacity={0.95} />
      <Rect x="42" y="72" width="36" height="8" rx="3" fill={c.teal} />
      {print(47, 90, 15, -10, c, c.sky)}
      {sparkle(70, 98, 5, c.sun)}
      <Ellipse cx="67" cy="116" rx="5" ry="2.4" fill={c.moss} transform="rotate(-20 67 116)" />
      <Rect x="44" y="82" width="3" height="36" rx="1.5" fill={c.paper} opacity={0.6} />
      {sparkle(90, 82, 3, c.paper)}
      {sparkle(28, 104, 2.5, c.paper)}
    </G>
  ),

  // Stacked screens and prints, with a gentle sweep of sparkles.
  screenshots: (c) => (
    <G>
      {sky(c.skyAlt)}
      {print(14, 52, 34, -14, c)}
      <G transform="rotate(-8 54 76)">
        <Rect x="36" y="34" width="38" height="72" rx="7" fill={c.ink} />
        <Rect x="39" y="40" width="32" height="60" rx="3" fill={c.paper} />
        <Rect x="43" y="45" width="24" height="12" rx="2" fill={c.tealLight} />
        <Rect x="43" y="61" width="18" height="3" rx="1.5" fill={c.sandDeep} opacity={0.7} />
        <Rect x="43" y="67" width="22" height="3" rx="1.5" fill={c.sandDeep} opacity={0.5} />
        <Rect x="43" y="76" width="16" height="8" rx="3" fill={c.rose} />
      </G>
      <G transform="rotate(10 82 84)">
        <Rect x="64" y="46" width="38" height="72" rx="7" fill={c.tealDeep} />
        <Rect x="67" y="52" width="32" height="60" rx="3" fill={c.paper} />
        <Rect x="71" y="57" width="24" height="18" rx="2" fill={c.sand} />
        <Circle cx="89" cy="62" r="3" fill={c.sun} />
        <Rect x="71" y="80" width="20" height="3" rx="1.5" fill={c.sandDeep} opacity={0.6} />
        <Rect x="71" y="86" width="14" height="3" rx="1.5" fill={c.sandDeep} opacity={0.45} />
      </G>
      <Path d="M18 132 Q60 116 104 132" stroke={c.terracotta} strokeWidth="2" fill="none" strokeLinecap="round" />
      {sparkle(30, 120, 4, c.sun)}
      {sparkle(98, 118, 3, c.sun)}
      {sparkle(62, 126, 2.4, c.terracotta)}
    </G>
  ),

  // An open drawer of tucked-away things under a lamp's glow.
  corners: (c) => (
    <G>
      {sky(c.sky)}
      <Rect y="112" width="120" height="38" fill={c.sandDeep} />
      <Polygon points="26,30 14,96 50,96" fill={c.cloud} opacity={0.75} />
      <Line x1="26" y1="10" x2="26" y2="24" stroke={c.ink} strokeWidth="1.2" />
      <Path d="M18 30 L22 22 H30 L34 30Z" fill={c.teal} />
      <Rect x="40" y="70" width="70" height="46" rx="3" fill={c.teal} />
      <Rect x="44" y="96" width="62" height="16" rx="2" fill={c.tealDeep} />
      <Circle cx="75" cy="104" r="2" fill={c.sun} />
      <Path d="M36 74 H104 L110 92 H42Z" fill={c.terracotta} />
      <Path d="M40 78 H102 L106 88 H44Z" fill={c.tealDeep} opacity={0.35} />
      {print(52, 58, 16, -16, c)}
      <Rect x="74" y="62" width="20" height="14" rx="1.5" fill={c.paper} transform="rotate(8 84 69)" />
      <Path d="M74 62 L84 70 L94 62" stroke={c.sandDeep} strokeWidth="1" fill="none" transform="rotate(8 84 69)" />
      <Circle cx="98" cy="70" r="3" fill="none" stroke={c.sun} strokeWidth="1.6" />
      <Line x1="100" y1="72" x2="105" y2="77" stroke={c.sun} strokeWidth="1.6" strokeLinecap="round" />
      <Rect x="10" y="100" width="14" height="14" rx="2" fill={c.terracotta} />
      <Ellipse cx="13" cy="96" rx="4" ry="7" fill={c.moss} transform="rotate(-20 13 96)" />
      <Ellipse cx="21" cy="95" rx="4" ry="7" fill={c.sage} transform="rotate(20 21 95)" />
      {sparkle(100, 46, 3.5, c.sun)}
    </G>
  ),

  // Fanned calendar pages and a question mark: which year?
  guessYear: (c) => (
    <G>
      {sky(c.sky)}
      <G transform="rotate(-14 60 80)">
        <Rect x="34" y="46" width="52" height="62" rx="5" fill={c.sand} />
      </G>
      <G transform="rotate(-5 60 80)">
        <Rect x="34" y="46" width="52" height="62" rx="5" fill={c.rose} />
      </G>
      <G transform="rotate(5 60 80)">
        <Rect x="34" y="46" width="52" height="62" rx="5" fill={c.paper} />
        <Path d="M34 51 a5 5 0 0 1 5 -5 h42 a5 5 0 0 1 5 5 v9 h-52z" fill={c.teal} />
        <Path
          d="M52 76 Q52 68 60 68 Q68 68 68 75 Q68 80 61 83 V88"
          stroke={c.terracotta}
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
        />
        <Circle cx="61" cy="96" r="2.6" fill={c.terracotta} />
      </G>
      {sparkle(98, 38, 4, c.sun)}
      {sparkle(20, 116, 3, c.sun)}
    </G>
  ),

  // A folded map with a dashed route and a pin.
  whereWasThis: (c) => (
    <G>
      {sky(c.skyAlt)}
      <Polygon points="18,50 46,42 46,112 18,120" fill={c.sand} />
      <Polygon points="46,42 74,50 74,120 46,112" fill={c.sage} />
      <Polygon points="74,50 102,42 102,112 74,120" fill={c.sand} />
      <Path d="M24 104 Q40 84 56 92 T92 66" stroke={c.teal} strokeWidth="1.6" strokeDasharray="3 3" fill="none" />
      <Path d="M86 40 C76 40 72 50 78 58 L86 70 L94 58 C100 50 96 40 86 40Z" fill={c.terracotta} />
      <Circle cx="86" cy="50" r="3.6" fill={c.paper} />
      <Path d="M54 66 q4 -6 10 -2" stroke={c.tealLight} strokeWidth="3" fill="none" strokeLinecap="round" />
    </G>
  ),

  // Two prints and a curved arrow: which came first?
  whichFirst: (c) => (
    <G>
      {sky(c.sky)}
      {print(18, 46, 40, -10, c, c.skyAlt)}
      {print(62, 58, 40, 9, c, c.rose)}
      <Path d="M44 36 Q66 18 86 40" stroke={c.teal} strokeWidth="2" fill="none" strokeLinecap="round" />
      <Path d="M86 40 l-6 -1 M86 40 l1 -6" stroke={c.teal} strokeWidth="2" strokeLinecap="round" />
      <Circle cx="26" cy="112" r="6" fill={c.teal} />
      <Circle cx="26" cy="112" r="1.8" fill={c.paper} />
      <Circle cx="102" cy="122" r="6" fill={c.terracotta} />
      <Circle cx="99.5" cy="122" r="1.6" fill={c.paper} />
      <Circle cx="104.5" cy="122" r="1.6" fill={c.paper} />
    </G>
  ),

  // A small grid of cards, two turned up and matching.
  memoryMatch: (c) => (
    <G>
      {sky(c.skyAlt)}
      {[
        [26, 38, false],
        [62, 38, true],
        [26, 80, true],
        [62, 80, false],
      ].map(([x, y, up]) => (
        <G key={`${x}${y}`}>
          <Rect x={x as number} y={y as number} width="32" height="38" rx="4" fill={up ? c.paper : c.teal} />
          {up ? (
            <G>
              <Rect x={(x as number) + 4} y={(y as number) + 4} width="24" height="22" fill={c.sky} />
              <Circle cx={(x as number) + 20} cy={(y as number) + 11} r="3.5" fill={c.sun} />
              <Path d={`M${(x as number) + 4} ${(y as number) + 26} Q${(x as number) + 14} ${(y as number) + 12} ${(x as number) + 28} ${(y as number) + 26}Z`} fill={c.moss} />
            </G>
          ) : (
            <G>
              <Circle cx={(x as number) + 16} cy={(y as number) + 19} r="7" fill="none" stroke={c.tealLight} strokeWidth="1.4" />
              <Circle cx={(x as number) + 16} cy={(y as number) + 19} r="2" fill={c.tealLight} />
            </G>
          )}
        </G>
      ))}
      {sparkle(100, 30, 4, c.sun)}
      {sparkle(16, 126, 3, c.terracotta)}
    </G>
  ),

  // A path winding up to a little flag: you made it.
  finish: (c) => (
    <G>
      {sky(c.sky)}
      <Circle cx="78" cy="40" r="16" fill={c.sun} />
      {cloud(28, 34, c.cloud)}
      <Path d="M0 96 Q30 70 62 84 T120 74 V150 H0Z" fill={c.tealLight} />
      <Path d="M0 118 Q40 92 78 104 T120 98 V150 H0Z" fill={c.sage} />
      <Path d="M0 136 Q50 118 120 130 V150 H0Z" fill={c.moss} />
      <Path d="M30 150 Q44 128 60 124 Q74 120 70 108 Q68 98 78 92" stroke={c.sand} strokeWidth="4" fill="none" strokeLinecap="round" />
      <Line x1="80" y1="92" x2="80" y2="72" stroke={c.ink} strokeWidth="1.4" />
      <Path d="M80 72 L94 76 L80 81Z" fill={c.terracotta} />
      {pine(18, 116, 20, c.tealDeep)}
      {pine(104, 108, 16, c.tealDeep)}
      <Path d="M40 52 q3 -3 6 0 q3 -3 6 0" stroke={c.ink} strokeWidth="1" fill="none" />
      <Path d="M100 58 q2.5 -2.5 5 0 q2.5 -2.5 5 0" stroke={c.ink} strokeWidth="1" fill="none" />
    </G>
  ),

  // A camera among sparkles.
  gameResult: (c) => (
    <G>
      {sky(c.sky)}
      <Rect x="28" y="52" width="64" height="46" rx="8" fill={c.teal} />
      <Rect x="44" y="44" width="20" height="10" rx="3" fill={c.tealDeep} />
      <Rect x="28" y="62" width="64" height="8" fill={c.tealDeep} opacity={0.5} />
      <Circle cx="60" cy="76" r="17" fill={c.ink} />
      <Circle cx="60" cy="76" r="12" fill={c.tealLight} />
      <Circle cx="60" cy="76" r="6" fill={c.ink} />
      <Circle cx="64" cy="72" r="2" fill={c.paper} />
      <Rect x="78" y="56" width="8" height="5" rx="1.5" fill={c.sun} />
      {sparkle(20, 40, 5, c.sun)}
      {sparkle(100, 36, 4, c.terracotta)}
      {sparkle(104, 104, 5, c.sun)}
      {sparkle(16, 104, 3.5, c.teal)}
      <Path d="M30 126 Q60 116 90 126" stroke={c.sandDeep} strokeWidth="2" fill="none" strokeLinecap="round" />
    </G>
  ),
};
