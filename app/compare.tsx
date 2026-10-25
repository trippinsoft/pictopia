import React, { useState, useEffect } from "react";
import { View, FlatList, Pressable } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, Icon, Button, Empty } from "@/components/pictopia/ui";
import { MediaImage } from "@/components/pictopia/media-image";
import { usePictopia } from "@/components/pictopia/provider";
import { storage, repository } from "@/services/repository";
import { Media, Group } from "@/lib/pictopia/types";
export default function Compare() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const app = usePictopia();
  const [group, setGroup] = useState<Group>(),
    [items, setItems] = useState<Media[]>([]);
  useEffect(() => {
    if (!app.pro) return;
    void storage.getValue<Group[]>("groups").then(async (gs) => {
      const g = gs?.find((g) => g.id === id);
      setGroup(g);
      if (g) {
        const rows = await Promise.all(g.ids.slice(0, 200).map((i) => storage.get(i)));
        setItems(rows.filter((m): m is Media => !!m?.active));
      }
    });
  }, [id, app.revision, app.pro]);
  async function mark(m: Media) {
    if (!app.pro) {
      router.replace("/paywall");
      return;
    }
    await repository.update(m.id, (latest) => ({
      ...latest,
      decision: latest.decision === "delete" ? undefined : "delete",
    }));
    await app.refresh();
  }
  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="mx-auto w-full max-w-4xl flex-1 px-5">
        <View className="my-5 flex-row items-center gap-3">
          <Pressable
            accessibilityLabel="Back"
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/smart"))}
            className="p-3"
          >
            <Icon name="ArrowLeft" className="text-foreground" />
          </Pressable>
          <Text className="text-h2 text-foreground">Choose your keepers</Text>
        </View>
        {!app.pro ? (
          <Empty
            title="Compare with Pictopia Pro"
            description="Your review history is retained when Pro expires."
            action={<Button onPress={() => router.replace("/paywall")}>View Pro plans</Button>}
          />
        ) : (
          <>
            <Text className="mb-5 text-body leading-6 text-muted-foreground">
              {group?.kind === "exact"
                ? "These accessible original files have matching SHA-256 content hashes."
                : "These nearby photos have similar perceptual hashes. The best-shot label is a suggestion based on resolution, sharpness, exposure, and favorites."}{" "}
              Nothing is deleted here.
            </Text>
            <FlatList
              data={items}
              numColumns={2}
              keyExtractor={(m) => m.id}
              columnWrapperStyle={columnStyle}
              contentContainerStyle={listStyle}
              renderItem={({ item }) => (
                <View className="flex-1 overflow-hidden rounded-2xl border border-border bg-card">
                  <Pressable
                    onPress={() => router.push({ pathname: "/preview", params: { id: item.id } })}
                  >
                    <MediaImage media={item} style={coverStyle} />
                    {item.id === group?.best && (
                      <View className="absolute left-3 top-3 rounded-full bg-card px-3 py-2">
                        <Text className="text-caption text-primary">Suggested keeper</Text>
                      </View>
                    )}
                  </Pressable>
                  <View className="p-3">
                    <Text className="mb-3 text-caption text-muted-foreground">
                      {item.width} × {item.height}
                    </Text>
                    <Button
                      danger={item.decision !== "delete"}
                      secondary={item.decision === "delete"}
                      onPress={() => void mark(item).catch((e) => app.setError(e.message))}
                    >
                      {item.decision === "delete" ? "Restore" : "Set aside"}
                    </Button>
                  </View>
                </View>
              )}
            />
            <View className="py-4">
              <Button onPress={() => router.push("/queue")}>Review deletion queue</Button>
            </View>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const columnStyle = { gap: 12 };

const listStyle = { gap: 16, paddingBottom: 24 };

const coverStyle = { height: 240 };
