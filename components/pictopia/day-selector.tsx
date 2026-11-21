import { Pressable, ScrollView, View } from "react-native";
import { Icon, Text } from "./ui";
import { plural } from "@/lib/pictopia/text";

export interface DayOption { date: string; count?: number }

const shortDate = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

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
        const parts = locked ? shortDate.formatToParts(date) : [];
        const beforeMonth = parts.slice(0, parts.findIndex(part => part.type === "month")).map(part => part.value).join("");
        return <Pressable key={item.date} accessibilityRole="tab"
          accessibilityLabel={`${index === 0 ? "Today, " : ""}${date.toLocaleDateString(undefined, { month: "long", day: "numeric" })}, ${item.count === undefined ? "checking photos" : empty ? "no photos or videos" : plural(item.count, "memory", "memories")}${locked ? ", requires Pictopia+" : ""}`}
          accessibilityState={{ selected: active, disabled: !!disabled }} disabled={disabled}
          onPress={() => onSelect(item.date)}
          className={`min-h-11 shrink-0 items-center justify-center border-b-2 px-1 active:opacity-70 ${active ? "border-sun" : "border-transparent"}`}>
          <View className="relative">
            <Text numberOfLines={1} className={`text-caption ${active ? "text-sun" : empty ? "text-muted-foreground opacity-50" : "text-foreground"}`}>{shortDate.format(date)}</Text>
            {locked ? (
              <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden className="absolute bottom-full left-0 flex-row items-end">
                {/* Match the date's leading width in locales that put the day first. */}
                {beforeMonth ? <Text className="text-caption opacity-0">{beforeMonth.replace(/ /g, "\u00a0")}</Text> : null}
                <Icon name="LockKeyhole" size={10} className="text-sun" />
              </View>
            ) : null}
          </View>
        </Pressable>;
      }).reverse()}
    </ScrollView>
  </View>;
}
