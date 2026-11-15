import type { ComponentProps } from "react";
import { StyleSheet } from "react-native";
import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import { Icon, Text } from "./ui";

/** Fades in with the drag and reaches full size at the discard threshold (64 px). Same look
 * and timing as the regular review's label. */
function labelStyle(uncovered: number) {
  "worklet";
  const progress = Math.min(1, Math.max(0, (uncovered - 12) / 52));
  return { opacity: progress, transform: [{ scale: 0.85 + 0.15 * progress }] };
}
function Label({ style }: { style: ComponentProps<typeof Animated.View>["style"] }) {
  return <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={style} className="items-center rounded-3xl bg-background/85 px-5 py-4">
    <Icon name="Trash2" size={40} className="text-destructive" />
    <Text className="mt-2 text-h3 text-destructive">Discard</Text>
  </Animated.View>;
}
/** The "Discard" label on whichever side a sideways drag uncovers. Place over the photo,
 * outside the part that moves. `hidden` drops it the moment the photo is handed to its flight. */
export function DiscardLabels({ x, hidden }: { x: SharedValue<number>; hidden?: SharedValue<boolean> }) {
  const left = useAnimatedStyle(() => labelStyle(hidden?.value ? 0 : x.value));
  const right = useAnimatedStyle(() => labelStyle(hidden?.value ? 0 : -x.value));
  return <>
    <Label style={[styles.label, styles.left, left]} />
    <Label style={[styles.label, styles.right, right]} />
  </>;
}
const styles = StyleSheet.create({
  label: { position: "absolute", top: "40%" },
  left: { left: 16 },
  right: { right: 16 },
});
