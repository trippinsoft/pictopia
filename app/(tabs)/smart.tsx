import React, { useEffect, useState } from "react";
import { View, Pressable, FlatList } from "react-native";
import { router } from "expo-router";
import { Page, Text, Icon, Button, Empty } from "@/components/flickwell/ui";
import { useFlickWell } from "@/components/flickwell/provider";
import { storage, repository } from "@/services/repository";
import { Group, Media } from "@/lib/flickwell/types";
import { MediaImage } from "@/components/flickwell/media-image";
const tools = [
  {
    key: "exact",
    title: "Exact duplicates",
    desc: "Identical original file contents",
    icon: "Copy" as const,
  },
  {
    key: "similar",
    title: "Similar photos",
    desc: "Nearby moments, similar compositions",
    icon: "Images" as const,
  },
  {
    key: "blurry",
    title: "Likely blurry",
    desc: "A gentle nudge to review soft images",
    icon: "Focus" as const,
  },
  {
    key: "large",
    title: "Large videos",
    desc: "Your biggest files, first",
    icon: "Video" as const,
  },
];
export default function Smart() {
  const app = useFlickWell();
  const [filter, setFilter] = useState("exact"),
    [groups, setGroups] = useState<Group[]>([]),
    [blurry, setBlurry] = useState<Media[]>([]);
  useEffect(() => {
    if (!app.ready || !app.pro) return;
    void storage.getValue<Group[]>("groups").then((g) => setGroups(g ?? []));
    void (async () => {
      const found: Media[] = [];
      let offset = 0;
      while (found.length < 100) {
        const rows = await storage.query({
          type: "photo",
          excludeFavorites: !app.prefs.includeFavorites,
          offset,
          limit: 200,
        });
        if (!rows.length) break;
        found.push(...rows.filter((m) => m.scan?.sharpness !== undefined && m.scan.sharpness < 30));
        offset += rows.length;
      }
      setBlurry(found.slice(0, 100));
    })();
  }, [app.revision, app.pro]);
  async function scan() {
    try {
      await app.scanLibrary();
    } catch (e) {
      app.setError((e as Error).message);
    }
  }
  async function openLarge() {
    if (!app.pro) {
      router.push("/paywall");
      return;
    }
    await app.start("large");
    router.push("/(tabs)/swipe");
  }
  return (
    <Page title="A smarter kind of clean" subtitle="Find the clutter. Keep the best moments.">
      <View className="mb-7 rounded-3xl bg-accent p-7">
        <View className="mb-4 flex-row items-center gap-2">
          <Icon name="Sparkles" size={23} className="text-primary" />
          <Text className="text-h5 text-primary">FlickWell Pro</Text>
        </View>
        <Text className="text-h2 text-foreground">Your memories deserve{"\n"}a second look.</Text>
        <Text className="mb-6 mt-4 max-w-lg text-body leading-6 text-muted-foreground">
          Find duplicate files, compare similar shots, and spot likely blur. All analysis stays
          local. Every deletion stays your decision.
        </Text>
        <View className="self-start">
          <Button
            disabled={!app.ready || (!app.stats.total && app.pro)}
            onPress={() => (app.pro ? void scan() : router.push("/paywall"))}
            icon="Sparkles"
          >
            {app.pro
              ? app.scan.status === "paused"
                ? "Resume local scan"
                : "Scan my library"
              : "Explore FlickWell Pro"}
          </Button>
        </View>
        <View className="mt-5 flex-row items-center gap-2">
          <Icon name="LockKeyhole" size={14} className="text-primary" />
          <Text className="text-caption text-muted-foreground">
            Private analysis. No photo uploads.
          </Text>
        </View>
      </View>
      {app.pro && app.scan.status !== "idle" && (
        <View className="mb-6 rounded-2xl border border-border bg-card p-5">
          <View className="flex-row justify-between">
            <Text className="text-h5 text-foreground">
              {app.scan.status === "running"
                ? "Finding your keepers…"
                : app.scan.status === "paused"
                  ? "Scan paused"
                  : "Scan finished"}
            </Text>
            <Text className="text-caption text-muted-foreground">
              {app.scan.processed} / {app.scan.total}
            </Text>
          </View>
          <View className="my-4 h-1.5 rounded-full bg-border">
            <View
              className="h-full rounded-full bg-primary"
              style={{
                width: `${Math.min(100, (app.scan.processed / Math.max(1, app.scan.total)) * 100)}%`,
              }}
            />
          </View>
          <Text className="text-caption text-muted-foreground">
            {app.scan.skipped} inaccessible items skipped. Cloud originals are not downloaded.
          </Text>
          {app.scan.status === "complete" && app.scan.skipped > 0 && (
            <View className="mt-3">
              <Button secondary onPress={() => void repository.retryScanErrors().then(scan)}>
                Retry unavailable items
              </Button>
            </View>
          )}
          {app.scan.status === "running" && (
            <View className="mt-3">
              <Button secondary onPress={app.pauseScan}>
                Pause scan
              </Button>
            </View>
          )}
        </View>
      )}
      <View className="mb-7 flex-row flex-wrap gap-3">
        {tools.map((t) => (
          <Pressable
            key={t.key}
            onPress={() => {
              if (!app.pro) {
                router.push("/paywall");
                return;
              }
              if (t.key === "large") void openLarge();
              else setFilter(t.key);
            }}
            className={`min-w-[145px] flex-1 rounded-2xl border p-5 ${filter === t.key ? "border-primary bg-accent" : "border-border bg-card"}`}
          >
            <Icon name={t.icon} size={25} className="mb-4 text-primary" />
            <Text className="text-h5 text-foreground">{t.title}</Text>
            <Text className="mt-2 text-caption leading-5 text-muted-foreground">{t.desc}</Text>
          </Pressable>
        ))}
      </View>
      <Pressable
        onPress={() => {
          if (!app.stats.total) {
            router.push("/onboarding");
            return;
          }
          void app.start("screenshots").then(() => router.push("/(tabs)/swipe"));
        }}
        className="mb-6 flex-row items-center gap-4 rounded-2xl border border-border bg-card p-5"
      >
        <Icon name="ScanLine" size={24} className="text-primary" />
        <View className="flex-1">
          <Text className="text-h5 text-foreground">Screenshots</Text>
          <Text className="mt-1 text-caption text-muted-foreground">
            A simple cleanup, included for everyone
          </Text>
        </View>
        <Icon name="ArrowRight" className="text-primary" size={20} />
      </Pressable>
      {app.pro ? (
        filter === "blurry" ? (
          <>
            <Text className="mb-3 text-h3 text-foreground">Likely blurry photos</Text>
            {!!blurry.length && (
              <View className="mb-4 self-start">
                <Button
                  onPress={() => void app.start("blurry").then(() => router.push("/(tabs)/swipe"))}
                >
                  Review likely blur
                </Button>
              </View>
            )}
            <Text className="mb-4 text-body leading-6 text-muted-foreground">
              A simple edge-sharpness heuristic, not a verdict. Soft portraits and low-detail images
              may appear here.
            </Text>
            <FlatList
              horizontal
              data={blurry}
              keyExtractor={(m) => m.id}
              contentContainerStyle={horizontalListStyle}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => router.push({ pathname: "/preview", params: { id: item.id } })}
                >
                  <MediaImage media={item} style={blurryThumbStyle} />
                </Pressable>
              )}
              ListEmptyComponent={
                <Text className="text-body text-muted-foreground">
                  No likely blurry photos found in scanned items.
                </Text>
              }
            />
          </>
        ) : (
          <>
            <Text className="mb-4 text-h3 text-foreground">
              {filter === "similar" ? "Similar-photo groups" : "Exact-duplicate groups"}
            </Text>
            <FlatList
              horizontal
              data={groups.filter((g) => g.kind === filter)}
              keyExtractor={(g) => g.id}
              contentContainerStyle={horizontalListStyle}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => router.push({ pathname: "/compare", params: { id: item.id } })}
                  className="w-60 rounded-2xl border border-border bg-card p-5"
                >
                  <Icon name="Images" size={30} className="mb-5 text-primary" />
                  <Text className="text-h5 text-foreground">
                    {item.ids.length} {item.kind === "exact" ? "identical files" : "similar shots"}
                  </Text>
                  <Text className="mt-2 text-body text-primary">Compare and choose</Text>
                </Pressable>
              )}
              ListEmptyComponent={
                <Empty
                  icon="ScanSearch"
                  title={
                    app.scan.status === "complete"
                      ? "No matches found"
                      : "A fresh perspective awaits"
                  }
                  description={
                    app.scan.status === "complete"
                      ? "No matching groups were found among accessible originals."
                      : "Run a local scan to find groups worth reviewing."
                  }
                />
              }
            />
          </>
        )
      ) : (
        <Text className="text-body leading-6 text-muted-foreground">
          Manual swiping, Quick Clean, screenshots, undo, and safe deletion are always free. Pro
          adds local analysis without changing your control over the originals.
        </Text>
      )}
    </Page>
  );
}

const horizontalListStyle = { gap: 12 };

const blurryThumbStyle = { width: 160, height: 180, borderRadius: 18, overflow: "hidden" as const };
