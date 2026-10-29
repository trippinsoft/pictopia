import React, { useEffect, useState } from "react";
import { View, FlatList, Pressable, Platform, Modal } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, Icon, Button, Empty, Loading } from "@/components/pictopia/ui";
import { usePictopia } from "@/components/pictopia/provider";
import { MediaImage } from "@/components/pictopia/media-image";
import { Media } from "@/lib/pictopia/types";
import { repository, storage } from "@/services/repository";
import { bytes } from "@/lib/pictopia/logic";
import { deletionMessage } from "@/lib/pictopia/deletion";
import { plural } from "@/lib/pictopia/text";
export default function Queue() {
  const app = usePictopia();
  const [items, setItems] = useState<Media[]>([]),
    [loading, setLoading] = useState(true),
    [confirmation, setConfirmation] = useState(false),
    [confirmItems, setConfirmItems] = useState<Media[]>([]),
    [working, setWorking] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    if (!app.ready) return;
    setLoading(true);
    storage
      .query({ decision: "delete", limit: 100 })
      .then(setItems)
      .catch(() => app.setError("The queue could not load. Please try again."))
      .finally(() => setLoading(false));
  }, [app.revision, app.ready]);
  async function restore(ids: string[]) {
    await repository.restore(ids);
    await app.refresh();
  }
  async function restoreAll() {
    setWorking(true);
    try {
      for (;;) {
        const rows = await storage.query({ decision: "delete", limit: 100 });
        if (!rows.length) break;
        await repository.restore(rows.map((m) => m.id));
      }
      await app.refresh();
    } finally {
      setWorking(false);
    }
  }
  async function confirm() {
    setWorking(true);
    try {
      const result = await app.deleteQueue(confirmItems);
      setConfirmation(false);
      setMessage(deletionMessage(result));
    } catch (e) {
      app.setError(e instanceof Error ? e.message : "Deletion did not complete.");
    } finally {
      setWorking(false);
    }
  }
  return (
    <SafeAreaView edges={["top", "left", "right"]} className="flex-1 bg-background">
      <View className="mx-auto w-full max-w-4xl flex-1 px-5">
        <View className="my-6 flex-row items-center gap-3">
          <Pressable
            accessibilityLabel="Back"
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/home"))}
            className="p-3"
          >
            <Icon name="ArrowLeft" className="text-foreground" />
          </Pressable>
          <View className="flex-1">
            <Text className="text-h2 text-foreground">Review before you let go</Text>
            <Text className="mt-1 text-body text-muted-foreground">
              Nothing has been deleted yet.
            </Text>
          </View>
        </View>
        <View className="mb-5 rounded-2xl bg-accent p-5">
          <Text className="text-h2 text-primary">
            {plural(app.stats.pending, "item")} set aside
          </Text>
          <Text className="mt-2 text-body text-muted-foreground">
            {bytes(app.stats.pendingBytes)} estimated • Known file sizes only
          </Text>
          <Text className="mt-3 text-body leading-6 text-foreground">
            Changed your mind? Restore anything to take it out of this list.
          </Text>
        </View>
        {Platform.OS === "web" && (
          <Text className="mb-4 text-body leading-6 text-muted-foreground">
            Browser review only. Device deletion requires the native app; your original files remain
            untouched.
          </Text>
        )}
        {!!message && (
          <Text accessibilityRole="alert" className="mb-4 text-body text-primary">
            {message}
          </Text>
        )}
        {loading ? (
          <Loading />
        ) : (
          <FlatList
            data={items}
            keyExtractor={(m) => m.id}
            numColumns={3}
            columnWrapperStyle={columnStyle}
            contentContainerStyle={listStyle}
            onEndReached={() => {
              if (items.length < app.stats.pending)
                void storage
                  .query({ decision: "delete", limit: 100, offset: items.length })
                  .then((rows) => setItems((old) => [...old, ...rows]));
            }}
            renderItem={({ item }) => (
              <View
                style={tileStyle}
                className="overflow-hidden rounded-2xl border border-border bg-card"
              >
                <Pressable
                  onPress={() => router.push({ pathname: "/preview", params: { id: item.id } })}
                >
                  <MediaImage media={item} style={coverStyle} />
                  {item.type === "video" && (
                    <View className="absolute left-2 top-2 rounded-full bg-card p-1">
                      <Icon name="Play" size={15} className="text-foreground" />
                    </View>
                  )}
                </Pressable>
                <Pressable
                  accessibilityLabel="Restore this item"
                  onPress={() => void restore([item.id])}
                  className="flex-row items-center justify-center gap-2 py-3"
                >
                  <Icon name="Undo2" size={16} className="text-primary" />
                  <Text className="text-caption text-primary">Restore</Text>
                </Pressable>
              </View>
            )}
            ListEmptyComponent={
              <Empty
                icon="Heart"
                title="No memories marked for deletion"
                description="Swipe left to set something aside. It will wait here until you’re ready."
                action={
                  <Button onPress={() => router.replace("/(tabs)/swipe")}>Start reviewing</Button>
                }
              />
            }
          />
        )}
        {!!items.length && (
          <View className="gap-3 border-t border-border py-4">
            <Button
              disabled={working || app.busy}
              danger
              onPress={() => {
                setConfirmItems(items.slice(0, 100));
                setConfirmation(true);
              }}
              icon="Trash2"
            >
              {Platform.OS === "web"
                ? "About device deletion"
                : `Delete ${plural(Math.min(items.length, 100), "item")}…`}
            </Button>
            <Button disabled={working} secondary onPress={() => void restoreAll()}>
              Restore all
            </Button>
          </View>
        )}
      </View>
      <Modal
        visible={confirmation}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!working) setConfirmation(false);
        }}
      >
        <View className="flex-1 items-center justify-center bg-overlay/70 px-5">
          <View className="w-full max-w-md rounded-3xl bg-card p-7">
            <Icon name="ShieldCheck" size={36} className="mb-5 text-primary" />
            <Text className="text-h2 text-foreground">One last check.</Text>
            <Text className="my-5 text-body leading-7 text-muted-foreground">
              {plural(confirmItems.filter((m) => m.type === "photo").length, "photo")} and{" "}
              {plural(confirmItems.filter((m) => m.type === "video").length, "video")}
              {"\n"}
              {bytes(confirmItems.reduce((n, m) => n + (m.size ?? 0), 0))} estimated from known
              sizes.{"\n\n"}Your device will ask for authorization. Deleted items may stay in
              Recently Deleted or Trash, so free device storage may not change immediately.
            </Text>
            {Platform.OS === "web" ? (
              <Text className="mb-5 text-body leading-6 text-foreground">
                The browser cannot request device deletion. These files remain in your queue, and
                your originals are safe.
              </Text>
            ) : (
              <Button danger disabled={working} onPress={() => void confirm()}>
                {working ? "Waiting for your device…" : "Delete from device"}
              </Button>
            )}
            <View className="mt-3">
              <Button secondary disabled={working} onPress={() => setConfirmation(false)}>
                Not now, keep them
              </Button>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const columnStyle = { gap: 10 };

const listStyle = { gap: 10, paddingBottom: 20 };

const coverStyle = { aspectRatio: 1 };

const tileStyle = { width: "31.5%" as const };
