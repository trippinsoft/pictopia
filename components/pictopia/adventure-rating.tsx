import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { Text } from "./ui";
import type { Adventure } from "@/lib/pictopia/adventures";
import {
  adventureStore,
  RATING_LABELS,
  type AdventureFeedback,
  type RatingKey,
} from "@/services/adventures";

/** Optional 1–5 ratings for an Adventure Lab experiment. Each tap saves on its own. */
export function AdventureRating({
  adventure,
  initial,
  onSaved,
}: {
  adventure: Pick<Adventure, "id" | "kind">;
  initial?: AdventureFeedback;
  onSaved?: (feedback: AdventureFeedback) => void;
}) {
  const [ratings, setRatings] = useState(initial?.ratings ?? {});
  const [error, setError] = useState(false);
  useEffect(() => {
    setRatings(initial?.ratings ?? {});
  }, [initial]);
  function rate(key: RatingKey, value: number) {
    setRatings((r) => ({ ...r, [key]: value }));
    setError(false);
    adventureStore
      .setFeedback(adventure, { ratings: { [key]: value } })
      .then(onSaved)
      .catch(() => setError(true));
  }
  return (
    <View className="gap-3">
      {(Object.keys(RATING_LABELS) as RatingKey[]).map((key) => (
        <View key={key} className="flex-row items-center justify-between gap-3">
          <Text className="flex-1 text-body text-foreground">{RATING_LABELS[key]}</Text>
          <View className="flex-row gap-1.5">
            {[1, 2, 3, 4, 5].map((value) => {
              const selected = ratings[key] === value;
              return (
                <Pressable
                  key={value}
                  accessibilityRole="radio"
                  accessibilityLabel={`${RATING_LABELS[key]}: ${value} of 5`}
                  accessibilityState={{ selected }}
                  onPress={() => rate(key, value)}
                  className={`h-9 w-9 items-center justify-center rounded-full border ${selected ? "border-primary bg-primary" : "border-border bg-card"}`}
                >
                  <Text
                    className={`text-caption ${selected ? "text-primary-foreground" : "text-foreground"}`}
                  >
                    {value}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
      {error && (
        <Text className="text-caption text-muted-foreground">
          That rating couldn’t be saved. Tap it again.
        </Text>
      )}
    </View>
  );
}
