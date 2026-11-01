import { forwardRef, useImperativeHandle, useState } from "react";
import { StyleSheet, View } from "react-native";
import { reviewRailLines } from "@/lib/pictopia/review-rail";

/** Original adventure positions stay fixed even when the visible feed loses a photograph. */
export interface ReviewProgressRailHandle { setPosition(position: number): void }
export const ReviewProgressRail = forwardRef<ReviewProgressRailHandle, {
  ids: readonly string[];
  queued: ReadonlySet<string>;
  initialPosition: number;
}>(function ReviewProgressRail({
  ids,
  queued,
  initialPosition,
}, ref) {
  const [position, setPosition] = useState(initialPosition);
  useImperativeHandle(ref, () => ({ setPosition }), []);
  const lines = reviewRailLines(ids, queued, position);
  if (!lines.length) return null;
  return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.rail} className="rounded-r-lg bg-background/70">
    {lines.map(line =>
      <View
        key={line.id}
        className={line.discarded ? "bg-muted-foreground" : "bg-foreground"}
        style={[
          styles.line,
          line.active && styles.active,
          {
            top: 76 + line.offset,
            opacity: line.opacity,
          },
        ]}
      />,
    )}
    <View style={styles.highlight} className="bg-foreground" />
  </View>;
});

const styles = StyleSheet.create({
  rail: { position: "absolute", left: 0, top: "50%", marginTop: -76, width: 12, height: 152, overflow: "hidden" },
  line: { position: "absolute", left: 1, width: 4, height: 3, borderRadius: 2 },
  active: { width: 8 },
  highlight: { position: "absolute", left: 1, top: 76, width: 8, height: 3, borderRadius: 2 },
});
