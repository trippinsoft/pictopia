import { useId, type ReactNode } from "react";
import { Circle, ClipPath, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import type { ArtPalette } from "@/theming/illustration";

/** The cards from Pictopia's app icon: a purple card and a yellow card fanned behind a
 * white-bordered photo card (blue sky, sun, clouds, purple mountains, green hills) with the
 * red dot on its corner. Shared by the Memory Match artwork and every face-down card back.
 * Drawn around (cx, cy); at s = 1 the whole fan is about 100 × 92. These are the icon's own
 * brand colors, not theme tokens, so the mark always matches the icon. */
export function CardStackMark({ c, cx, cy, s = 1 }: { c: ArtPalette; cx: number; cy: number; s?: number }) {
  const id = `cardmark${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const card = (x: number, y: number, rot: number, w: number, h: number, children: ReactNode) => (
    <G transform={`translate(${x} ${y}) rotate(${rot})`}>
      {/* Soft contact shadow so each card reads as paper lying on the one beneath. */}
      <Rect x={-w / 2 + 1.5} y={-h / 2 + 3} width={w} height={h} rx="10" fill={c.ink} opacity="0.13" />
      <Rect x={-w / 2} y={-h / 2} width={w} height={h} rx="10" fill="#FFFFFF" />
      {children}
    </G>
  );
  return (
    <G transform={`translate(${cx} ${cy}) scale(${s})`}>
      <Defs>
        <LinearGradient id={`${id}sky`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#1FA2F4" />
          <Stop offset="1" stopColor="#7DD3FB" />
        </LinearGradient>
        <LinearGradient id={`${id}lilac`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#C99BFB" />
          <Stop offset="1" stopColor="#A56CEB" />
        </LinearGradient>
        <ClipPath id={`${id}photo`}><Rect x="-24" y="-26" width="48" height="52" rx="7" /></ClipPath>
      </Defs>
      {card(-20, 6, -22, 48, 58, <Rect x="-20" y="-25" width="40" height="50" rx="7" fill={`url(#${id}lilac)`} />)}
      {card(-4, -8, -15, 52, 58, <Rect x="-22" y="-25" width="44" height="50" rx="7" fill="#FFC20E" />)}
      {card(12, 6, 8, 56, 60, <>
        <G clipPath={`url(#${id}photo)`}>
          <Rect x="-24" y="-26" width="48" height="52" fill={`url(#${id}sky)`} />
          <Circle cx="11" cy="-13" r="7.5" fill="#FFD60A" />
          <G fill="#FFFFFF" opacity="0.95">
            <Ellipse cx="-16" cy="-2" rx="9" ry="3.6" /><Ellipse cx="-14" cy="-5.5" rx="4.5" ry="4" />
            <Ellipse cx="19" cy="5" rx="7.5" ry="3.2" /><Ellipse cx="20" cy="2.2" rx="3.8" ry="3.4" />
          </G>
          <Path d="M2 18 L16 5 Q18 3.5 20 5 L32 18Z" fill="#A876DC" />
          <Path d="M-28 18 L-5 0 Q-1 -3 3 0 L24 18Z" fill="#6A2DC2" />
          <Path d="M-4 20 Q12 7 28 9 V30 H-4Z" fill="#B7E03E" />
          <Path d="M-28 13 Q-8 7 10 16 Q21 22 26 30 H-28Z" fill="#2ECB9B" />
        </G>
        {/* The icon's red dot, ringed in white, sitting on the photo's lower-right corner. */}
        <Circle cx="24" cy="25" r="7" fill="#FFFFFF" />
        <Circle cx="24" cy="25" r="5" fill="#FF5A45" />
      </>)}
    </G>
  );
}
