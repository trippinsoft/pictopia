import React, { useEffect, useState } from "react";
import { View, FlatList } from "react-native";
import { router } from "expo-router";
import { Page, Text, Button, Empty } from "@/components/flickwell/ui";
import { useFlickWell } from "@/components/flickwell/provider";
import { storage } from "@/services/storage";
import { Session } from "@/lib/flickwell/types";
import { bytes } from "@/lib/flickwell/logic";
export default function Statistics() {
  const app = useFlickWell();
  const [sessions, setSessions] = useState<Session[]>([]),
    [cleanup, setCleanup] = useState({ count: 0, estimatedBytes: 0 });
  useEffect(() => {
    if (!app.ready) return;
    void storage
      .getValue<{ count: number; estimatedBytes: number }>("confirmedCleanup")
      .then((c) => setCleanup(c ?? { count: 0, estimatedBytes: 0 }));
    void storage.getValue<string[]>("sessionHistory").then(async (ids) => {
      const rows = await Promise.all(
        (ids ?? [])
          .slice(-20)
          .reverse()
          .map((id) => storage.getValue<Session>(`session:${id}`)),
      );
      setSessions(rows.filter((s): s is Session => !!s));
    });
  }, [app.revision]);
  return (
    <Page title="A little progress adds up" subtitle="Honest numbers. A lighter library.">
      {!app.pro ? (
        <Empty
          title="Deeper insights with Pro"
          description="Your basic progress remains available on Home and in Settings. Cleanup history is retained even without Pro."
          action={<Button onPress={() => router.push("/paywall")}>View Pro plans</Button>}
        />
      ) : (
        <>
          <View className="mb-6 flex-row gap-4">
            <View className="flex-1 rounded-3xl bg-accent p-6">
              <Text className="text-h1 text-primary">{cleanup.count}</Text>
              <Text className="mt-2 text-body text-foreground">Confirmed deleted</Text>
            </View>
            <View className="flex-1 rounded-3xl border border-border bg-card p-6">
              <Text className="text-h2 text-foreground">{bytes(cleanup.estimatedBytes)}</Text>
              <Text className="mt-2 text-caption leading-5 text-muted-foreground">
                Combined estimated size of confirmed deletions
              </Text>
            </View>
          </View>
          <Text className="mb-7 text-body leading-6 text-muted-foreground">
            These are media-file estimates, not measured device free space. Recently Deleted or
            Trash may still hold the files.
          </Text>
          <View className="mb-7 rounded-3xl border border-border bg-card p-6">
            <Text className="text-h3 text-foreground">What we can measure</Text>
            <Text className="mt-3 text-body leading-7 text-muted-foreground">
              {bytes(app.stats.knownBytes)} in accessible media with known sizes.{"\n"}Size metadata
              available for {app.stats.knownSizes} of {app.stats.total} items.{"\n"}
              {bytes(app.stats.pendingBytes)} estimated in your current deletion queue.
            </Text>
          </View>
          <Text className="mb-4 text-h3 text-foreground">Your latest review sessions</Text>
          <FlatList
            horizontal
            data={sessions}
            keyExtractor={(s) => s.id}
            contentContainerStyle={listStyle}
            renderItem={({ item }) => (
              <View className="w-60 rounded-2xl border border-border bg-card p-5">
                <Text className="text-h5 text-foreground">
                  {new Date(item.started).toLocaleDateString()}
                </Text>
                <Text className="mt-3 text-body leading-6 text-muted-foreground">
                  {item.reviewed} reviewed{"\n"}
                  {item.kept} kept • {item.marked} marked
                </Text>
                <Text className="mt-3 text-caption text-primary">
                  {item.complete ? "Session finished" : "Progress saved"}
                </Text>
              </View>
            )}
            ListEmptyComponent={
              <Text className="text-body text-muted-foreground">
                Your review sessions will appear here.
              </Text>
            }
          />
        </>
      )}
    </Page>
  );
}
const listStyle = { gap: 12 };
