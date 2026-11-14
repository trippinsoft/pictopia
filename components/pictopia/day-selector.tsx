import { Pressable, ScrollView, View } from "react-native";
import { Text } from "./ui";
import { plural } from "@/lib/pictopia/text";

export interface DayOption { date: string; count?: number }

/** Newest-first dates displayed chronologically, with today at the right. */
export function DaySelector({ dates, selected, pro, disabled, onSelect }: {
  dates: DayOption[]; selected: string; pro: boolean; disabled?: boolean;
  onSelect(date: string): void;
}) {
  return <View className="h-11 w-full">
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="grow items-center justify-center gap-1 px-3" accessibilityLabel="Choose a memory date">
      {dates.map((item, index) => {
        const date = new Date(`${item.date}T12:00:00`);
        const active = item.date === selected;
        const empty = item.count === 0;
        const locked = index > 0 && !pro;
        return <Pressable key={item.date} accessibilityRole="tab"
          accessibilityLabel={`${index === 0 ? "Today, " : ""}${date.toLocaleDateString(undefined, { month: "long", day: "numeric" })}, ${item.count === undefined ? "checking photos" : empty ? "no photos or videos" : plural(item.count, "memory", "memories")}${locked ? ", Pictopia+" : ""}`}
          accessibilityState={{ selected: active, disabled: !!disabled }} disabled={disabled}
          onPress={() => onSelect(item.date)}
          className={`min-h-11 shrink-0 items-center justify-center border-b-2 px-1 active:opacity-70 ${active ? "border-sun" : "border-transparent"}`}>
          <Text numberOfLines={1} className={`text-caption ${active ? "text-sun" : empty ? "text-muted-foreground opacity-50" : "text-foreground"}`}>{date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</Text>
        </Pressable>;
      }).reverse()}
    </ScrollView>
  </View>;
}
