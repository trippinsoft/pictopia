import React, { useEffect, useState } from "react";
import { View, FlatList, Pressable } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, Icon, Button, Empty, Loading } from "@/components/pictopia/ui";
import { usePictopia } from "@/components/pictopia/provider";
import { MediaImage } from "@/components/pictopia/media-image";
import { storage } from "@/services/repository";
import { Decision, Media } from "@/lib/pictopia/types";
import { plural } from "@/lib/pictopia/text";
/** Photos kept or set aside in the current session, from their current decisions. */
export default function SessionReview() {
  const app = usePictopia();
  const params = useLocalSearchParams<{ show?: string }>();
  const [show, setShow] = useState<Decision>(params.show === "keep" ? "keep" : "delete");
  const [items, setItems] = useState<Media[]>(),
    [busy, setBusy] = useState<string>();
  useEffect(() => {
    let alive = true;
    const ids = Array.from(new Set(app.session?.history.map((h) => h.id) ?? []));
    void Promise.all(ids.map((id) => storage.get(id)))
      .then((rows) => {
        if (alive) setItems(rows.filter((m): m is Media => !!m?.active && !!m.decision));
      })
      .catch(() => app.setError("These photos couldn’t load. Please try again."));
    return () => {
      alive = false;
    };
  }, [app.session?.id, app.session?.history.length, app.revision]);
  const kept = items?.filter((m) => m.decision === "keep") ?? [];
  const aside = items?.filter((m) => m.decision === "delete") ?? [];
  const shown = show === "keep" ? kept : aside;
  async function change(m: Media, decision: Decision) {
    setBusy(m.id);
    try {
      await app.changeDecision(m.id, decision);
    } catch (e) {
      app.setError((e as Error).message);
    } finally {
      setBusy(undefined);
    }
  }
  return (
    <SafeAreaView edges={["top", "left", "right"]} className="flex-1 bg-background">
      <View className="mx-auto w-full max-w-4xl flex-1 px-5">
        <View className="my-5 flex-row items-center gap-2">
          <Pressable
            accessibilityLabel="Back"
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/swipe"))}
            className="p-3"
          >
            <Icon name="ArrowLeft" className="text-foreground" />
          </Pressable>
          <View className="flex-1">
            <Text accessibilityRole="header" className="text-h2 text-foreground">
              This session
            </Text>
            <Text className="mt-1 text-body text-muted-foreground">
              Tap a photo to see it larger. Change your mind anytime.
            </Text>
          </View>
        </View>
        <View accessibilityRole="tablist" className="mb-4 flex-row rounded-2xl bg-secondary p-1">
          {(
            [
              ["keep", `Kept · ${kept.length}`],
              ["delete", `Set aside · ${aside.length}`],
            ] as const
          ).map(([value, label]) => (
            <Pressable
              key={value}
              accessibilityRole="tab"
              accessibilityState={{ selected: show === value }}
              onPress={() => setShow(value)}
              className={`min-h-11 flex-1 items-center justify-center rounded-xl ${show === value ? "bg-card" : ""}`}
            >
              <Text
                className={`text-button ${show === value ? "text-foreground" : "text-muted-foreground"}`}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
        {!items ? (
          <Loading />
        ) : (
          <FlatList
            data={shown}
            keyExtractor={(m) => m.id}
            numColumns={3}
            columnWrapperStyle={columnStyle}
            contentContainerStyle={listStyle}
            renderItem={({ item }) => (
              <View
                style={tileStyle}
                className="overflow-hidden rounded-2xl border border-border bg-card"
              >
                <Pressable
                  accessibilityLabel="See this photo larger"
                  onPress={() => router.push({ pathname: "/preview", params: { id: item.id } })}
                >
                  <MediaImage media={item} style={coverStyle} />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={show === "keep" ? "Set aside instead" : "Keep instead"}
                  disabled={busy === item.id}
                  onPress={() => void change(item, show === "keep" ? "delete" : "keep")}
                  className="flex-row items-center justify-center gap-1.5 py-3"
                >
                  <Icon
                    name={show === "keep" ? "X" : "Check"}
                    size={15}
                    className={show === "keep" ? "text-destructive" : "text-primary"}
                  />
                  <Text
                    className={`text-caption ${show === "keep" ? "text-destructive" : "text-primary"}`}
                  >
                    {show === "keep" ? "Set aside" : "Keep"}
                  </Text>
                </Pressable>
              </View>
            )}
            ListEmptyComponent={
              <Empty
                icon={show === "keep" ? "Heart" : "Check"}
                title={show === "keep" ? "Nothing kept yet" : "Nothing set aside"}
                description={
                  show === "keep"
                    ? "Photos you keep in this session will appear here."
                    : "Photos you set aside in this session will appear here before anything is deleted."
                }
              />
            }
          />
        )}
        {show === "delete" && aside.length > 0 && (
          <View className="border-t border-border py-4">
            <Button icon="ArrowRight" onPress={() => router.push("/queue")}>
              {`Review ${plural(aside.length, "item")} for deletion`}
            </Button>
            <Text className="mt-2 text-caption text-center text-muted-foreground">
              Nothing is deleted until you confirm on the next screen.
            </Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const columnStyle = { gap: 10 };
const listStyle = { gap: 10, paddingBottom: 20 };
const coverStyle = { aspectRatio: 1 };
// Fixed thirds keep a lone photo the same size as a full row.
const tileStyle = { width: "31.5%" as const };
