import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Icon, Text } from "./ui";
import { useLift } from "./playful";

/** Peek control shared by the wall and year views. */
export function PeekButton({ peeking, onPress, label = "Peek at the whole picture for two seconds" }: { peeking: boolean; onPress: () => void; label?: string }) {
  const lift = useLift(2);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ busy: peeking }} onPress={onPress} style={lift}
      className="min-h-11 flex-row items-center gap-1.5 rounded-full bg-card px-3.5 active:opacity-80">
      <Icon name={peeking ? "EyeOff" : "Eye"} size={18} className="text-foreground" />
      <Text className="text-h6 text-foreground">{peeking ? "Peeking" : "Peek"}</Text>
    </Pressable>
  );
}

/** White frame the wall sits in, like the Postcards elsewhere in the app. */
export function WallFrame({ children }: { children: ReactNode }) {
  const lift = useLift();
  return <View style={lift} className="rounded-[22px] bg-card p-[7px]">{children}</View>;
}

export function BigPercent({ value, label, detail }: { value?: number; label: string; detail?: string }) {
  return (
    <View className="flex-row items-end gap-3">
      <Text className="text-[46px] leading-[50px] text-foreground" style={display}>{value === undefined ? "—" : `${value}%`}</Text>
      <View className="flex-1 pb-1.5">
        <Text className="text-h4 text-foreground">{label}</Text>
        {!!detail && <Text className="text-caption text-muted-foreground">{detail}</Text>}
      </View>
    </View>
  );
}
const display = { fontFamily: "Fredoka_700Bold" } as const;
