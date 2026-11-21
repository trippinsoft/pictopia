import type { ViewStyle } from "react-native";

/** Home's gaps between sections: roomy when everything fits, compressed toward the
 * compact minimums when the screen is short, and scrolling beyond that.
 *
 * The compression is done entirely by the native layout engine in a single pass:
 * each gap is a flex spacer that starts at its compact height and may grow (in
 * proportion to its range) up to its roomy height. Nothing is measured in
 * JavaScript and no React state depends on layout, so a layout result can never
 * feed back into the next layout. (Measuring sections with onLayout and choosing
 * 4 pt-stepped gaps from that state made Home oscillate between two layouts.) */
export const HOME_GAPS = {
  roomy: { stats: 20, adventure: 28, postcards: 24, note: 32, pending: 28, bottom: 32 },
  compact: { stats: 12, adventure: 20, postcards: 16, note: 20, pending: 16, bottom: 16 },
} as const;
export type HomeGap = keyof typeof HOME_GAPS.roomy;

const styles = Object.fromEntries((Object.keys(HOME_GAPS.roomy) as HomeGap[]).map((key) => {
  const roomy = HOME_GAPS.roomy[key], compact = HOME_GAPS.compact[key];
  return [key, { flexBasis: compact, minHeight: compact, maxHeight: roomy, flexGrow: roomy - compact, flexShrink: 0 }];
})) as Record<HomeGap, ViewStyle>;

/** Style for the spacer that sits before (or, for `bottom`, after) a Home section. */
export function homeGap(key: HomeGap): ViewStyle {
  return styles[key];
}
