import { memo, type ReactNode } from "react";
import { View, type ViewStyle } from "react-native";
import Svg, { Circle, Path, Polygon, Rect } from "react-native-svg";
import { Icon, Text } from "@/components/pictopia/ui";
import { Illustration, type ArtName } from "@/components/pictopia/illustration";
import { useTheme } from "@/theming/ThemeProvider";
import { darkArt, lightArt, type ArtPalette } from "@/theming/illustration";
import { memoryTable } from "@/lib/pictopia/memory-match";

/** Onboarding's stand-ins for photos, screenshots and videos. Everything is drawn from the
 * Storybook illustration palette (never stock or personal photos), framed like the white
 * prints of Memory Match so the demos feel like the rest of Pictopia. */
export function useArt(): ArtPalette {
  const { theme } = useTheme();
  return theme.name === "dark" || theme.name === "adventure" ? darkArt : lightArt;
}

/** A soft table shadow, the same one Memory Match prints rest on. */
export const tableShadow = (index: number) => ({ boxShadow: memoryTable(index).shadow }) as ViewStyle;

/** A white-bordered print holding one of the illustration scenes. */
export const Print = memo(function Print({ art, width, height, index = 1, faded = false }: { art: ArtName; width: number; height: number; index?: number; faded?: boolean }) {
  const c = useArt();
  return (
    <View style={[{ width, height, backgroundColor: c.paper, padding: Math.max(3, width * 0.05), borderRadius: width * 0.14 }, tableShadow(index)]}>
      <View style={{ flex: 1, overflow: "hidden", borderRadius: width * 0.1, opacity: faded ? 0.55 : 1 }}>
        <Illustration name={art} />
      </View>
    </View>
  );
});

/** A screenshot: a little phone screen with a header block, text lines and a button. */
export const Screenshot = memo(function Screenshot({ width, height, index = 1, tint = 0 }: { width: number; height: number; index?: number; tint?: number }) {
  const c = useArt();
  const header = [c.tealLight, c.sage, c.rose, c.sand][tint % 4];
  return (
    <View style={[{ width, height, borderRadius: width * 0.16, backgroundColor: c.tealDeep, padding: width * 0.06 }, tableShadow(index)]}>
      <Svg width="100%" height="100%" viewBox="0 0 40 70" preserveAspectRatio="none">
        <Rect x="0" y="0" width="40" height="70" rx="4" fill={c.paper} />
        <Rect x="14" y="2.5" width="12" height="2.5" rx="1.25" fill={c.tealDeep} opacity={0.5} />
        <Rect x="4" y="8" width="32" height="18" rx="2.5" fill={header} />
        <Circle cx="29" cy="14" r="3" fill={c.sun} />
        <Rect x="4" y="31" width="26" height="3" rx="1.5" fill={c.sandDeep} opacity={0.6} />
        <Rect x="4" y="37" width="30" height="3" rx="1.5" fill={c.sandDeep} opacity={0.45} />
        <Rect x="4" y="43" width="20" height="3" rx="1.5" fill={c.sandDeep} opacity={0.45} />
        <Rect x="4" y="54" width="18" height="8" rx="4" fill={c.terracotta} opacity={0.85} />
      </Svg>
    </View>
  );
});

/** A video clip: a film frame with a play button and, optionally, its size. */
export const VideoClip = memo(function VideoClip({ width, height, tint = 0, size, index = 1, highlight = false }: { width: number; height: number; tint?: number; size?: string; index?: number; highlight?: boolean }) {
  const c = useArt();
  const fill = [c.tealLight, c.sage, c.canvasBlue, c.rose][tint % 4];
  return (
    <View style={[{ width, height, borderRadius: 14, backgroundColor: c.paper, padding: 4, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 2, borderColor: highlight ? c.terracotta : "transparent" }, tableShadow(index)]}>
      <View style={{ height: "100%", aspectRatio: 1.3, borderRadius: 10, overflow: "hidden" }}>
        <Svg width="100%" height="100%" viewBox="0 0 52 40" preserveAspectRatio="xMidYMid slice">
          <Rect x="0" y="0" width="52" height="40" fill={fill} />
          <Circle cx="40" cy="10" r="4" fill={c.sun} />
          <Path d="M0 40 Q14 20 28 32 Q38 24 52 30 V40Z" fill={c.moss} />
          <Circle cx="26" cy="20" r="8" fill={c.terracotta} />
          <Polygon points="23.5,15.5 23.5,24.5 31,20" fill={c.paper} />
        </Svg>
      </View>
      {size ? (
        <View className="flex-1 gap-1">
          <Text style={{ color: c.ink }} className="text-h5">{size}</Text>
          <View style={{ height: 4, width: "70%", borderRadius: 2, backgroundColor: c.sandDeep, opacity: 0.35 }} />
        </View>
      ) : null}
    </View>
  );
});

/** A sticky note with a short handwritten-style line. */
export function StickyNote({ children, width }: { children: string; width: number }) {
  const c = useArt();
  return (
    <View style={[{ width, paddingHorizontal: 10, paddingVertical: 12, backgroundColor: c.sun, borderRadius: 6 }, tableShadow(3)]}>
      <Text style={{ color: lightArt.ink }} className="text-center text-h5">{children}</Text>
    </View>
  );
}

/** The Discarded can every demo throws into: the review's tomato trash circle. */
export function TrashCan({ size = 40 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size }} className="items-center justify-center rounded-full bg-tomato">
      <Icon name="Trash2" size={size * 0.45} color="#fff" />
    </View>
  );
}

/** A four-pointed Storybook sparkle. */
export function Sparkle({ size, color }: { size: number; color?: string }) {
  const c = useArt();
  return (
    <Svg width={size} height={size} viewBox="-10 -10 20 20">
      <Path d="M0 -10 Q1.8 -1.8 10 0 Q1.8 1.8 0 10 Q-1.8 1.8 -10 0 Q-1.8 -1.8 0 -10Z" fill={color ?? c.sun} />
    </Svg>
  );
}

/** The magnifying glass from the Duplicate Hunt artwork. */
export function Magnifier({ size }: { size: number }) {
  const c = useArt();
  return (
    <Svg width={size} height={size} viewBox="0 0 50 50">
      <Circle cx="20" cy="20" r="15" fill={c.paper} opacity={0.35} />
      <Path d="M11 13 A10 10 0 0 1 21 8.5" stroke={c.paper} strokeWidth="2.4" strokeLinecap="round" fill="none" />
      <Circle cx="20" cy="20" r="15" fill="none" stroke={c.ink} strokeWidth="3.6" />
      <Path d="M31 31 L44 44" stroke={c.terracotta} strokeWidth="6.5" strokeLinecap="round" />
      <Path d="M31 31 L34 34" stroke={c.ink} strokeWidth="6.5" strokeLinecap="round" />
    </Svg>
  );
}

/** Absolutely positioned child centered on (x, y) of its parent. */
export function At({ x, y, w, h, children }: { x: number; y: number; w: number; h: number; children: ReactNode }) {
  return <View pointerEvents="none" style={{ position: "absolute", left: x - w / 2, top: y - h / 2, width: w, height: h }}>{children}</View>;
}
