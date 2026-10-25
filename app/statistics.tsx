import React, { useEffect, useState } from "react";
import { View, FlatList } from "react-native";
import { router } from "expo-router";
import { Page, Text, Button, Empty } from "@/components/pictopia/ui";
import { usePictopia } from "@/components/pictopia/provider";
import { storage } from "@/services/storage";
import { Session } from "@/lib/pictopia/types";
import { SessionTally } from "@/lib/pictopia/sessions";
import { repository } from "@/services/repository";
import { bytes } from "@/lib/pictopia/logic";
export default function Statistics() {
  const app = usePictopia();
  const [sessions, setSessions] = useState<(Session & { tally: SessionTally })[]>([]),
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
      const saved = rows.filter((s): s is Session => !!s);
      // Counts reflect current decisions, so restored items no longer appear as marked.
      setSessions(
        await Promise.all(saved.map(async (s) => ({ ...s, tally: await repository.tally(s) }))),
      );
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
                  {item.tally.reviewed} reviewed{"\n"}
                  {item.tally.kept} kept • {item.tally.setAside} set aside
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
