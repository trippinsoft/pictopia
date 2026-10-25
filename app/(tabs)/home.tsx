import { useState, useEffect } from "react";
import { View, Pressable, Platform, FlatList } from "react-native";
import { router } from "expo-router";
import { Page, Text, Icon, Button, Empty, Loading } from "@/components/flickwell/ui";
import { MediaImage } from "@/components/flickwell/media-image";
import { useFlickWell } from "@/components/flickwell/provider";
import { smartSessions, sessionTitle, remainingSeconds } from "@/lib/flickwell/sessions";
import { Collection, SessionMinutes } from "@/lib/flickwell/types";
import { bytes } from "@/lib/flickwell/logic";
const collections = [
  {
    title: "Recent photos",
    icon: "Clock3" as const,
    desc: "Start with the latest",
    key: "recent" as const,
  },
  {
    title: "On this day",
    icon: "CalendarHeart" as const,
    desc: "A little trip down memory lane",
    key: "today" as const,
  },
  {
    title: "Random shuffle",
    icon: "Shuffle" as const,
    desc: "Let a memory surprise you",
    key: "random" as const,
  },
  {
    title: "Large videos",
    icon: "Video" as const,
    desc: "Make room for more",
    key: "large" as const,
  },
];
export default function Home() {
  const app = useFlickWell();
  const [minutes, setMinutes] = useState<SessionMinutes>(5);
  const unfinished = app.session && !app.session.complete;
  useEffect(() => {
    if (app.session?.minutes) setMinutes(app.session.minutes);
  }, [app.session?.id]);
  async function open(c: Collection) {
    if (!app.stats.total) {
      router.push({ pathname: "/onboarding", params: { collection: c, minutes: String(minutes) } });
      return;
    }
    if (unfinished) {
      router.push("/(tabs)/swipe");
      return;
    }
    if (c === "large" && !app.pro) {
      router.push("/paywall");
      return;
    }
    try {
      await app.start(c, minutes);
      router.push("/(tabs)/swipe");
    } catch (e) {
      app.setError((e as Error).message);
    }
  }
  const progress = app.stats.total ? app.stats.reviewed / app.stats.total : 0;
  return (
    <Page title="FlickWell" subtitle="Keep the memories. Lose the clutter.">
      <View className="mb-6 flex-row items-center gap-2">
        <Icon name="ShieldCheck" size={16} className="text-primary" />
        <Text className="text-body text-muted-foreground">Your photos stay yours. Always.</Text>
        <View className="ml-auto rounded-full bg-accent px-3 py-1">
          <Text className="text-caption text-primary">
            {Platform.OS === "web"
              ? "Your selected files"
              : app.permission?.limited
                ? "Limited access"
                : "Private by design"}
          </Text>
        </View>
      </View>
      <View className="mb-7 overflow-hidden rounded-[28px] bg-accent p-7 md:p-9">
        <View className="flex-row items-center justify-between">
          <View className="max-w-lg flex-1">
            <View className="mb-4 flex-row items-center gap-2">
              <Icon name="Zap" size={18} className="text-primary" />
              <Text className="text-h6 text-primary">
                {unfinished ? "Your place is saved" : "A little reset. A lot more room."}
              </Text>
            </View>
            <Text className="text-h1 text-foreground md:text-[42px]">
              {unfinished ? "Welcome back.\nLet’s keep going." : "Less clutter.\nMore keepers."}
            </Text>
            <Text className="mb-6 mt-4 max-w-sm text-body leading-6 text-muted-foreground">
              {unfinished && app.session
                ? `${sessionTitle(app.session.collection)} • ${app.session.reviewed} reviewed. Your next photo is ready.`
                : "A few easy decisions. A few rediscovered memories. A little space for what’s next."}
            </Text>
            {!unfinished && (
              <View
                accessibilityRole="radiogroup"
                accessibilityLabel="Session duration"
                className="mb-5 flex-row gap-2"
              >
                {([2, 5, 10] as SessionMinutes[]).map((value) => (
                  <Pressable
                    key={value}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: minutes === value }}
                    accessibilityLabel={`${value} minutes`}
                    onPress={() => setMinutes(value)}
                    className={`min-h-12 items-center justify-center rounded-full px-5 ${minutes === value ? "bg-primary" : "bg-card"}`}
                  >
                    <Text
                      className={`text-button ${minutes === value ? "text-primary-foreground" : "text-primary"}`}
                    >
                      {value} min
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
            <View className="self-start">
              <Button
                disabled={app.busy || !app.ready}
                onPress={() => void open("quick")}
                icon="ArrowRight"
              >
                {unfinished ? "Resume your session" : `Start a ${minutes}-minute clean`}
              </Button>
            </View>
            <Text className="mt-3 text-caption text-muted-foreground">
              {unfinished && app.session?.minutes
                ? `${Math.ceil(remainingSeconds(app.session) / 60)} min left. The timer pauses while you’re away.`
                : "Quick Wins is free. Nothing is deleted while you swipe."}
            </Text>
          </View>
          <View className="hidden h-48 w-48 items-center justify-center md:flex">
            <View className="absolute h-44 w-36 rotate-12 rounded-3xl bg-primary/20" />
            <View className="h-44 w-36 -rotate-6 items-center justify-center rounded-3xl border-4 border-card bg-primary/10">
              <Icon name="Image" size={65} className="text-primary" />
              <View className="absolute -bottom-3 -right-3 h-14 w-14 items-center justify-center rounded-full bg-primary">
                <Icon name="Check" size={28} className="text-primary-foreground" />
              </View>
            </View>
          </View>
        </View>
      </View>
      <View className="mb-5 rounded-3xl border border-border bg-card p-5">
        <View className="flex-row">
          {[
            {
              value: app.ready ? app.stats.total.toLocaleString() : "—",
              label: "In your library",
              icon: "Images" as const,
            },
            {
              value: app.stats.reviewed.toLocaleString(),
              label: "Reviewed",
              icon: "CircleCheck" as const,
            },
            {
              value: app.stats.pending.toLocaleString(),
              label: "To delete",
              icon: "Trash2" as const,
            },
          ].map((s, i) => (
            <Pressable
              key={s.label}
              onPress={() => (i === 2 ? router.push("/queue") : void open("recent"))}
              className={`flex-1 px-2 ${i ? "border-l border-border" : ""}`}
            >
              <Icon name={s.icon} size={18} className="mb-3 text-muted-foreground" />
              <Text className="text-h2 text-foreground">{s.value}</Text>
              <Text className="mt-1 text-caption text-muted-foreground">{s.label}</Text>
            </Pressable>
          ))}
        </View>
        {!!app.stats.total && (
          <View className="mt-5 border-t border-border pt-4">
            <View className="mb-3 flex-row justify-between">
              <Text className="text-caption text-muted-foreground">
                {Math.round(progress * 100)}% of your library reviewed
              </Text>
              <Text className="text-caption text-primary">
                {bytes(app.stats.pendingBytes)} set aside, estimated
              </Text>
            </View>
            <View className="h-1.5 rounded-full bg-secondary">
              <View
                className="h-full rounded-full bg-primary"
                style={{ width: `${progress * 100}%` }}
              />
            </View>
          </View>
        )}
      </View>
      {!unfinished && (
        <View className="mb-7">
          <Text className="mb-3 text-h3 text-foreground">Smart Sessions</Text>
          <Text className="mb-2 text-body text-muted-foreground">
            Choose the kind of reset you need.
          </Text>
          {smartSessions.map((c) => (
            <Pressable
              key={c.key}
              accessibilityRole="button"
              onPress={() => void open(c.key)}
              className="min-h-20 flex-row items-center gap-4 border-b border-border py-4 active:opacity-70"
            >
              <View className="h-12 w-12 items-center justify-center rounded-2xl bg-accent">
                <Icon name={c.icon} size={23} className="text-primary" />
              </View>
              <View className="flex-1">
                <Text className="text-h5 text-foreground">{c.title}</Text>
                <Text className="mt-1 text-caption leading-5 text-muted-foreground">
                  {c.description}
                </Text>
                {c.key === "best" && (
                  <Text className="mt-1 text-caption text-muted-foreground">
                    Uses on-device Pro scan results
                  </Text>
                )}
              </View>
              <Icon name="ChevronRight" size={19} className="text-muted-foreground" />
            </Pressable>
          ))}
        </View>
      )}
      {unfinished && (
        <Text className="mb-5 text-body text-muted-foreground">
          Finish your current session before starting another. Your collections will still be here.
        </Text>
      )}
      <View className="mb-4 mt-3 flex-row items-center justify-between">
        <Text className="text-h3 text-foreground">Browse your library</Text>
        <Text className="hidden text-caption text-muted-foreground md:flex">
          One photo at a time
        </Text>
      </View>
      <View className="mb-5 flex-row flex-wrap gap-2">
        {collections.map((c) => (
          <Pressable
            key={c.title}
            onPress={() => void open(c.key)}
            className="min-w-[145px] flex-1 rounded-2xl bg-card p-4 active:opacity-70"
          >
            <Icon name={c.icon} size={24} className="mb-2 text-primary" />
            <View className="flex-row items-center gap-2">
              <Text className="text-h5 text-foreground">{c.title}</Text>
              {c.key === "large" && <Icon name="Sparkles" size={13} className="text-primary" />}
            </View>
            <Text className="mt-2 text-caption leading-5 text-muted-foreground">{c.desc}</Text>
          </Pressable>
        ))}
      </View>
      <View className="mb-6 flex-row flex-wrap gap-2">
        {(
          [
            { title: "Screenshots", key: "screenshots" },
            { title: "Videos", key: "videos" },
            { title: "Favorites", key: "favorites" },
          ] as { title: string; key: Collection }[]
        ).map((c) => (
          <Pressable
            key={c.key}
            onPress={() => void open(c.key)}
            className="rounded-full border border-border bg-card px-5 py-3"
          >
            <Text className="text-h6 text-primary">{c.title}</Text>
          </Pressable>
        ))}
      </View>
      <View className="mb-4 flex-row items-center justify-between">
        <Text className="text-h3 text-foreground">Your months, made lighter</Text>
        <Pressable
          disabled={app.busy || !app.ready}
          onPress={() => void app.connect()}
          className="p-2"
        >
          <Text className="text-h6 text-primary">
            {app.busy ? "Connecting…" : Platform.OS === "web" ? "Add photos" : "Refresh library"}
          </Text>
        </Pressable>
      </View>
      {app.busy && (
        <Text className="mb-4 text-body text-muted-foreground">
          {app.syncProgress || "Opening your library…"}
        </Text>
      )}
      {!app.ready ? (
        <Loading />
      ) : app.months.length ? (
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={app.months}
          keyExtractor={(m) => m.key}
          contentContainerStyle={monthListStyle}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => void open(`month:${item.key}`)}
              className="w-56 overflow-hidden rounded-3xl border border-border bg-card"
            >
              <MediaImage uri={item.cover} style={monthCoverStyle} />
              <View className="p-4">
                <Text className="text-h5 text-foreground">
                  {new Date(`${item.key}-15T12:00:00`).toLocaleDateString(undefined, {
                    month: "long",
                    year: "numeric",
                  })}
                </Text>
                <Text className="mb-3 mt-1 text-caption text-muted-foreground">
                  {item.count} {item.count === 1 ? "item" : "items"} •{" "}
                  {item.reviewed === item.count ? "All reviewed" : `${item.reviewed} reviewed`}
                </Text>
                <View className="h-1 rounded-full bg-border">
                  <View
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${(item.reviewed / item.count) * 100}%` }}
                  />
                </View>
              </View>
            </Pressable>
          )}
        />
      ) : (
        <Empty
          title="Your memories belong here"
          description={
            Platform.OS === "web"
              ? "Choose your own photos to try FlickWell in your browser. Camera-roll access and safe device deletion are available in the native app."
              : "Connect your photo library to see your months and start cleaning. Nothing is deleted without your confirmation."
          }
          action={
            <Button onPress={() => router.push("/onboarding")} icon="Plus">
              Connect your photos
            </Button>
          }
        />
      )}
      <View className="mt-6 flex-row items-center justify-center gap-2">
        <Icon name="LockKeyhole" size={14} className="text-muted-foreground" />
        <Text className="text-caption text-muted-foreground">
          No account. No uploads. Just a lighter camera roll.
        </Text>
      </View>
    </Page>
  );
}

const monthListStyle = { gap: 16, paddingBottom: 10 };

const monthCoverStyle = { height: 155 };
