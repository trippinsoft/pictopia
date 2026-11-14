import { useEffect, useState } from "react";
import { View } from "react-native";
import { Text } from "./ui";
import { countdownClock, untilAllowanceReset } from "@/lib/pictopia/daily";

/** Live countdown to when today's free reviews refresh (local midnight). Ticks once a second
 * on its own, so the page around it never re-renders. */
export function ResetCountdown() {
  const [left, setLeft] = useState(() => untilAllowanceReset(Date.now()));
  useEffect(() => {
    const timer = setInterval(() => setLeft(untilAllowanceReset(Date.now())), 1000);
    return () => clearInterval(timer);
  }, []);
  const hours = Math.floor(left / 3_600_000);
  const minutes = Math.floor(left / 60_000) % 60;
  const spoken = hours > 0 ? `${hours} hours and ${minutes} minutes` : `${Math.max(1, minutes)} minutes`;
  return (
    <View accessible accessibilityLabel={`Free reviews refresh in ${spoken}`} className="w-full max-w-xs items-center gap-1 rounded-3xl bg-sun-pastel px-5 py-4">
      <Text className="text-caption font-semibold uppercase text-sun-ink">Free reviews refresh in</Text>
      <Text className="text-display text-sun-ink" style={{ fontVariant: ["tabular-nums"] }}>{countdownClock(left)}</Text>
    </View>
  );
}
