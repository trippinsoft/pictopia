import { ScreenHeader } from "@/components/pictopia/navigation-header";
import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useFocusEffect } from "expo-router";
import { Loading, Text } from "@/components/pictopia/ui";
import { MediaImage } from "@/components/pictopia/media-image";
import { adventureStore } from "@/services/adventures";
import { storage } from "@/services/storage";
import { plural } from "@/lib/pictopia/text";
import type { Media } from "@/lib/pictopia/types";

type Item = Awaited<ReturnType<typeof adventureStore.setAside>>[number] & { media?: Media };

/** Everything set aside in any Adventure. Marks only: restoring puts a photo back in its
 * Adventure; nothing here deletes anything. */
export default function SetAside() {
  const [items, setItems] = useState<Item[]>();
  const [busy, setBusy] = useState<string>(),
    [message, setMessage] = useState<string>();
  const load = useCallback(async () => {
    try {
      const list = await adventureStore.setAside();
      const rows = await Promise.all(list.map((item) => storage.get(item.id)));
      setItems(list.map((item, i) => ({ ...item, media: rows[i] })));
    } catch {
      setMessage("Your set-aside photos couldn’t be read just now.");
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  async function restore(item: Item) {
    if (busy) return;
    setBusy(item.id);
    try {
      await adventureStore.restore(item);
      setItems((list) => list?.filter((i) => i.id !== item.id));
    } catch {
      setMessage("That photo couldn’t be restored. Please try again.");
    } finally {
      setBusy(undefined);
    }
  }
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "bottom", "left", "right"]}>
      <Stack.Screen options={{ title: "Set aside", headerShown: false }} />
      <View className="mx-auto w-full max-w-3xl flex-1 px-5">
        <ScreenHeader title="Set aside" fallback="/(tabs)/home" />
        <Text className="mb-6 mt-2 text-body leading-6 text-muted-foreground">
          {items?.length
            ? `${plural(items.length, "photo")} you set aside on your adventures. They’re still in your library; restore any you’d like to keep in view.`
            : "Photos you set aside on your adventures appear here. They stay in your library."}
        </Text>
        {!!message && <Text className="mb-4 text-body text-muted-foreground">{message}</Text>}
        {!items ? (
          !message && <Loading />
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            numColumns={3}
            columnWrapperStyle={styles.row}
            contentContainerStyle={styles.grid}
            renderItem={({ item }) => (
              // Capped so a short last row keeps the grid's tile size.
              <View className="max-w-[32%] flex-1 overflow-hidden rounded-2xl bg-card">
                <View className="aspect-square">
                  {item.media ? (
                    <MediaImage media={item.media} className="flex-1" />
                  ) : (
                    <View className="flex-1 items-center justify-center bg-secondary p-2">
                      <Text className="text-caption text-center text-muted-foreground">
                        Unavailable
                      </Text>
                    </View>
                  )}
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Restore this photo"
                  disabled={!!busy}
                  onPress={() => void restore(item)}
                  className="min-h-11 items-center justify-center active:opacity-70"
                >
                  <Text className="text-h6 text-primary">
                    {busy === item.id ? "Restoring…" : "Restore"}
                  </Text>
                </Pressable>
              </View>
            )}
          />
        )}
      </View>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  row: { gap: 8 },
  grid: { gap: 8, paddingBottom: 24 },
});
