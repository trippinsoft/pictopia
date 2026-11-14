import { memo, useMemo, useState } from "react";
import { Pressable, View, type LayoutChangeEvent } from "react-native";
import Svg, { Line, Path, Rect as SvgRect, SvgXml } from "react-native-svg";
import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import { Icon, Text } from "./ui";
import { useTheme } from "@/theming/ThemeProvider";
import { worldArt } from "@/theming/illustration";
import { worldSvg } from "@/lib/pictopia/memory-wall-art";
import { coverPaths, gapLines, UNDATED, WALL_H, WALL_W, yearComplete, yearLabel, type Rect, type WallModel, type WallYear } from "@/lib/pictopia/memory-wall";
import { wallPercent } from "@/lib/pictopia/library-progress";

const FULL: Rect = { x: 0, y: 0, w: WALL_W, h: WALL_H };
const SHADES = [worldArt.tile1, worldArt.tile2, worldArt.tile3, worldArt.tile4];
const intersects = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** The illustration (one SvgXml layer, drawn once per window). */
const Art = memo(function Art({ view }: { view: Rect }) {
  const xml = useMemo(() => worldSvg(view), [view]);
  return <SvgXml xml={xml} width="100%" height="100%" />;
});

/** Unexplored tiles as five paths, faded out by Peek without touching progress. */
const Cover = memo(function Cover({ model, view, tileSize, peek }: { model: WallModel; view: Rect; tileSize: number; peek?: SharedValue<number> }) {
  const paths = useMemo(() => coverPaths(model, tileSize, (y) => intersects(y.rect, view)), [model, tileSize, view]);
  const style = useAnimatedStyle(() => ({ opacity: 1 - (peek?.value ?? 0) }));
  return (
    <Animated.View pointerEvents="none" style={[fill, style]}>
      <Svg width="100%" height="100%" viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} preserveAspectRatio="xMidYMid slice">
        {!!paths.grout && <Path d={paths.grout} fill={worldArt.tileGrout} />}
        {paths.shades.map((d, i) => (d ? <Path key={i} d={d} fill={SHADES[i]} /> : null))}
      </Svg>
    </Animated.View>
  );
});

/**
 * Memory Wall canvas: artwork, tile cover, year gaps, labels and one tappable region per year.
 * `view` crops to a window of the wall (year close-ups); the art and tiles always stay aligned
 * because every layer shares the same 360 × 450 coordinate space.
 */
export function WallCanvas({ model, view = FULL, tileSize, labels = true, highlight, dimOthers = false, monthLines = false, onYear, peek, gap = 3 }: {
  model: WallModel;
  view?: Rect;
  tileSize: number;
  labels?: boolean;
  highlight?: string;
  dimOthers?: boolean;
  monthLines?: boolean;
  onYear?: (key: string) => void;
  peek?: SharedValue<number>;
  /** Gap between years in screen points. */
  gap?: number;
}) {
  const { theme } = useTheme();
  const card = theme.colors.card ?? "#FFFFFF";
  const ink = theme.colors.foreground ?? worldArt.ink;
  const [width, setWidth] = useState(0);
  const scale = width / view.w || 1;
  const gapUnits = gap / scale;
  const lines = useMemo(() => gapLines(model), [model]);
  const visible = model.years.filter((y) => intersects(y.rect, view));
  const selected = highlight ? model.years.find((y) => y.key === highlight) : undefined;
  const pct = (r: Rect) => ({ left: `${((r.x - view.x) / view.w) * 100}%`, top: `${((r.y - view.y) / view.h) * 100}%`, width: `${(r.w / view.w) * 100}%`, height: `${(r.h / view.h) * 100}%` }) as const;
  return (
    <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} style={{ aspectRatio: view.w / view.h }} className="w-full overflow-hidden rounded-[15px]">
      <View pointerEvents="none" style={fill}><Art view={view} /></View>
      <Cover model={model} view={view} tileSize={tileSize} peek={peek} />
      <View pointerEvents="none" style={fill}>
        <Svg width="100%" height="100%" viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} preserveAspectRatio="xMidYMid slice">
          {monthLines && selected?.blocks.map((b) => <SvgRect key={b.key} x={b.rect.x} y={b.rect.y} width={b.rect.w} height={b.rect.h} fill="none" stroke={card} strokeWidth={0.6 / Math.max(scale / 3, 1)} opacity={0.8} />)}
          {dimOthers && visible.filter((y) => y.key !== highlight).map((y) => <SvgRect key={y.key} x={y.rect.x} y={y.rect.y} width={y.rect.w} height={y.rect.h} fill={card} opacity={0.68} />)}
          {lines.map((l, i) => <Line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={card} strokeWidth={gapUnits} />)}
          {selected && <SvgRect x={selected.rect.x + 1 / scale} y={selected.rect.y + 1 / scale} width={selected.rect.w - 2 / scale} height={selected.rect.h - 2 / scale} rx={2 / scale} fill="none" stroke={ink} strokeWidth={2.5 / scale} />}
        </Svg>
      </View>
      {visible.map((y) => (
        <YearRegion key={y.key} year={y} style={pct(y.rect)} showLabel={labels} size={labelSize(y.rect.w * scale, y.rect.h * scale, y.key)} onPress={onYear} />
      ))}
    </View>
  );
}

/** Label that always fits inside its own year (never over a neighbour or the year's picture):
 * full name with a check, a short "’10" when tight, or nothing when the cell is tiny (the year
 * stays tappable and announced). Widths in screen points, measured against the pill's size. */
function labelSize(w: number, h: number, key: string): "full" | "short" | "shortCheck" | "none" {
  const full = (key === UNDATED ? 64 : 46) + 22;
  if (w >= full + 6 && h >= 30) return "full";
  if (w >= 58 && h >= 24) return "shortCheck";
  if (w >= 40 && h >= 24) return "short";
  return "none";
}

function YearRegion({ year, style, showLabel, size, onPress }: { year: WallYear; style: object; showLabel: boolean; size: "full" | "short" | "shortCheck" | "none"; onPress?: (key: string) => void }) {
  const small = size === "short" || size === "shortCheck";
  const done = yearComplete(year);
  const name = yearLabel(year.key);
  const text = small ? (year.key === "unknown" ? "?" : `’${year.key.slice(2)}`) : name;
  const percent = wallPercent(year) ?? 0;
  const label = <View className="flex-row items-center gap-1 self-start rounded-full bg-card/95 px-1.5 py-0.5">
    <Text className={`${small ? "text-[10px]" : "text-[12px]"} font-semibold text-foreground`} style={labelFont}>{text}</Text>
    {done && size !== "short" && <View className="h-3.5 w-3.5 items-center justify-center rounded-full bg-grass"><Icon name="Check" size={10} strokeWidth={3} className="text-white" /></View>}
  </View>;
  const body = <View className="p-1">{showLabel && size !== "none" ? label : null}</View>;
  if (!onPress) return <View pointerEvents="none" style={[abs, style]} className="overflow-hidden">{body}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}. ${done ? "Every photo explored" : `${percent}% explored`}. Open ${name}.`}
      onPress={() => onPress(year.key)}
      style={[abs, style]}
      className="overflow-hidden"
    >
      {body}
    </Pressable>
  );
}

const fill = { position: "absolute", left: 0, top: 0, right: 0, bottom: 0 } as const;
const abs = { position: "absolute" } as const;
const labelFont = { fontFamily: "Fredoka_600SemiBold" } as const;
